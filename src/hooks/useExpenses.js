import { useCallback, useEffect, useRef, useState } from 'react';
import { expenseAPI } from '../api/client';
import { useAuth } from '../AuthContext';
import { readCache, writeCache, invalidateExpenses } from '../utils/expenseCache';

/*
 * Shared expense list for the Dashboard and View Expenses pages.
 *
 *  • Uses ?lite=1, so the list no longer downloads every receipt image
 *    (those come with the single-expense call when a request is opened).
 *  • Keeps the last list in memory per signed-in user. Going Dashboard ⇄
 *    View Expenses shows the list instantly and refreshes it quietly in the
 *    background, instead of a blank "Loading…" each time.
 *  • Approve / reject / delete patch the list in place - no full reload.
 */

export { invalidateExpenses };

/** Drop attachment bytes so a full expense from the API can sit in the lite list. */
export function toLite(expense) {
  if (!expense?.data) return expense;
  const data = {};
  for (const [k, v] of Object.entries(expense.data)) {
    data[k] = Array.isArray(v) && v.some((i) => i && typeof i === 'object' && 'dataUrl' in i)
      ? v.map((i) => {
        if (!i || typeof i !== 'object') return i;
        const { dataUrl, ...rest } = i; // eslint-disable-line no-unused-vars
        return rest;
      })
      : v;
  }
  return { ...expense, data };
}

export function useExpenses() {
  const { user } = useAuth();
  const key = user?.username || null;
  const cached = readCache(key);

  const [expenses, setExpensesState] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;   // StrictMode mounts twice in development
    return () => { alive.current = false; };
  }, []);

  const setExpenses = useCallback((updater) => {
    setExpensesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeCache(key, next);
      return next;
    });
  }, [key]);

  const reload = useCallback(async () => {
    if (!key) return;
    setRefreshing(true);
    try {
      // The backend already limits employees to their own requests.
      const data = await expenseAPI('/expenses?lite=1');
      if (!alive.current) return;
      setExpenses(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      console.error(err);
      if (alive.current) setError(err.message || 'Failed to load expenses.');
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
  }, [key, setExpenses]);

  useEffect(() => { reload(); }, [reload]);

  /** Replace one row with the server's updated copy. */
  const upsert = useCallback((full) => {
    const lite = toLite(full);
    setExpenses((prev) => prev.map((e) => (e.id === lite.id ? lite : e)));
  }, [setExpenses]);

  const remove = useCallback((id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, [setExpenses]);

  return { expenses, loading, refreshing, error, reload, upsert, remove };
}
