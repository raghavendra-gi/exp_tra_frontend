import { memo, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { formatMoney, isApproverRole } from '../utils/format';

const STATUSES = [
  { key: 'pending',    status: 'Pending',     label: 'Pending',     hint: 'Awaiting decision' },
  { key: 'approved',   status: 'Approved',    label: 'Approved',    hint: 'Accepted by Clerk / Accounts' },
  { key: 'rejected',   status: 'Rejected',    label: 'Rejected',    hint: 'Sent back with reason' },
  { key: 'inprogress', status: 'In Progress', label: 'In progress', hint: 'Trips not yet ended' },
];

// Accept activeStatus as a prop
function StatusSummary({ expenses, loading = false, title = 'Overview', activeStatus = '' }) {
  const isApprover = isApproverRole(useAuth()?.user);

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

  const pctText = (p) => `${Math.round(p)}%`;

  return (
    <section className={`ledger card${loading ? ' is-loading' : ''}`} aria-label="Expenses by status">
      <div className="ledger-head">
        <h2 className="ledger-title">{title}</h2>
        <p className="ledger-total">
          {loading ? <span className="skeleton" style={{ width: 140 }} /> : (
            <>
              <span>{total} {total === 1 ? 'request' : 'requests'}</span>
              <span className="ledger-sep" aria-hidden="true" />
              <strong>{formatMoney(totalAmount)}</strong>
            </>
          )}
        </p>
      </div>

      <div className="ledger-grid">
        {rows.map((r) => {
          // Determine if this card should be faded out
          const isSilent = activeStatus && activeStatus !== r.status;
          // Determine if this is the currently selected card
          const isSelected = activeStatus === r.status;
          // Default focus for pending if no filter is active
          const isFocused = !activeStatus && isApprover && r.key === 'pending' && r.n > 0;

          return (
            <div
              key={r.key}
              className={`ledger-item${isSilent ? ' is-silent' : ''}${isSelected ? ' is-active' : ''}${isFocused ? ' is-focus' : ''}`}
              data-status={r.key}
              aria-label={`${r.label}: ${r.n} requests, ${formatMoney(r.amt)}`}
            >
              <span className="ledger-top">
                <span className="ledger-label"><span className="ledger-dot" aria-hidden="true" />{r.label}</span>
                {!loading && <span className="ledger-pct">{pctText(r.pct)}</span>}
              </span>
              <span className="ledger-figures">
                <span className="ledger-count">
                  {loading ? <span className="skeleton" style={{ width: 24, height: 20 }} /> : r.n}
                </span>
                <span className="ledger-amount">
                  {loading ? <span className="skeleton" style={{ width: 80 }} /> : formatMoney(r.amt)}
                </span>
              </span>
              <span className="ledger-meter" aria-hidden="true">
                <span style={{ width: loading ? 0 : `${r.pct}%` }} />
              </span>
              <span className="ledger-hint">{r.hint}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default memo(StatusSummary);