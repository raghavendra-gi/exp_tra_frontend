const DISPLAY_TZ = 'Asia/Kolkata';

/*
 * Intl formatters are expensive to create (toLocaleString() builds a new one on
 * EVERY call). A table of 50 rows used to create ~200 of them per render.
 * These are created once and reused; the output is byte-for-byte identical.
 */
const fmtDateTZ = new Intl.DateTimeFormat('en-IN', {
  timeZone: DISPLAY_TZ, day: '2-digit', month: 'short', year: 'numeric',
});
const fmtDateLocal = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
});
const fmtDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: DISPLAY_TZ, day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
});
const fmtMoney = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function formatDate(iso) {
  if (!iso) return '—';
  if (String(iso).length > 10 && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:/.test(String(iso))) {
    const d = new Date(iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z');
    if (!isNaN(d)) return fmtDateTZ.format(d);
  }
  const p = String(iso).slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return iso;
  return fmtDateLocal.format(new Date(p[0], p[1] - 1, p[2]));
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const s = String(iso).trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)
    ? s.replace(' ', 'T') + 'Z' : s);
  if (isNaN(d)) return '—';
  return fmtDateTime.format(d);
}

/** Same as formatDateTime, but split in two so the time can sit on its own line. */
export function formatDateTimeParts(iso) {
  const full = formatDateTime(iso);
  const m = full.match(/^(.*?)(?:,|\s+at)?\s+(\d{1,2}:\d{2}.*)$/i);
  return m ? { date: m[1], time: m[2] } : { date: full, time: '' };
}

export function formatMoney(amount) {
  const n = Number(amount);
  if (!isFinite(n)) return '—';
  return '₹' + fmtMoney.format(n);
}

export function statusBadgeClass(status) {
  return 'badge-' + String(status || 'pending').toLowerCase().replace(/\s+/g, '');
}

const STATUS_ICONS = {
  'Approved': 'i-check',
  'Pending': 'i-clock',
  'Rejected': 'i-x',
  'In Progress': 'i-route',
};
export function statusIcon(status) {
  return STATUS_ICONS[status] || 'i-info';
}

export const isApproverRole = (user) => user?.role === 'head' || user?.role === 'hr';
