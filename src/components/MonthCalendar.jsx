import { memo, useMemo } from 'react';
import { monthGrid, moneyCompact, todayKey, WEEKDAYS } from '../utils/dates';
import { formatMoney } from '../utils/format';

const STATUS_KEY = { 'Pending': 'pending', 'Approved': 'approved', 'Rejected': 'rejected', 'In Progress': 'inprogress' };
const ORDER = ['pending', 'approved', 'rejected', 'inprogress'];

/*
 * Month grid. Each day shows its rupee total and one dot per status present,
 * so a busy day or a rejected claim stands out at a glance. Days from the
 * neighbouring months are shown faded; picking one moves to that month.
 *
 *  byDay     — Map<'YYYY-MM-DD', expense[]> for the visible range
 *  selected  — selected day key
 *  onSelect  — (key, inMonth) => void
 */
function MonthCalendar({ year, month, byDay, selected, onSelect }) {
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  const today = todayKey();

  // Drop a trailing week that is entirely next month.
  const visible = cells.slice(35).some((c) => c.inMonth) ? cells : cells.slice(0, 35);

  return (
    <div className="cal" role="grid" aria-label="Expenses by day">
      <div className="cal-head" role="row">
        {WEEKDAYS.map((d, i) => (
          <span key={d} role="columnheader" className={`cal-wd${i > 4 ? ' is-weekend' : ''}`}>
            <span className="cal-wd-long">{d}</span>
            <span className="cal-wd-short" aria-hidden="true">{d[0]}</span>
          </span>
        ))}
      </div>

      <div className="cal-body" role="rowgroup">
        {visible.map((c) => {
          const list = byDay.get(c.key) || [];
          const total = list.reduce((s, e) => s + (Number(e.data?.amount) || 0), 0);
          const statuses = ORDER.filter((k) => list.some((e) => STATUS_KEY[e.status] === k));
          const isSel = c.key === selected;
          const label = `${c.key}: ${list.length ? `${list.length} ${list.length === 1 ? 'expense' : 'expenses'}, ${formatMoney(total)}` : 'no expenses'}`;
          return (
            <button
              key={c.key}
              type="button"
              role="gridcell"
              className={[
                'cal-cell',
                c.inMonth ? '' : 'is-out',
                c.weekday > 4 ? 'is-weekend' : '',
                c.key === today ? 'is-today' : '',
                isSel ? 'is-selected' : '',
                list.length ? 'has-items' : '',
                c.key > today ? 'is-future' : '',
              ].filter(Boolean).join(' ')}
              aria-selected={isSel}
              aria-label={label}
              onClick={() => onSelect(c.key, c.inMonth)}
            >
              <span className="cal-day">{c.day}</span>
              {list.length > 0 && (
                <>
                  <span className="cal-amt">{total ? moneyCompact(total) : `${list.length}`}</span>
                  <span className="cal-dots" aria-hidden="true">
                    {statuses.map((s) => <i key={s} data-status={s} />)}
                    {list.length > 1 && <span className="cal-n">{list.length}</span>}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default memo(MonthCalendar);