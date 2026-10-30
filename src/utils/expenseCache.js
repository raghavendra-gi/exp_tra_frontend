/*
 * In-memory copy of the last expense list, per signed-in user.
 * Lives in its own module so AuthContext can clear it without importing the hook.
 */
let cache = { user: null, data: null };

export const readCache = (user) => (cache.user === user ? cache.data : null);
export const writeCache = (user, data) => { cache = { user, data }; };

/** Call after anything that changes expenses outside the list pages (form, login, logout). */
export function invalidateExpenses() {
  cache = { user: null, data: null };
}
