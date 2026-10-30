import { EXPENSE_TYPES } from '../constants/expenseTypes';

/*
 * Small, dependency-free date helpers for the dashboard calendar.
 * Dates are handled as local 'YYYY-MM-DD' keys, the same shape the form stores.
 */

const pad = (n) => String(n).padStart(2, '0');

export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (y, m) => `${y}-${pad(m + 1)}`;          // m is 0-based
export const todayKey = () => toKey(new Date());

export function parseKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** The date an expense belongs to: its own date field, else the day it was created. */
export function expenseDateKey(e) {
  const field = EXPENSE_TYPES[e.type]?.dateField || 'date';
  const v = e.data?.[field];
  if (v && /^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10);
  const c = e.created_date || e.submitted_date;
  if (!c) return '';
  const s = String(c);
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : toKey(d);
}

/** 6 × 7 grid of day keys covering the month, weeks starting on Monday. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;          // Mon = 0
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { key: toKey(d), day: d.getDate(), inMonth: d.getMonth() === month, weekday: (d.getDay() + 6) % 7 };
  });
}

const fmtMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
const fmtMonthShort = new Intl.DateTimeFormat('en-IN', { month: 'short' });
const fmtDayLong = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDayShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const fmtCompact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export const monthLabel = (y, m) => fmtMonth.format(new Date(y, m, 1));
export const monthShort = (y, m) => fmtMonthShort.format(new Date(y, m, 1));
export const dayLong = (key) => fmtDayLong.format(parseKey(key));
export const dayShort = (key) => fmtDayShort.format(parseKey(key));
/** ₹1.2K, ₹3.4L — Indian short form for tight calendar cells. */
export const moneyCompact = (n) => '₹' + fmtCompact.format(Number(n) || 0);

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];