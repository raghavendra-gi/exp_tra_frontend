import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../AuthContext';
import { expenseAPI } from '../api/client';
import { isApproverRole } from '../utils/format';
import { readCache, subscribeCache } from '../utils/expenseCache';
import {
  configureTracker, syncTracking, resetTracker, openLocationSettings, isNativeApp,
  getConsent, setConsent, subscribeTracker, getTrackerSnapshot,
} from '../utils/tracker';
import Modal from './Modal';

/*
 * Live tracking for employees and clerks. Mounted once (see App.jsx), renders nothing for anyone else.
 *
 *  1. Finds out which of MY trips are In Progress (GET /tracking/active) — on sign-in, whenever the
 *     expense list changes (trip started / ended), when the app comes back to the front, and every 3 minutes.
 *  2. Asks for permission once. Nothing is tracked until the person has agreed.
 *  3. Hands the trip ids to the tracker (utils/tracker.js), which does the GPS work and the uploads.
 *  4. Shows a small status line while a trip is in progress, so the person always knows if tracking is on.
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

export default function TripTracker() {
  const { user } = useAuth();
  const username = user?.username || null;
  const eligible = !!user && !isApproverRole(user);          // employees and clerks file trips

  const snap = useSyncExternalStore(subscribeTracker, getTrackerSnapshot);
  const list = useSyncExternalStore(subscribeCache, () => readCache(username));

  const [tripIds, setTripIds] = useState([]);                // my trips that are In Progress
  const [consent, setConsentState] = useState(null);         // 'granted' | 'declined' | null
  const [askOpen, setAskOpen] = useState(false);
  const [snoozed, setSnoozed] = useState(false);             // closed the dialog without choosing
  const [, setTick] = useState(0);                           // re-renders so "2 min ago" stays true

  /* Who is signed in. */
  useEffect(() => {
    if (!eligible) {
      resetTracker();
      setTripIds([]);
      setConsentState(null);
      setAskOpen(false);
      return;
    }
    configureTracker(username);
    setConsentState(getConsent(username));
    setSnoozed(false);
  }, [eligible, username]);

  /* 1. Which trips are In Progress? The server is the authority. */
  const refresh = useCallback(async () => {
    if (!eligible) return;
    try {
      const res = await expenseAPI('/tracking/active');
      setTripIds((res?.trips || []).map((t) => t.id));
    } catch (err) {
      // Offline or the server is waking up: keep tracking what we already know.
      console.warn('[trip-tracker] could not check active trips:', err?.message || err);
    }
  }, [eligible]);

  // The expense list changes when a trip starts or ends, so look again then (the list is already in memory).
  const inProgressKey = list ? list.filter((e) => e.status === 'In Progress').map((e) => e.id).join(',') : null;
  useEffect(() => { refresh(); }, [refresh, inProgressKey]);

  useEffect(() => {
    if (!eligible) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [eligible, refresh]);

  /* 2 + 3. Track only with consent. */
  useEffect(() => {
    if (!eligible) return;
    if (tripIds.length === 0) { syncTracking([]); setAskOpen(false); return; }
    if (consent === 'granted') { syncTracking(tripIds); setAskOpen(false); return; }
    syncTracking([]);                                         // declined, or not asked yet
    if (consent === null && !snoozed) setAskOpen(true);
  }, [eligible, tripIds, consent, snoozed]);

  /* Keep the "last point … ago" text fresh. */
  useEffect(() => {
    if (!eligible || tripIds.length === 0) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [eligible, tripIds.length]);

  const allow = () => {
    setConsent(username, 'granted');
    setConsentState('granted');
    setAskOpen(false);
  };
  const decline = () => {
    setConsent(username, 'declined');
    setConsentState('declined');
    setAskOpen(false);
  };
  const later = () => { setSnoozed(true); setAskOpen(false); };

  if (!eligible || tripIds.length === 0) return null;

  /* 4. Status line. */
  let tone = 'ok';
  let text;
  let action = null;

  if (consent !== 'granted') {
    tone = 'off';
    text = 'Live tracking is off for your trip.';
    action = (
      <button type="button" className="track-pill-btn" onClick={() => { setSnoozed(false); setAskOpen(true); }}>
        Turn on
      </button>
    );
  } else if (snap.signInNeeded) {
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

  return (
    <>
      <div className={`track-pill is-${tone}`} role="status" aria-live="polite">
        <span className="track-dot" aria-hidden="true" />
        <span className="track-pill-text">{text}</span>
        {action}
      </div>

      <Modal isOpen={askOpen} onClose={later} title="Share your live location?" size="sm">
        <p className="track-ask-lead">
          You have a trip in progress. To follow the trip, this app can share where your phone is while the trip is running.
        </p>
        <ul className="track-ask-list">
          <li>It starts now and stops by itself when you end the trip.</li>
          <li>Only Accounts and the Operation Head can see it.</li>
          <li>
            On Android it keeps working with the screen off. A notification stays on while it runs. When the phone asks for location
            permission, choose <strong>Allow all the time</strong> if it is offered.
          </li>
          <li>Your location is never shared outside a trip.</li>
        </ul>
        <div className="btn-row btn-row-end" style={{ marginTop: 'var(--sp-4)' }}>
          <button type="button" className="btn btn-outline" onClick={decline}>No, don&apos;t track</button>
          <button type="button" className="btn btn-primary" onClick={allow}>Allow tracking</button>
        </div>
      </Modal>
    </>
  );
}
