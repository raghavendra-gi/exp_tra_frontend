import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { expenseAPI } from './api/client';
import { invalidateExpenses } from './utils/expenseCache';

const AuthContext = createContext(null);

function readStoredUser() {
  try { return JSON.parse(localStorage.getItem('current_user') || 'null'); } catch { return null; }
}

export function AuthProvider({ children }) {
  const hasToken = !!localStorage.getItem('access_token');
  /*
   * Optimistic start: if a token and the saved user exist, show the app straight
   * away and confirm the session with /auth/me in the background. Before, every
   * reload showed "Loading..." until the server answered — up to a minute when a
   * free-tier server was waking up.
   */
  const [user, setUser] = useState(() => (hasToken ? readStoredUser() : null));
  const [loading, setLoading] = useState(() => hasToken && !readStoredUser());

  const clearSession = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    invalidateExpenses();
    setUser(null);
    document.body.classList.remove('logged-in');
  }, []);

  // Restore / verify session on page load
  useEffect(() => {
    if (!localStorage.getItem('access_token')) { setLoading(false); return; }
    if (readStoredUser()) document.body.classList.add('logged-in');
    expenseAPI('/auth/me')
      .then((data) => {
        setUser(data);
        localStorage.setItem('current_user', JSON.stringify(data));
        document.body.classList.add('logged-in');
      })
      .catch((err) => {
        // Only a real 401 ends the session; a sleeping/unreachable server must not sign people out.
        if (!localStorage.getItem('access_token')) clearSession();
        else console.warn('[auth] could not verify session:', err?.message);
      })
      .finally(() => setLoading(false));
  }, [clearSession]);

  /*
   * client.js fires 'auth-error' on any 401 (token expired / invalid). Nothing
   * listened to it, so the app stayed on screen with every request failing.
   * Now it returns to the sign-in page.
   */
  useEffect(() => {
    const onAuthError = () => { if (user) clearSession(); };
    window.addEventListener('auth-error', onAuthError);
    return () => window.removeEventListener('auth-error', onAuthError);
  }, [user, clearSession]);

  const login = useCallback(async (username, password) => {
    const data = await expenseAPI('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    invalidateExpenses();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('current_user', JSON.stringify(data.user));
    setUser(data.user);
    document.body.classList.add('logged-in');
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    // Stop the browser from auto-re-authenticating on the next visit
    if (navigator.credentials?.preventSilentAccess) {
      try { await navigator.credentials.preventSilentAccess(); } catch { /* ignore */ }
    }
  }, [clearSession]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
