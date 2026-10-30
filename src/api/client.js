/**
 * Where is the backend?
 *   • On your computer: nothing to set. '/api' is forwarded by the Vite proxy to http://127.0.0.1:8000
 *   • On Vercel: set  VITE_API_BASE_URL = https://<your-backend>.onrender.com   (Project → Settings → Environment Variables)
 *     then redeploy. "/api" is added for you if you forget it — the backend serves everything under /api.
 */
function resolveApiBase() {
  // either variable name works:  VITE_API_BASE_URL  or  VITE_API_URL
  const raw = String(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '/api';
  return /\/api$/i.test(raw) ? raw : `${raw}/api`;
}
export const API_BASE = resolveApiBase();

const REQUEST_TIMEOUT_MS = 60000;            // a sleeping free-tier server can need ~50 s to wake up
const WAKE_RETRY_DELAYS_MS = [4000, 8000];   // extra tries when the server can't be reached at all

const SERVER_UNREACHABLE =
  'Cannot reach the server. If it was idle it may be waking up (this can take up to a minute) — please try again shortly.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Only these are safe to repeat automatically: reads, and the login call. */
function isSafeToRetry(endpoint, method) {
  return method === 'GET' || endpoint === '/auth/login';
}

async function fetchOnce(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function expenseAPI(endpoint, options = {}) {
  const token = localStorage.getItem('access_token');
  const method = String(options.method || 'GET').toUpperCase();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  const url = `${API_BASE}${endpoint}`;
  const maxTries = isSafeToRetry(endpoint, method) ? WAKE_RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    try {
      response = await fetchOnce(url, { ...options, headers });
      break;                                           // got ANY answer from the server
    } catch (err) {
      // fetch() only throws when there was no HTTP answer at all: server asleep/down, CORS block, offline, timeout
      console.error(`[api] ${method} ${url} failed (try ${attempt + 1}/${maxTries}):`, err);
      if (attempt === maxTries - 1) throw new Error(SERVER_UNREACHABLE);
      await sleep(WAKE_RETRY_DELAYS_MS[attempt]);
    }
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (response.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    window.dispatchEvent(new Event('auth-error')); // Fire an event
    throw new Error((data && data.detail) || 'Session expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error((data && data.detail) || `Request failed (${response.status})`);
  }

  return data;
}
