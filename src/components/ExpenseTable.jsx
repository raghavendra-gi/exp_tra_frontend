import { memo } from 'react';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import { formatMoney, formatDate, formatDateTimeParts, statusBadgeClass, statusIcon } from '../utils/format';
import TypeIcon from './TypeIcon';

/*
 * The expense table used by the Dashboard ("Recent expenses") and the expenses page.
 * Rows are memoised: ticking one checkbox or opening a modal no longer
 * re-renders (and re-formats the dates of) every other row.
 * On phones each row becomes a card (see .table rules for max-width:640px).
 */

const initials = (name) => (name || '?').substring(0, 2).toUpperCase();

const ExpenseRow = memo(function ExpenseRow({
  e, showEmployee, selectable, selected, onToggle, onView, onAction, showQuickDecide,
}) {
  const config = EXPENSE_TYPES[e.type];
  const submitted = formatDateTimeParts(e.submitted_date || e.created_date);
  const expenseDate = e.data?.[config?.dateField || 'date'];
  const hasAmount = e.data?.amount !== undefined && e.data?.amount !== '' && e.data?.amount !== null;

  return (
    <tr className={selected ? 'is-selected' : ''} onDoubleClick={() => onView(e)}>
      {selectable && (
        <td className="check-cell c-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={(ev) => onToggle(e.id, ev.target.checked)}
            aria-label={`Select request ${e.id}`}
          />
        </td>
      )}
      <td className="c-id"><span className="row-id">#{e.id}</span></td>
      {showEmployee && (
        <td className="c-emp">
          <span className="person">
            <span className="avatar avatar-sm" aria-hidden="true">{initials(e.employee_name)}</span>
            <span className="person-name">{e.employee_name || 'Unknown'}</span>
          </span>
        </td>
      )}
      <td className="c-type">
        <span className="type-cell">
          <TypeIcon type={e.type} />
          <span className="type-name">{e.type || '—'}</span>
        </span>
      </td>
      <td className="num c-amt">
        {hasAmount ? <span className="amount">{formatMoney(e.data.amount)}</span> : <span className="muted-dash" aria-label="No amount">—</span>}
      </td>
      <td className="c-date">
        <span className="cell-datetime">
          <span className="cell-main">{expenseDate ? formatDate(expenseDate) : 'No date'}</span>
          <span className="cell-sub">Submitted {submitted.date}, {submitted.time}</span>
        </span>
      </td>
      <td className="c-status">
        <span className={`badge ${statusBadgeClass(e.status)}`}>
          <svg className="icon" aria-hidden="true"><use href={`#${statusIcon(e.status)}`} /></svg>
          {e.status}
        </span>
      </td>
      <td className="c-actions">
        <div className="row-actions">
          {showQuickDecide && e.status === 'Pending' && (
            <>
              <button
                type="button"
                className="btn btn-icon btn-approve"
                onClick={() => onAction('approve', e)}
                title="Approve"
                aria-label={`Approve request ${e.id}`}
              >
                <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg>
              </button>
              <button
                type="button"
                className="btn btn-icon btn-reject"
                onClick={() => onAction('reject', e)}
                title="Reject"
                aria-label={`Reject request ${e.id}`}
              >
                <svg className="icon" aria-hidden="true"><use href="#i-x" /></svg>
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onView(e)}
            aria-label={`View request ${e.id}`}
          >
            View
          </button>
        </div>
      </td>
    </tr>
  );
});

function SkeletonRows({ cols, rows = 5 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="skeleton-row" aria-hidden="true">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c}><span className="skeleton" style={{ width: c === 0 ? '40%' : `${55 + ((r * 7 + c * 13) % 35)}%` }} /></td>
      ))}
    </tr>
  ));
}

export default function ExpenseTable({
  id, expenses, loading, isApprover, selectable = false, selectedIds, onToggle,
  onView, onAction, showQuickDecide = false, empty,
  allSelected = false, onToggleAll,
}) {
  const cols = 6 + (isApprover ? 1 : 0) + (selectable ? 1 : 0);
  return (
    <div className="table-wrap" aria-busy={loading || undefined}>
      <table className={`table${selectable ? ' is-selectable' : ''}${isApprover ? ' has-employee' : ''}`} id={id}>
        <thead>
          <tr>
            {selectable && (
              <th className="check-cell">
                {onToggleAll ? (
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all on this page" />
                ) : <span className="sr-only">Select</span>}
              </th>
            )}
            <th scope="col">ID</th>
            {isApprover && <th scope="col">Employee</th>}
            <th scope="col">Type</th>
            <th scope="col" className="num">Amount</th>
            <th scope="col">Expense date</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows cols={cols} />
          ) : expenses.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={cols}>{empty}</td>
            </tr>
          ) : (
            expenses.map((e) => (
              <ExpenseRow
                key={e.id}
                e={e}
                showEmployee={isApprover}
                selectable={selectable}
                selected={selectable ? selectedIds.has(e.id) : false}
                onToggle={onToggle}
                onView={onView}
                onAction={onAction}
                showQuickDecide={showQuickDecide}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Friendly empty state used inside the table. */
export function EmptyState({ icon = 'i-inbox', title, text, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><svg className="icon" aria-hidden="true"><use href={`#${icon}`} /></svg></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}