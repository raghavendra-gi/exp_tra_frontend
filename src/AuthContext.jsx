import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { expenseAPI } from './api/client';
import { invalidateExpenses } from './utils/expenseCache';

const AuthContext = createContext(null);

function readStoredUser() {
  try { return JSON.parse(localStorage.getItem('current_user') || 'null'); } catch { return null; }
}

export function AuthProvider({ children }) {
  const hasToken = !!localStorage.getItem('access_token');
  const [user, setUser] = useState(() => (hasToken ? readStoredUser() : null));
  const [loading, setLoading] = useState(() => hasToken && !readStoredUser());

  const clearSession = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
    invalidateExpenses();
    setUser(null);
    document.body.classList.remove('logged-in');
  }, []);

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
        if (!localStorage.getItem('access_token')) clearSession();
        else console.warn('[auth] could not verify session:', err?.message);
      })
      .finally(() => setLoading(false));
  }, [clearSession]);

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
    if (navigator.credentials?.preventSilentAccess) {
      try { await navigator.credentials.preventSilentAccess(); } catch { /* ignore */ }
    }
  }, [clearSession]);

  const updateUser = useCallback((newData) => {
    setUser(prev => {
      const updated = { ...prev, ...newData };
      localStorage.setItem('current_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ✅ updateUser IS INCLUDED IN THE VALUE
  const value = useMemo(() => ({ user, loading, login, logout, updateUser }), [user, loading, login, logout, updateUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
