/*
 * Live trip tracking — the phone side.
 *
 * What it does
 *   While the signed-in person has a trip In Progress, it follows the phone's GPS and uploads
 *   the points to  POST /api/tracking/pings  in small batches.
 *
 * Where it runs
 *   • Android app (Capacitor): uses the "BackgroundGeolocation" plugin. That plugin runs a
 *     foreground service with a permanent notification, so tracking carries on when the screen
 *     is off or another app is open.
 *   • Browser (or an app build without the plugin): falls back to navigator.geolocation. That
 *     only works while the page is open and on screen.
 *
 * Why it never loses points
 *   Every point goes into a queue that is saved in localStorage first, and is only removed once
 *   the server has accepted it. No signal, server asleep, app restarted → the points wait and are
 *   sent later. The server accepts late points as long as they were recorded during the trip.
 *
 * Android and the network
 *   After about 5 minutes in the background Android slows down web requests made from the WebView.
 *   So inside the Android app the uploads go through Capacitor's NATIVE http client (CapacitorHttp),
 *   which is not affected. In a browser (or if that is missing) the normal fetch is used.
 *
 * The plugins are reached through the global window.Capacitor, so this file (and the website build)
 * does not need the packages to be installed. They only have to be installed for the Android build.
 */
import { expenseAPI, API_BASE } from '../api/client';

const FLUSH_MIN_MS = 20_000;            // normally upload at most every 20 s…
const FLUSH_AT_COUNT = 10;              // …or sooner once this many points are waiting
const SAFETY_FLUSH_MS = 30_000;         // timer that retries anything left over
const MAX_BACKOFF_MS = 10 * 60_000;     // after failures, wait longer (up to 10 min) between tries
const BATCH = 200;                      // server limit per request
const DISTANCE_FILTER_M = 25;           // Android: report after the phone moved this far
const MIN_FIX_GAP_MS = 8_000;           // browser fallback: at most one point per 8 s
const MAX_ACCURACY_M = 150;             // Android app: ignore weaker GPS fixes
const MAX_ACCURACY_BROWSER_M = 1000;    // browser: a computer only knows its position from Wi-Fi/IP (same limit as the server)
const MAX_QUEUE_PER_TRIP = 3000;
const MAX_AGE_MS = 48 * 3600_000;       // the server ignores older points anyway

const queueKey = (u) => `et.track.queue.v1:${u}`;
const consentKey = (u) => `et.track.consent.v1:${u}`;

/* ───────────── consent (asked once per person, remembered on this phone) ───────────── */
export function getConsent(username) {
  try { return localStorage.getItem(consentKey(username)) || null; } catch { return null; }   // 'granted' | 'declined' | null
}
export function setConsent(username, value) {
  try { localStorage.setItem(consentKey(username), value); } catch { /* storage blocked: ask again next time */ }
}

/* ───────────── state ───────────── */
const state = {
  username: null,
  trips: new Set(),          // trip ids being tracked right now
  watcher: null,             // { kind: 'native' | 'web', id }
  starting: false,
  mode: 'off',               // off | background | foreground
  problem: '',               // '' | denied | unsupported | error
  message: '',
  queue: {},                 // tripId -> [{ lat, lng, accuracy, speed, at }]
  lastFixAt: 0,
  lastAcceptedAt: 0,
  lastSentAt: 0,
  lastFlushTry: 0,
  failures: 0,
  flushing: false,
  signInNeeded: false,       // the login expired while tracking: points wait until the person signs in again
};

const listeners = new Set();
let snapshot = null;

const pendingCount = () => Object.values(state.queue).reduce((n, list) => n + list.length, 0);

function buildSnapshot() {
  return {
    active: state.trips.size > 0,
    mode: state.mode,
    problem: state.problem,
    message: state.message,
    lastFixAt: state.lastFixAt,
    lastSentAt: state.lastSentAt,
    pending: pendingCount(),
    signInNeeded: state.signInNeeded,
    tripIds: [...state.trips],
  };
}
function emit() {
  snapshot = buildSnapshot();
  listeners.forEach((fn) => fn());
}
snapshot = buildSnapshot();

/** For useSyncExternalStore. */
export function subscribeTracker(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getTrackerSnapshot() { return snapshot; }

/* ───────────── environment ───────────── */
const capacitor = () => (typeof window !== 'undefined' ? window.Capacitor : undefined);
export const isNativeApp = () => !!capacitor()?.isNativePlatform?.();
const proxies = {};
const plugin = (name) => (proxies[name] ||= capacitor().registerPlugin(name));
const nativePlugin = () => plugin('BackgroundGeolocation');

/* ───────────── queue storage ───────────── */
function persist() {
  if (!state.username) return;
  try {
    const clean = Object.fromEntries(Object.entries(state.queue).filter(([, list]) => list.length));
    if (Object.keys(clean).length) localStorage.setItem(queueKey(state.username), JSON.stringify(clean));
    else localStorage.removeItem(queueKey(state.username));
  } catch { /* storage full or blocked: the in-memory queue still works */ }
}

function loadQueue(username) {
  const out = {};
  try {
    const raw = JSON.parse(localStorage.getItem(queueKey(username)) || '{}');
    const oldest = Date.now() - MAX_AGE_MS;
    for (const [id, list] of Object.entries(raw || {})) {
      const keep = (Array.isArray(list) ? list : []).filter((p) => Date.parse(p?.at) > oldest);
      if (keep.length) out[id] = keep.slice(-MAX_QUEUE_PER_TRIP);
    }
  } catch { /* corrupt entry: start empty */ }
  return out;
}

/* ───────────── uploading ───────────── */
/** Problems that fix themselves: no signal, server waking up (Render answers 502/503 for a while), overloaded. */
const isTransient = (err) =>
  !!err?.transient || /cannot reach the server|Request failed \((5\d\d|408|429)\)/i.test(err?.message || '');
/** The server will never accept this batch as it is (bad request). */
const isPermanent = (err) => !!err?.permanent || /\[object Object\]|Request failed \(4(00|13|22)\)/.test(err?.message || '');

async function postPings(body) {
  const http = isNativeApp() ? plugin('CapacitorHttp') : null;
  if (!http || typeof http.request !== 'function') {
    return expenseAPI('/tracking/pings', { method: 'POST', body: JSON.stringify(body) });
  }

  // Native http: Android does not slow this one down while the app is in the background.
  const token = localStorage.getItem('access_token');
  let res;
  try {
    res = await http.request({
      url: `${API_BASE}/tracking/pings`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      data: body,
      connectTimeout: 60_000,
      readTimeout: 60_000,
    });
  } catch (err) {
    const e = new Error(`Cannot reach the server. ${err?.message || ''}`.trim());
    e.transient = true;
    throw e;
  }

  let data = res?.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* not JSON */ } }
  const status = Number(res?.status) || 0;
  if (status >= 200 && status < 300) return data;

  const detail = data && typeof data.detail === 'string' ? data.detail : '';
  const e = new Error(detail || `Request failed (${status})`);
  if (status === 401) e.authExpired = true;
  else if (status >= 500 || status === 408 || status === 429) e.transient = true;
  else if (status === 400 || status === 413 || status === 422) e.permanent = true;
  throw e;
}

export async function flushNow() {
  if (state.flushing || !state.username) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const ids = Object.keys(state.queue).filter((id) => state.queue[id]?.length);
  if (!ids.length) return;

  state.flushing = true;
  state.lastFlushTry = Date.now();
  let current = null;
  try {
    for (const id of ids) {
      current = id;
      while (state.queue[id]?.length) {
        const batch = state.queue[id].slice(0, BATCH);
        const res = await postPings({ expense_id: Number(id), points: batch });
        state.queue[id] = (state.queue[id] || []).slice(batch.length);   // sent: remove from the queue
        state.lastSentAt = Date.now();
        state.failures = 0;
        state.signInNeeded = false;
        // The trip is over and the server took nothing: nothing later can be accepted either.
        if (res && res.active === false && !res.saved) { state.queue[id] = []; break; }
      }
    }
  } catch (err) {
    state.failures += 1;
    console.warn('[tracker] upload failed:', err?.message || err);
    const msg = err?.message || '';
    if (err?.authExpired) {
      // The login ran out (long trip). Keep every point; they are sent once the person signs in again.
      state.signInNeeded = true;
    } else if (current != null && /trip not found|only employees and clerks/i.test(msg)) {
      // The trip does not exist / is not mine: it will never be accepted, so stop keeping its points.
      delete state.queue[current];
      state.trips.delete(Number(current));
      state.failures = 0;                        // not a connection problem: do not slow down the next upload
    } else if (current != null && !isTransient(err) && isPermanent(err) && state.failures >= 2 && state.queue[current]?.length) {
      // The server refuses this batch for good: drop it so it cannot block the rest.
      state.queue[current] = state.queue[current].slice(BATCH);
      state.failures = 0;
    }
  } finally {
    state.flushing = false;
    persist();
    emit();
  }
}

function maybeFlush() {
  const waiting = pendingCount();
  if (!waiting) return;
  const gap = Date.now() - state.lastFlushTry;
  const wait = state.failures ? Math.min(FLUSH_MIN_MS * 2 ** state.failures, MAX_BACKOFF_MS) : FLUSH_MIN_MS;
  if (gap >= wait || (!state.failures && waiting >= FLUSH_AT_COUNT)) flushNow();
}

/* ───────────── GPS fixes ───────────── */
function handleFix({ lat, lng, accuracy, speed, time }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
  const t = Number.isFinite(time) && time > 0 ? time : Date.now();
  const limit = state.mode === 'foreground' ? MAX_ACCURACY_BROWSER_M : MAX_ACCURACY_M;
  if (Number.isFinite(accuracy) && accuracy > limit) return;               // weak fix
  if (state.mode === 'foreground' && t - state.lastAcceptedAt < MIN_FIX_GAP_MS) return;

  state.lastFixAt = t;
  state.lastAcceptedAt = t;
  state.problem = '';
  const point = {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
    speed: Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 10) / 10 : null,
    at: new Date(t).toISOString(),
  };
  for (const id of state.trips) {
    const list = state.queue[id] || (state.queue[id] = []);
    list.push(point);
    if (list.length > MAX_QUEUE_PER_TRIP) list.splice(0, list.length - MAX_QUEUE_PER_TRIP);
  }
  persist();
  emit();
  maybeFlush();
}

function onNativeFix(location, error) {
  if (error) {
    if (error.code === 'NOT_AUTHORIZED') {
      state.problem = 'denied';
      state.message = 'Location is turned off for this app. Open settings and allow location "All the time".';
    } else {
      state.problem = 'error';
      state.message = error.message || 'Could not read the location.';
    }
    emit();
    return;
  }
  if (!location) return;
  handleFix({
    lat: location.latitude, lng: location.longitude,
    accuracy: location.accuracy, speed: location.speed, time: location.time,
  });
}

/* ───────────── start / stop the GPS watcher ───────────── */
function startWebWatcher() {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    state.problem = 'unsupported';
    state.message = 'This device cannot share its location.';
    return;
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => handleFix({
      lat: pos.coords.latitude, lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy, speed: pos.coords.speed, time: pos.timestamp,
    }),
    (err) => {
      if (err.code === 1) {
        state.problem = 'denied';
        state.message = 'Location is blocked. Allow location for this app in your phone or browser settings.';
      } else {
        state.problem = 'error';
        state.message = 'Waiting for a GPS signal…';
      }
      emit();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 },
  );
  state.watcher = { kind: 'web', id };
  state.mode = 'foreground';
  if (!state.message) state.message = 'Tracking works only while this page stays open.';
}

/** Android 13+: the "tracking is on" notification needs this permission. Optional: skipped if the plugin is not installed. */
async function askNotificationPermission() {
  try {
    const ln = plugin('LocalNotifications');
    const st = await ln.checkPermissions();
    if (st?.display === 'prompt' || st?.display === 'prompt-with-rationale') await ln.requestPermissions();
  } catch { /* plugin not installed or not needed on this Android version */ }
}

async function startWatcher() {
  if (state.watcher || state.starting) return;
  state.starting = true;
  state.problem = '';
  state.message = '';
  try {
    if (isNativeApp()) {
      try {
        await askNotificationPermission();
        const bg = nativePlugin();
        const id = await bg.addWatcher(
          {
            backgroundTitle: 'Trip tracking is on',
            backgroundMessage: 'Your location is shared with Accounts while this trip is in progress.',
            requestPermissions: true,
            stale: false,
            distanceFilter: DISTANCE_FILTER_M,
          },
          onNativeFix,
        );
        if (!state.trips.size) {                       // the trip ended while we were starting up
          try { await bg.removeWatcher({ id }); } catch { /* already gone */ }
          return;
        }
        state.watcher = { kind: 'native', id };
        state.mode = 'background';
        return;
      } catch (err) {
        console.warn('[tracker] background plugin unavailable, using the browser location:', err?.message || err);
        state.message = 'Background tracking is not installed in this build. Tracking works only while the app is open.';
      }
    }
    if (state.trips.size) startWebWatcher();
  } finally {
    state.starting = false;
    emit();
  }
}

async function stopWatcher() {
  const w = state.watcher;
  state.watcher = null;
  state.mode = 'off';
  state.problem = '';
  state.message = '';
  if (!w) return;
  try {
    if (w.kind === 'native') await nativePlugin().removeWatcher({ id: w.id });
    else navigator.geolocation.clearWatch(w.id);
  } catch (err) {
    console.warn('[tracker] could not stop the watcher:', err?.message || err);
  }
}

/* ───────────── public API ───────────── */
let listenersAttached = false;
function attachGlobalListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;
  window.addEventListener('online', () => { flushNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushNow(); });
  setInterval(maybeFlush, SAFETY_FLUSH_MS);
}

/** Call when the signed-in person is known (loads any points still waiting from last time). */
export function configureTracker(username) {
  if (state.username === username) return;
  state.username = username || null;
  state.queue = username ? loadQueue(username) : {};
  state.failures = 0;
  attachGlobalListeners();
  emit();
  if (username && pendingCount()) flushNow();
}

/**
 * Tell the tracker which trips are In Progress right now (an array of trip ids).
 * Empty array = stop tracking (after uploading what is left).
 */
export async function syncTracking(tripIds) {
  const next = new Set((tripIds || []).map(Number).filter(Number.isFinite));
  const same = next.size === state.trips.size && [...next].every((id) => state.trips.has(id));
  state.trips = next;
  if (next.size === 0) {
    await stopWatcher();
    emit();
    flushNow();
    return;
  }
  if (!same) emit();
  await startWatcher();
  flushNow();
}

/** Sign-out: stop the GPS and forget who we were (points still waiting stay on the phone). */
export async function resetTracker() {
  state.trips = new Set();
  await stopWatcher();
  persist();
  state.username = null;
  state.queue = {};
  state.lastFixAt = 0;
  state.lastSentAt = 0;
  emit();
}

/** Android: opens this app's location settings (to choose "Allow all the time"). */
export async function openLocationSettings() {
  if (!isNativeApp()) return false;
  try { await nativePlugin().openSettings(); return true; } catch { return false; }
}
