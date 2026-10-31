import { memo } from 'react';
import { dayLong, todayKey } from '../utils/dates';
import { formatMoney, statusBadgeClass, statusIcon } from '../utils/format';
import TypeIcon from './TypeIcon';

/*
 * Everything filed on the selected calendar day, plus — for employees — a
 * shortcut to file a new expense dated that day.
 */
function DayPanel({ dayKey, items, isApprover, onView, onAction, onAdd }) {
  const total = items.reduce((s, e) => s + (Number(e.data?.amount) || 0), 0);
  const isFuture = dayKey > todayKey();

  return (
    <section className="card card-flush day-panel" aria-label={`Expenses on ${dayLong(dayKey)}`}>
      <div className="panel-head">
        <div className="panel-head-text">
          <h2 className="panel-title">{dayLong(dayKey)}</h2>
          <p className="panel-sub">
            {items.length
              ? <>{items.length} {items.length === 1 ? 'expense' : 'expenses'} · <strong className="amount">{formatMoney(total)}</strong></>
              : 'No expenses on this day'}
          </p>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="day-list">
          {items.map((e) => {
            const hasAmount = e.data?.amount !== undefined && e.data?.amount !== '' && e.data?.amount !== null;
            return (
              <li key={e.id} className="day-item">
                <button type="button" className="day-item-main" onClick={() => onView(e)}>
                  <TypeIcon type={e.type} />
                  <span className="day-item-text">
                    <span className="day-item-title">{e.type} <span className="row-id">#{e.id}</span></span>
                    <span className="day-item-sub">
                      {isApprover ? (e.employee_name || 'Unknown') : (Array.isArray(e.data?.items) ? e.data.items.join(', ') : (e.data?.remarks || ''))}
                    </span>
                  </span>
                  <span className="day-item-end">
                    <span className="amount">{hasAmount ? formatMoney(e.data.amount) : '—'}</span>
                    <span className={`badge badge-sm ${statusBadgeClass(e.status)}`}>
                      <svg className="icon" aria-hidden="true"><use href={`#${statusIcon(e.status)}`} /></svg>
                      {e.status}
                    </span>
                  </span>
                </button>
                
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="day-empty">
          <svg className="icon" aria-hidden="true"><use href="#i-calendar" /></svg>
          <span>{isApprover ? 'Nothing was claimed for this day.' : isFuture ? 'This day is still ahead.' : 'You haven’t claimed anything for this day.'}</span>
        </div>
      )}

      {!isApprover && (
        <div className="panel-foot">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => onAdd(dayKey)}
            disabled={isFuture}
            title={isFuture ? 'Expenses can only be filed for today or earlier' : undefined}
          >
            <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
            Add expense for this day
          </button>
        </div>
      )}
    </section>
  );
}

export default memo(DayPanel);