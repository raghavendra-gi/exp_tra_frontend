import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import TypeIcon from '../components/TypeIcon';
import { EmptyState } from '../components/ExpenseTable';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseActions } from '../hooks/useExpenseActions';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import { formatDateTime } from '../utils/format';
import { formatAccuracy, geoPoints, mapUrl } from '../utils/geo';

/*
 * Location log (approvers only).
 * Lists every location an employee captured with the "Use my current location" button
 * while filing an expense, newest first. Filter by employee and by date to follow one person.
 * It only shows points the employee chose to capture - nothing is tracked in the background.
 */
export default function LocationLogPage() {
  const { expenses, loading, error, reload, upsert, remove } = useExpenses();
  const actions = useExpenseActions({ upsert, remove, reload });

  const [employee, setEmployee] = useState('');
  const [fromDay, setFromDay] = useState('');   // yyyy-mm-dd
  const [toDay, setToDay] = useState('');

  // One row per captured point.
  const all = useMemo(() => {
    const rows = [];
    for (const e of expenses) {
      for (const p of geoPoints(e.data, EXPENSE_TYPES[e.type]?.fields)) {
        rows.push({ e, p, ms: Date.parse(p.at) || 0 });
      }
    }
    return rows.sort((a, b) => b.ms - a.ms || b.e.id - a.e.id);
  }, [expenses]);

  const employees = useMemo(
    () => [...new Set(all.map((r) => r.e.employee_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  const rows = useMemo(() => {
    const from = fromDay ? new Date(`${fromDay}T00:00:00`).getTime() : null;
    const to = toDay ? new Date(`${toDay}T23:59:59.999`).getTime() : null;
    return all.filter((r) => (
      (!employee || r.e.employee_name === employee)
      && (from === null || r.ms >= from)
      && (to === null || r.ms <= to)
    ));
  }, [all, employee, fromDay, toDay]);

  const filtersOn = !!(employee || fromDay || toDay);
  const clear = () => { setEmployee(''); setFromDay(''); setToDay(''); };

  return (
    <Layout title="Location log" subtitle="Where employees captured their location while filing expenses">
      <div className="card card-flush">
        <div className="dash-toolbar" style={{ padding: 'var(--sp-4)' }}>
          <div className="dash-filters" role="group" aria-label="Filters">
            <label className="filter">
              <span className="sr-only">Employee</span>
              <select value={employee} onChange={(e) => setEmployee(e.target.value)} className={employee ? 'is-set' : ''}>
                <option value="">All employees</option>
                {employees.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label className="filter">
              <span className="sr-only">From date</span>
              <input type="date" className="input" value={fromDay} max={toDay || undefined} onChange={(e) => setFromDay(e.target.value)} aria-label="From date" />
            </label>
            <label className="filter">
              <span className="sr-only">To date</span>
              <input type="date" className="input" value={toDay} min={fromDay || undefined} onChange={(e) => setToDay(e.target.value)} aria-label="To date" />
            </label>
            {filtersOn && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
            )}
          </div>
        </div>

        {error && (
          <div className="form-banner banner-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={reload}>Retry</button>
          </div>
        )}

        <div className="result-meta">
          <div aria-live="polite">
            <strong>{rows.length}</strong> captured {rows.length === 1 ? 'location' : 'locations'}
            {employee ? <> for <strong>{employee}</strong></> : null}
          </div>
        </div>

        <div className="table-wrap" aria-busy={loading || undefined}>
          <table className="table" id="locationTable">
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Request</th>
                <th scope="col">Place</th>
                <th scope="col">Captured</th>
                <th scope="col">Accuracy</th>
                <th scope="col"><span className="sr-only">Map</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><span className="skeleton" style={{ width: '50%' }} /></td></tr>
              ) : rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6}>
                    <EmptyState
                      icon="i-pin"
                      title={filtersOn ? 'No locations match these filters' : 'No captured locations yet'}
                      text={filtersOn
                        ? 'Try another employee or date range.'
                        : 'A location appears here when an employee uses the location button while filing an expense.'}
                      action={filtersOn && <button className="btn btn-outline btn-sm" onClick={clear}>Clear filters</button>}
                    />
                  </td>
                </tr>
              ) : rows.map(({ e, p }) => (
                <tr key={`${e.id}-${p.key}`}>
                  <td>{e.employee_name}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.openDetail(e)} aria-label={`Open request ${e.id}`}>
                      <TypeIcon type={e.type} size="sm" /> #{e.id} · {e.type}
                    </button>
                  </td>
                  <td>
                    <div>{p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</div>
                    <div className="field-hint" style={{ marginTop: 2 }}>{p.label}</div>
                  </td>
                  <td>{p.at ? formatDateTime(p.at) : '—'}</td>
                  <td>{p.accuracy != null ? formatAccuracy(p.accuracy) : '—'}</td>
                  <td>
                    <a className="btn btn-outline btn-sm" href={mapUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
                      <svg className="icon" aria-hidden="true"><use href="#i-external" /></svg> Map
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {actions.elements}
    </Layout>
  );
}