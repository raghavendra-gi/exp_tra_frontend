import { expenseDateKey } from './dates';

/**
 * The approved bills behind the "Approved Spent" figure of a month.
 *   expenses  the list the dashboard already holds (employees only ever receive their own)
 *   mk        'YYYY-MM' month key
 *   employee  optional employee display name (the dashboard's employee filter)
 *
 * Returns { rows, total, byEmployee } — rows newest first; byEmployee = [{ name, n, amt }] biggest first.
 */
export function approvedBillsFor(expenses, mk, employee = '') {
  const rows = (expenses || []).filter((e) => (
    e.status === 'Approved'
    && expenseDateKey(e).startsWith(mk)
    && (!employee || e.employee_name === employee)
  ));
  rows.sort((a, b) => expenseDateKey(b).localeCompare(expenseDateKey(a)) || b.id - a.id);

  const amount = (e) => Number(e.data?.amount) || 0;
  const people = new Map();
  let total = 0;
  for (const e of rows) {
    total += amount(e);
    const name = e.employee_name || 'Unknown';
    const p = people.get(name) || { name, n: 0, amt: 0 };
    p.n += 1;
    p.amt += amount(e);
    people.set(name, p);
  }
  return { rows, total, byEmployee: [...people.values()].sort((a, b) => b.amt - a.amt || a.name.localeCompare(b.name)) };
}