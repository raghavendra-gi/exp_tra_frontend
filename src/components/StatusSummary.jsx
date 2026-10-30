import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney } from '../utils/format';

/*
 * The status ledger: one strip with the count and rupee total for each status,
 * and a single proportion bar underneath. Each status opens the matching tab
 * on the expenses page.
 */
const STATUSES = [
  { key: 'pending',    status: 'Pending',     label: 'Pending',     hint: 'Waiting for a decision' },
  { key: 'approved',   status: 'Approved',    label: 'Approved',    hint: 'Accepted by Head or HR' },
  { key: 'rejected',   status: 'Rejected',    label: 'Rejected',    hint: 'Sent back with a reason' },
  { key: 'inprogress', status: 'In Progress', label: 'In progress', hint: 'Trips not yet ended' },
];

function StatusSummary({ expenses, loading = false }) {
  const navigate = useNavigate();

  const { total, totalAmount, rows } = useMemo(() => {
    const acc = Object.fromEntries(STATUSES.map((s) => [s.status, { n: 0, amt: 0 }]));
    let sum = 0;
    for (const e of expenses) {
      const amt = Number(e.data?.amount) || 0;
      sum += amt;
      if (acc[e.status]) { acc[e.status].n += 1; acc[e.status].amt += amt; }
    }
    const t = expenses.length;
    return {
      total: t,
      totalAmount: sum,
      rows: STATUSES.map((s) => ({ ...s, ...acc[s.status], pct: t ? (acc[s.status].n / t) * 100 : 0 })),
    };
  }, [expenses]);

  const open = (tab) => navigate('/expenses', { state: { tab } });

  return (
    <section className={`ledger card${loading ? ' is-loading' : ''}`} aria-label="Expenses by status">
      <div className="ledger-head">
        <h2 className="card-heading">Overview</h2>
        <p className="ledger-total">
          {loading ? 'Loading…' : (
            <>
              <strong>{total}</strong> {total === 1 ? 'request' : 'requests'} totalling{' '}
              <strong className="amount">{formatMoney(totalAmount)}</strong>
            </>
          )}
        </p>
      </div>

      <div className="ledger-grid">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            className="ledger-item"
            data-status={r.key}
            onClick={() => open(r.key)}
            aria-label={`${r.label}: ${r.n} requests, ${formatMoney(r.amt)}. Show them`}
          >
            <span className="ledger-label"><span className="ledger-dot" aria-hidden="true" />{r.label}</span>
            <span className="ledger-count">{loading ? <span className="skeleton" style={{ width: 28 }} /> : r.n}</span>
            <span className="ledger-amount amount">{loading ? <span className="skeleton" style={{ width: 90 }} /> : formatMoney(r.amt)}</span>
            <span className="ledger-hint">{r.hint}</span>
          </button>
        ))}
      </div>

      <div className="ledger-bar" aria-hidden="true">
        {!loading && total > 0 && rows.map((r) => (
          r.n ? <span key={r.key} data-status={r.key} style={{ width: `${r.pct}%` }} /> : null
        ))}
      </div>
    </section>
  );
}

export default memo(StatusSummary);
