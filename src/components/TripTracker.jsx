import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../AuthContext';
import { expenseAPI } from '../api/client';
import { isApproverRole } from '../utils/format';
import { readCache, subscribeCache } from '../utils/expenseCache';
import {
  configureTracker, syncTracking, resetTracker, openLocationSettings, isNativeApp,
  getDeviceChoice, setDeviceChoice, hadLegacyConsent,
  askTrackingConsent, clearTrackingAsk, getPendingAsk, subscribeAsk,
  subscribeTracker, getTrackerSnapshot,
} from '../utils/tracker';
import Modal from './Modal';

/*
 * Live tracking for employees and clerks. Mounted once (see App.jsx), renders nothing for anyone else.
 *
 *  • The question "Share your live location?" is asked ONCE PER TRIP, right after the person submits a new trip
 *    to Accounts (the trip form calls askTrackingConsent). It is never asked at sign-in.
 *  • The answer is saved on the server (POST /tracking/consent): Accounts only see trips that were allowed.
 *  • A trip is tracked on this device when the server says "allowed" AND this device is the one that said yes.
 *  • While a trip is tracked a status line shows whether it works. For a trip that is not tracked the line offers
 *    "Turn on", so someone who closed the question or said no can still change their mind.
 *
 * Which trips are In Progress is refreshed on sign-in, whenever the expense list changes (a trip started or ended),
 * when the app comes back to the front, and every 3 minutes.
 */

const REFRESH_MS = 180_000;

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

/** What went wrong when saving the answer, in words a person can act on. */
function explainSaveError(msg) {
  if (/no longer in progress/i.test(msg)) return 'This trip has already ended.';
  if (/cannot reach the server/i.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  if (/not set up on the server/i.test(msg)) return 'Live tracking is not set up on the server yet (a database update is missing). Please tell the Accounts team, then try again.';
  if (/^not found$/i.test(msg)) return 'The server has not been updated for live tracking yet. Please tell the Accounts team, then try again.';
  if (/trip not found/i.test(msg)) return 'This trip could not be found.';
  return `Could not save your answer (${msg || 'unknown error'}). Please try again.`;
}

export default function TripTracker() {
  const { user } = useAuth();
  const username = user?.username || null;
  const eligible = !!user && !isApproverRole(user);          // employees and clerks file trips

  const snap = useSyncExternalStore(subscribeTracker, getTrackerSnapshot);
  const list = useSyncExternalStore(subscribeCache, () => readCache(username));
  const askId = useSyncExternalStore(subscribeAsk, getPendingAsk);   // trip the dialog is about, or null

  const [trips, setTrips] = useState([]);                    // my trips In Progress: { id, tracking }  (tracking: true | false | null)
  const [answered, setAnswered] = useState(0);               // bumped when this device records an answer, to re-evaluate
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [, setTick] = useState(0);                           // re-renders so "2 min ago" stays true

  /* Who is signed in. */
  useEffect(() => {
    if (!eligible) {
      resetTracker();
      clearTrackingAsk();
      setTrips([]);
      return;
    }
    configureTracker(username);
  }, [eligible, username]);

  /* Which of my trips are In Progress, and what did I answer for each? The server is the authority. */
  const refresh = useCallback(async () => {
    if (!eligible) return;
    try {
      const res = await expenseAPI('/tracking/active');
      setTrips((res?.trips || []).map((t) => ({ id: t.id, tracking: t.tracking ?? null })));
    } catch (err) {
      // Offline or the server is waking up: keep tracking what we already know.
      console.warn('[trip-tracker] could not check active trips:', err?.message || err);
    }
  }, [eligible]);

  // The expense list changes when a trip starts or ends, so look again then (the list is already in memory).
  const inProgressKey = list ? list.filter((e) => e.status === 'In Progress').map((e) => e.id).join(',') : null;
  useEffect(() => { refresh(); }, [refresh, inProgressKey]);
  // A question about a trip just opened (the trip was submitted a moment ago): make sure we know about that trip.
  useEffect(() => { if (askId != null) refresh(); }, [askId, refresh]);

  useEffect(() => {
    if (!eligible) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [eligible, refresh]);

  /* Tracked on THIS device = allowed on the server + this device said yes. */
  const legacy = eligible && hadLegacyConsent(username);
  const { trackedIds, offTrips } = useMemo(() => {
    const on = [];
    const off = [];
    for (const t of trips) {
      const mine = getDeviceChoice(username, t.id);
      const here = t.tracking === true && (mine === 'granted' || (legacy && mine === null));
      (here ? on : off).push(t);
    }
    return { trackedIds: on.map((t) => t.id), offTrips: off };
    // `answered` is not read inside, but it changes after this device records an answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, username, legacy, answered]);

  const trackedKey = trackedIds.join(',');
  useEffect(() => {
    if (!eligible) return;
    syncTracking(trackedKey ? trackedKey.split(',').map(Number) : []);
  }, [eligible, trackedKey]);

  /* Keep the "last location … ago" text fresh. */
  useEffect(() => {
    if (!eligible || trackedIds.length === 0) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [eligible, trackedIds.length]);

  /* The answer to the question. */
  const answer = async (allowed) => {
    if (!askId || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await expenseAPI('/tracking/consent', {
        method: 'POST',
        body: JSON.stringify({ expense_id: askId, allowed }),
      });
      setDeviceChoice(username, askId, allowed ? 'granted' : 'declined');
      clearTrackingAsk();
      setAnswered((n) => n + 1);
      await refresh();
    } catch (err) {
      setSaveError(explainSaveError(err?.message || ''));
    } finally {
      setSaving(false);
    }
  };
  const closeQuestion = () => { setSaveError(''); clearTrackingAsk(); };

  if (!eligible) return null;

  /* Status line. */
  let pill = null;
  if (trackedIds.length > 0) {
    let tone = 'ok';
    let text;
    let action = null;
    if (snap.signInNeeded) {
      tone = 'warn';
      text = 'Your sign-in has expired. Open the app and sign in again to keep sending your location.';
    } else if (snap.problem === 'denied') {
      tone = 'bad';
      text = snap.message || 'Location is turned off for this app.';
      if (isNativeApp()) {
        action = <button type="button" className="track-pill-btn" onClick={openLocationSettings}>Open settings</button>;
      }
    } else if (snap.problem) {
      tone = 'warn';
      text = snap.message || 'Waiting for a GPS signal…';
    } else if (snap.mode === 'foreground') {
      tone = 'warn';
      text = snap.message || 'Tracking works only while the app stays open.';
    } else {
      text = snap.lastFixAt ? `Live tracking on · last location ${ago(snap.lastFixAt)}` : 'Live tracking on · finding your location…';
      if (snap.pending > 0) text += ` · ${snap.pending} waiting to send`;
    }
    pill = { tone, text, action };
  } else if (offTrips.length > 0) {
    const first = offTrips[0];
    pill = {
      tone: 'off',
      text: offTrips.length === 1 ? `Live tracking is off for trip #${first.id}.` : `Live tracking is off for ${offTrips.length} trips.`,
      action: (
        <button type="button" className="track-pill-btn" onClick={() => askTrackingConsent(first.id)}>Turn on</button>
      ),
    };
  }

  return (
    <>
      {pill && (
        <div className={`track-pill is-${pill.tone}`} role="status" aria-live="polite">
          <span className="track-dot" aria-hidden="true" />
          <span className="track-pill-text">{pill.text}</span>
          {pill.action}
        </div>
      )}

      <Modal isOpen={askId != null} onClose={closeQuestion} title="Share your live location?" size="sm">
        <p className="track-ask-lead">
          Trip #{askId} was submitted to Accounts. Do you want to share where your phone is while this trip is in progress?
        </p>
        <ul className="track-ask-list">
          <li>Tracking starts when you tap <strong>Allow tracking</strong> and stops by itself when you end the trip.</li>
          <li>Only Accounts and the Operation Head can see it.</li>
          <li>
            On Android it keeps working with the screen off. A notification stays on while it runs. When the phone asks for location
            permission, choose <strong>Allow all the time</strong> if it is offered.
          </li>
          <li>If you say no, your trip is still submitted. You can turn tracking on later while the trip is in progress.</li>
        </ul>
        {saveError && <p className="track-ask-error" role="alert">{saveError}</p>}
        <div className="btn-row btn-row-end" style={{ marginTop: 'var(--sp-4)' }}>
          <button type="button" className="btn btn-outline" onClick={() => answer(false)} disabled={saving}>No, don&apos;t track</button>
          <button type="button" className="btn btn-primary" onClick={() => answer(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Allow tracking'}
          </button>
        </div>
      </Modal>
    </>
  );
}
