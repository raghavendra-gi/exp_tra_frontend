import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import StatusSummary from '../components/StatusSummary';
import MonthCalendar from '../components/MonthCalendar';
import DayPanel from '../components/DayPanel';
import ExpenseTable, { EmptyState } from '../components/ExpenseTable';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseActions } from '../hooks/useExpenseActions';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import { formatMoney, isApproverRole } from '../utils/format';
import { expenseDateKey, monthKey, monthLabel, monthShort, parseKey, todayKey } from '../utils/dates';
import TypeIcon from '../components/TypeIcon';

/*
 * One dashboard for both portals, built around a month:
 *   toolbar (month + filters) → month overview → calendar | selected day
 *   → spend by category → that month's expenses.
 * Approvers also filter by employee and can decide from the day panel;
 * employees can file a new expense straight onto the selected day.
 * The chosen month and filters survive navigating away and back (per tab).
 */

const LIST_COUNT = 8;
const CAT_COUNT = 5;
const STORE_KEY = 'et.dashboard.view';
const STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected', 'In Progress'];
const STATUS_TAB = { 'Pending': 'pending', 'Approved': 'approved', 'Rejected': 'rejected', 'In Progress': 'inprogress' };
const TYPE_OPTIONS = Object.keys(EXPENSE_TYPES);

function initialView() {
  const now = new Date();
  const base = { year: now.getFullYear(), month: now.getMonth(), status: '', type: '', employee: '', day: todayKey() };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (saved && Number.isInteger(saved.year) && Number.isInteger(saved.month)) return { ...base, ...saved };
  } catch { /* storage blocked — use defaults */ }
  return base;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isApprover = isApproverRole(user);

  const { expenses, loading, error, reload, upsert, remove } = useExpenses();
  const actions = useExpenseActions({ upsert, remove, reload });

  const [view, setView] = useState(initialView);
  const { year, month, status, type, employee, day } = view;
  const patch = useCallback((p) => setView((v) => ({ ...v, ...p })), []);
  const [allCats, setAllCats] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(view)); } catch { /* ignore */ }
  }, [view]);

  const mk = monthKey(year, month);
  const isCurrentMonth = mk === todayKey().slice(0, 7);

  const goMonth = (delta) => {
    const d = new Date(year, month + delta, 1);
    const key = monthKey(d.getFullYear(), d.getMonth());
    // Land on today when returning to the current month, else the 1st.
    const nextDay = key === todayKey().slice(0, 7) ? todayKey() : `${key}-01`;
    patch({ year: d.getFullYear(), month: d.getMonth(), day: nextDay });
  };
  const goToday = () => {
    const now = new Date();
    patch({ year: now.getFullYear(), month: now.getMonth(), day: todayKey() });
  };
  const selectDay = useCallback((key, inMonth) => {
    if (inMonth) { patch({ day: key }); return; }
    const d = parseKey(key);
    patch({ year: d.getFullYear(), month: d.getMonth(), day: key });
  }, [patch]);

  // ── Data, in one pass per filter change ──
  const data = useMemo(() => {
    const employees = new Set();
    const withKey = [];
    for (const e of expenses) {
      if (e.employee_name) employees.add(e.employee_name);
      if (type && e.type !== type) continue;
      if (employee && e.employee_name !== employee) continue;
      withKey.push({ e, key: expenseDateKey(e) });
    }

    const monthAll = [];          // month, ignoring the status filter (for the overview)
    const byDay = new Map();      // status-filtered, every day (the grid shows a few days either side)
    let pendingAll = 0;
    for (const { e, key } of withKey) {
      if (e.status === 'Pending') pendingAll += 1;
      if (key.startsWith(mk)) monthAll.push(e);
      if (status && e.status !== status) continue;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(e);
    }
    const shown = status ? monthAll.filter((e) => e.status === status) : monthAll;

    const cats = new Map();
    for (const e of shown) {
      const c = cats.get(e.type) || { type: e.type, n: 0, amt: 0 };
      c.n += 1; c.amt += Number(e.data?.amount) || 0;
      cats.set(e.type, c);
    }
    const categories = [...cats.values()].sort((a, b) => b.amt - a.amt || b.n - a.n);

    const list = [...shown].sort((a, b) => expenseDateKey(b).localeCompare(expenseDateKey(a)) || b.id - a.id);

    return {
      employees: [...employees].sort((a, b) => a.localeCompare(b)),
      monthAll, byDay, categories, list,
      shownTotal: shown.reduce((s, e) => s + (Number(e.data?.amount) || 0), 0),
      pendingAll,
    };
  }, [expenses, type, employee, status, mk]);

  const dayItems = useMemo(
    () => [...(data.byDay.get(day) || [])].sort((a, b) => b.id - a.id),
    [data.byDay, day],
  );

  const filtersOn = !!(status || type || employee);
  const clearFilters = () => patch({ status: '', type: '', employee: '' });
  const addOnDay = useCallback((key) => navigate('/new', { state: { presetDate: key } }), [navigate]);

  // ── Header ──
  const firstName = user?.display_name || user?.username || '';
  const subtitle = loading ? '' : isApprover
    ? (data.pendingAll ? `${data.pendingAll} ${data.pendingAll === 1 ? 'request is' : 'requests are'} waiting for your decision` : 'Nothing is waiting for your decision')
    : `Welcome back, ${firstName}`;

  const headerRight = isApprover ? (
    <button className="btn btn-primary btn-sm" onClick={() => navigate('/expenses', { state: { tab: 'pending' } })}>
      <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg>
      <span className="btn-text">Review pending</span>
    </button>
  ) : (
    <button className="btn btn-primary btn-sm" onClick={() => navigate('/new')}>
      <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
      <span className="btn-text">New expense</span>
    </button>
  );

  const maxCat = data.categories.reduce((m, c) => Math.max(m, c.amt), 0);
  const maxCatN = data.categories.reduce((m, c) => Math.max(m, c.n), 0);

  return (
    <Layout title="Dashboard" subtitle={subtitle} headerRight={headerRight}>
      {error && !expenses.length ? (
        <div className="card">
          <div className="form-banner banner-error" role="alert">
            <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
            <span>{error}</span>
          </div>
          <button className="btn btn-primary" onClick={reload}>Try again</button>
        </div>
      ) : (
        <>
          {/* ── Toolbar: month + filters ── */}
          <div className="dash-toolbar">
            <div className="month-nav">
              <button type="button" className="btn btn-icon" onClick={() => goMonth(-1)} aria-label="Previous month">
                <svg className="icon rot-l" aria-hidden="true"><use href="#i-chevron" /></svg>
              </button>
              <h2 className="month-label" aria-live="polite">{monthLabel(year, month)}</h2>
              <button type="button" className="btn btn-icon" onClick={() => goMonth(1)} aria-label="Next month">
                <svg className="icon rot-r" aria-hidden="true"><use href="#i-chevron" /></svg>
              </button>
              {!isCurrentMonth && (
                <button type="button" className="btn btn-outline btn-sm" onClick={goToday}>This month</button>
              )}
            </div>

            <div className="dash-filters" role="group" aria-label="Filters">
              <label className="filter">
                <span className="sr-only">Status</span>
                <select value={status} onChange={(e) => patch({ status: e.target.value })} className={status ? 'is-set' : ''}>
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="filter">
                <span className="sr-only">Category</span>
                <select value={type} onChange={(e) => patch({ type: e.target.value })} className={type ? 'is-set' : ''}>
                  <option value="">All categories</option>
                  {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              {isApprover && (
                <label className="filter">
                  <span className="sr-only">Employee</span>
                  <select value={employee} onChange={(e) => patch({ employee: e.target.value })} className={employee ? 'is-set' : ''}>
                    <option value="">All employees</option>
                    {data.employees.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              {filtersOn && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                  <svg className="icon" aria-hidden="true"><use href="#i-x" /></svg> Clear
                </button>
              )}
            </div>
          </div>

          <StatusSummary
            expenses={data.monthAll}
            loading={loading}
            title={`${monthLabel(year, month)} overview`}
          />

          {/* ── Calendar + selected day ── */}
          <div className="dash-grid">
            <section className="card card-flush cal-card" aria-label="Calendar">
              <div className="panel-head">
                <div className="panel-head-text">
                  <h2 className="panel-title">Calendar</h2>
                  <p className="panel-sub">
                    {data.list.length} in {monthShort(year, month)}{filtersOn ? ' (filtered)' : ''} · <strong className="amount">{formatMoney(data.shownTotal)}</strong>
                  </p>
                </div>
                <div className="cal-legend" aria-hidden="true">
                  <span data-status="pending"><i />Pending</span>
                  <span data-status="approved"><i />Approved</span>
                  <span data-status="rejected"><i />Rejected</span>
                  <span data-status="inprogress"><i />In progress</span>
                </div>
              </div>
              <MonthCalendar year={year} month={month} byDay={data.byDay} selected={day} onSelect={selectDay} />
            </section>

            <div className="dash-aside dash-aside-day">
              <DayPanel
                dayKey={day}
                items={dayItems}
                isApprover={isApprover}
                onView={actions.openDetail}
                onAction={actions.handleAction}
                onAdd={addOnDay}
              />
            </div>
          </div>

          {/* ── The month's expenses + spend by category ── */}
          <div className="dash-grid dash-grid-bottom">
            <section className="card card-flush">
              <div className="card-head">
                <div className="panel-head-text">
                  <h2 className="panel-title">Expenses in {monthLabel(year, month)}</h2>
                  <p className="panel-sub">
                    {data.list.length > LIST_COUNT ? `Latest ${LIST_COUNT} of ${data.list.length}` : `${data.list.length} ${data.list.length === 1 ? 'expense' : 'expenses'}`}
                    {filtersOn ? ' · filtered' : ''}
                  </p>
                </div>
                {!loading && expenses.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate('/expenses', { state: status ? { tab: STATUS_TAB[status] } : undefined })}
                  >
                    View all <svg className="icon" aria-hidden="true"><use href="#i-arrow-right" /></svg>
                  </button>
                )}
              </div>

              <ExpenseTable
                id="recentTable"
                expenses={data.list.slice(0, LIST_COUNT)}
                loading={loading}
                isApprover={isApprover}
                onView={actions.openDetail}
                onAction={actions.handleAction}
                showQuickDecide={isApprover}
                empty={
                  <EmptyState
                    title={filtersOn ? 'Nothing matches these filters' : `Nothing in ${monthLabel(year, month)}`}
                    text={filtersOn
                      ? 'Try a different status, category or employee.'
                      : isApprover ? 'Requests from employees for this month will appear here.' : 'Pick a day on the calendar to add an expense for it.'}
                    action={filtersOn ? (
                      <button className="btn btn-outline btn-sm" onClick={clearFilters}>Clear filters</button>
                    ) : !isApprover && (
                      <button className="btn btn-primary btn-sm" onClick={() => addOnDay(day <= todayKey() ? day : todayKey())}>
                        <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg> New expense
                      </button>
                    )}
                  />
                }
              />
            </section>
            <section className="card card-flush" aria-label="Spend by category">
              <div className="panel-head">
                <div className="panel-head-text">
                  <h2 className="panel-title">By category</h2>
                  <p className="panel-sub">{monthLabel(year, month)}</p>
                </div>
                {type && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ type: '' })}>Show all</button>
                )}
              </div>
              {data.categories.length ? (
                <ul className="cat-list">
                  {(allCats ? data.categories : data.categories.slice(0, CAT_COUNT)).map((c) => {
                    const pct = maxCat ? (c.amt / maxCat) * 100 : (maxCatN ? (c.n / maxCatN) * 100 : 0);
                    return (
                      <li key={c.type}>
                        <button
                          type="button"
                          className={`cat-row${type === c.type ? ' is-active' : ''}`}
                          onClick={() => patch({ type: type === c.type ? '' : c.type })}
                          aria-pressed={type === c.type}
                          title={type === c.type ? 'Remove category filter' : `Show only ${c.type}`}
                        >
                          <TypeIcon type={c.type} size="sm" />
                          <span className="cat-main">
                            <span className="cat-top">
                              <span className="cat-name">{c.type}<span className="cat-n">{c.n}</span></span>
                              <span className="amount">{formatMoney(c.amt)}</span>
                            </span>
                            <span className="cat-bar"><span style={{ width: `${Math.max(pct, 2)}%` }} /></span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="day-empty"><span>No spend recorded this month.</span></div>
              )}
              {data.categories.length > CAT_COUNT && (
                <button type="button" className="cat-more" onClick={() => setAllCats((v) => !v)} aria-expanded={allCats}>
                  {allCats ? 'Show less' : `Show ${data.categories.length - CAT_COUNT} more`}
                </button>
              )}
            </section>
          </div>
        </>
      )}

      {actions.elements}
    </Layout>
  );
}