/*
 * In-memory copy of the last expense list, per signed-in user.
 * Lives in its own module so AuthContext can clear it without importing the hook.
 * Components outside the list pages (the sidebar's count badges) subscribe to it.
 */
let cache = { user: null, data: null };
const listeners = new Set();
// Deferred: writes can happen inside a React state updater, and subscribers
// must not be updated while another component is rendering.
let queued = false;
const notify = () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; listeners.forEach((fn) => fn()); });
};

export const readCache = (user) => (cache.user === user ? cache.data : null);
export const writeCache = (user, data) => { cache = { user, data }; notify(); };

/** Call after anything that changes expenses outside the list pages (form, login, logout). */
export function invalidateExpenses() {
  cache = { user: null, data: null };
  notify();
}

/** For useSyncExternalStore. */
export function subscribeCache(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}