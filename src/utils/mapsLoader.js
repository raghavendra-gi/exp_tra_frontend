/**
 * Google Maps JavaScript SDK loader.
 *
 * What was wrong before:
 *   1. One slow / failed load was cached forever → every "try again" failed
 *      instantly until the page was reloaded.
 *   2. 15 s was too short for slow networks, and the timeout error took the
 *      whole route feature down even though the Routes REST API doesn't need
 *      the SDK at all.
 *
 * Now: failures are never cached, the timeout is 30 s, a still-downloading
 * <script> is re-used instead of being added twice, and the shared error codes /
 * messages live here so every component reports problems the same way.
 */

const SCRIPT_ID = 'google-maps-sdk';
const CALLBACK_NAME = '__onGoogleMapsReady';
const LOAD_TIMEOUT_MS = 30000;

/* ── errors ─────────────────────────────────────────────────────────────── */
export class MapsError extends Error {
  constructor(code, detail) {
    super(detail || code);
    this.name = 'MapsError';
    this.code = code;
  }
}

export const MAPS_MESSAGES = {
  NO_KEY:           'Automatic distance is off — no Google Maps API key is configured. Type the kilometres in yourself.',
  LOAD_FAILED:      'Could not reach Google Maps. Check your connection, or type the kilometres in yourself.',
  TIMEOUT:          'Google Maps did not respond in time. Try again, or type the kilometres in yourself.',
  AUTH:             'Google Maps rejected this API key. Check the key, its website restrictions and that billing is on.',
  ZERO_RESULTS:     'No driving route exists between those two places. Type the kilometres in yourself.',
  NOT_FOUND:        'One of those locations could not be found. Pick a suggestion from the list.',
  OVER_QUERY_LIMIT: 'This key has used up its Google Maps quota. Type the kilometres in yourself.',
  REQUEST_DENIED:   'Google Maps denied the request — the Routes API (or Directions API) may not be enabled for this key.',
  UNAVAILABLE:      'The routing service is not available for this API key.',
  GENERIC:          'Could not work out the route. Type the kilometres in yourself.',
};

export function normalizeMapsCode(code) {
  const s = String(code || 'GENERIC').toUpperCase();
  if (s === 'PERMISSION_DENIED' || s === 'REQUEST_DENIED') return 'REQUEST_DENIED';
  if (s === 'UNAUTHENTICATED') return 'AUTH';
  if (s === 'RESOURCE_EXHAUSTED' || s === 'OVER_QUERY_LIMIT') return 'OVER_QUERY_LIMIT';
  return s;
}

/** Turn any error into a sentence a person can act on. */
export function mapsErrorMessage(err) {
  const code = normalizeMapsCode(err && err.code);
  const base = MAPS_MESSAGES[code] || MAPS_MESSAGES.GENERIC;
  const detail = err && err.message;
  return code === 'GENERIC' && detail && detail !== 'GENERIC' ? `${base} (${detail})` : base;
}

/* ── API key ────────────────────────────────────────────────────────────── */
export function getMapsKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_KEY || '').trim();
}
export function hasMapsKey() {
  return getMapsKey().length > 10;
}

/* ── Google calls window.gm_authFailure when the key is invalid / restricted ── */
let authFailed = false;
if (typeof window !== 'undefined') {
  window.gm_authFailure = () => {
    authFailed = true;
    console.error('[maps] Google rejected the API key (gm_authFailure). Check key restrictions, enabled APIs and billing.');
  };
}
export function mapsAuthFailed() {
  return authFailed;
}

/* ── loader ─────────────────────────────────────────────────────────────── */
let loadPromise = null;

export function loadGoogleMaps() {
  if (loadPromise) return loadPromise;

  const p = new Promise((resolve, reject) => {
    const key = getMapsKey();
    if (key.length <= 10) { reject(new MapsError('NO_KEY')); return; }

    if (window.google?.maps?.importLibrary) {
      resolve(window.google.maps);
      return;
    }

    const timer = setTimeout(() => reject(new MapsError('TIMEOUT')), LOAD_TIMEOUT_MS);

    window[CALLBACK_NAME] = () => {
      clearTimeout(timer);
      try { delete window[CALLBACK_NAME]; } catch { window[CALLBACK_NAME] = undefined; }
      resolve(window.google.maps);
    };

    /* An earlier attempt may still be downloading (it only timed out on OUR side).
       Re-use that <script> — including the SDK twice breaks Google Maps. A script
       that genuinely errored removes itself below, so the next attempt starts clean. */
    if (document.getElementById(SCRIPT_ID)) return;

    const params = new URLSearchParams({
      key,
      v: 'weekly',
      language: 'en',
      region: 'IN',
      loading: 'async',
      callback: CALLBACK_NAME,
    });

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      reject(new MapsError('LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });

  loadPromise = p;
  /* IMPORTANT: never cache a failure, so "Try again" really tries again. */
  p.catch(() => { if (loadPromise === p) loadPromise = null; });
  return p;
}
