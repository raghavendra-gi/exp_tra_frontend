import { useMemo, useState } from 'react';
import Layout from '../components/Layout';
import TypeIcon from '../components/TypeIcon';
import { EmptyState } from '../components/ExpenseTable';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseActions } from '../hooks/useExpenseActions';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import { formatDateTime } from '../utils/format';
import { formatAccuracy, geoPoints, mapUrl } from '../utils/geo';
import TripRouteModal from '../components/TripRouteModal';

/*
 * Location log (approvers only).
 * Lists every location an employee captured with the "Use my current location" button
 * while filing an expense, newest first. Filter by employee and by one date to follow one person.
 * For a trip's start location, "Route" opens a map with the route from that exact point to the
 * trip's destination. It only shows points the employee chose to capture - nothing is tracked
 * in the background.
 */
export default function LocationLogPage() {
  const { expenses, loading, error, reload, upsert, remove } = useExpenses();
  const actions = useExpenseActions({ upsert, remove, reload });

  const [employee, setEmployee] = useState('');
  const [day, setDay] = useState('');           // yyyy-mm-dd — one date, or empty for all
  const [tripView, setTripView] = useState(null);  // the trip whose route is open

  // One row per captured point.
  const all = useMemo(() => {
    const rows = [];
    for (const e of expenses) {
      for (const p of geoPoints(e.data, EXPENSE_TYPES[e.type]?.fields)) {
        // A trip's start point has a matching "route" field (from -> to, startLocation -> endLocation).
        const routeField = (EXPENSE_TYPES[e.type]?.fields || []).find(
          (f) => f.type === 'route' && `${f.fromKey}Geo` === p.key,
        );
        const destination = routeField ? String(e.data?.[routeField.toKey] || '').trim() : null;
        rows.push({ e, p, ms: Date.parse(p.at) || 0, isTripStart: !!routeField, destination });
      }
    }
    return rows.sort((a, b) => b.ms - a.ms || b.e.id - a.e.id);
  }, [expenses]);

  const employees = useMemo(
    () => [...new Set(all.map((r) => r.e.employee_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [all],
  );

  const rows = useMemo(() => {
    const from = day ? new Date(`${day}T00:00:00`).getTime() : null;
    const to = day ? new Date(`${day}T23:59:59.999`).getTime() : null;
    return all.filter((r) => (
      (!employee || r.e.employee_name === employee)
      && (from === null || (r.ms >= from && r.ms <= to))
    ));
  }, [all, employee, day]);

  const filtersOn = !!(employee || day);
  const clear = () => { setEmployee(''); setDay(''); };

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
              <span className="sr-only">Date</span>
              <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
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
          <table className="table loc-table" id="locationTable">
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
                        ? 'Try another employee or date.'
                        : 'A location appears here when an employee uses the location button while filing an expense.'}
                      action={filtersOn && <button className="btn btn-outline btn-sm" onClick={clear}>Clear filters</button>}
                    />
                  </td>
                </tr>
              ) : rows.map(({ e, p, isTripStart, destination }) => (
                <tr key={`${e.id}-${p.key}`}>
                  <td className="c-emp">{e.employee_name}</td>
                  <td className="c-req">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => actions.openDetail(e)} aria-label={`Open request ${e.id}`}>
                      <TypeIcon type={e.type} size="sm" /> #{e.id} · {e.type}
                    </button>
                  </td>
                  <td className="c-place">
                    <div>{p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</div>
                    <div className="field-hint" style={{ marginTop: 2 }}>{p.label}</div>
                    {isTripStart && (
                      <div className="field-hint" style={{ marginTop: 2 }}>
                        {destination ? <>Going to: <strong>{destination}</strong></> : 'Trip in progress — destination not entered yet'}
                      </div>
                    )}
                  </td>
                  <td className="c-captured">{p.at ? formatDateTime(p.at) : '—'}</td>
                  <td className="c-acc">{p.accuracy != null ? formatAccuracy(p.accuracy) : '—'}</td>
                  <td className="c-actions">
                    <div className="btn-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                      {isTripStart && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setTripView({
                            title: `#${e.id} · ${e.type} route`,
                            employee: e.employee_name,
                            label: p.label,
                            address: p.address,
                            start: { lat: p.lat, lng: p.lng, accuracy: p.accuracy, at: p.at },
                            destination,
                          })}
                        >
                          <svg className="icon" aria-hidden="true"><use href="#i-route" /></svg> Route
                        </button>
                      )}
                      <a className="btn btn-outline btn-sm" href={mapUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
                        <svg className="icon" aria-hidden="true"><use href="#i-external" /></svg> Map
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {tripView && <TripRouteModal trip={tripView} onClose={() => setTripView(null)} />}
      {actions.elements}
    </Layout>
  );
}