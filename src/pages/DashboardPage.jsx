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
import { formatMoney, formatDate, isApproverRole } from '../utils/format';
import { approvedBillsFor } from '../utils/approvedBills';
import Modal from '../components/Modal';
import '../components/billsTable.css';
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
const STATUS_OPTIONS = ['Pending', 'Query Raised', 'Approved', 'Rejected', 'In Progress'];
const STATUS_TAB = { 'Pending': 'pending', 'Query Raised': 'query', 'Approved': 'approved', 'Rejected': 'rejected', 'In Progress': 'inprogress' };
const TYPE_OPTIONS = Object.keys(EXPENSE_TYPES);

// Backend address. On Vercel set VITE_API_URL (e.g. https://your-backend.onrender.com);
// locally it falls back to the dev server. Trailing slash and a trailing /api are removed.
const API_ROOT = String(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '').replace(/\/api$/, '');

// The login token is not necessarily stored under the key "token".
// Check the common names in both storages (and unwrap JSON if needed).
// If yours is different, add its name to this list.
const TOKEN_KEYS = ['token', 'access_token', 'accessToken', 'authToken', 'jwt', 'et.token', 'et_token'];
function getAuthToken() {
  for (const store of [localStorage, sessionStorage]) {
    for (const k of TOKEN_KEYS) {
      let v = store.getItem(k);
      if (!v) continue;
      try { const j = JSON.parse(v); v = typeof j === 'string' ? j : (j?.access_token || j?.token || v); } catch { /* plain string */ }
      if (v) return v;
    }
  }
  return '';
}

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

  // ── Monthly fund (per employee) ──
  const API = `${API_ROOT}/api/expenses`;
  const [fundData, setFundData] = useState({ total_fund: 0, spent_amount: 0, remaining_amount: 0 });
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [fundInput, setFundInput] = useState('');
  const [fundEmployee, setFundEmployee] = useState('');   // username picked in the modal
  const [fundEmployees, setFundEmployees] = useState([]); // [{ username, display_name }]
  const [billsOpen, setBillsOpen] = useState(false);       // approved bills behind the budget card
  const [billsEmployee, setBillsEmployee] = useState('');   // employee picked inside the bills modal only (does not touch the dashboard filter)

  // The dashboard's employee filter holds a display name; the fund API wants the username.
  const filterUsername = useMemo(() => {
    if (!employee) return '';
    const hit = (expenses || []).find((x) => x.employee_name === employee);
    return hit ? hit.employee_id : '';
  }, [expenses, employee]);

  const approved = useMemo(() => approvedBillsFor(expenses, monthKey(year, month), employee), [expenses, year, month, employee]);
  // The modal has its own employee selection: everyone for the summary chips, one person for the table.
  const approvedEveryone = useMemo(() => approvedBillsFor(expenses, monthKey(year, month), ''), [expenses, year, month]);
  const approvedModal = useMemo(() => approvedBillsFor(expenses, monthKey(year, month), billsEmployee), [expenses, year, month, billsEmployee]);
  const openBills = () => { setBillsEmployee(employee); setBillsOpen(true); };

  const fetchFund = useCallback(async () => {
    try {
      // month is 0-indexed in JS, so we add 1 for the backend.
      // Employees always get their own numbers (the server enforces it);
      // approvers get everyone combined, or the one employee picked in the filter.
      const qs = new URLSearchParams({ year, month: month + 1 });
      if (isApprover && filterUsername) qs.set('employee', filterUsername);
      const res = await fetch(`${API}/fund?${qs}`, { headers: { Authorization: `Bearer ${getAuthToken()}` } });
      if (res.ok) setFundData(await res.json());
    } catch (err) {
      console.error('Failed to fetch fund data', err);
    }
  }, [year, month, isApprover, filterUsername]);

  useEffect(() => { fetchFund(); }, [fetchFund, expenses]); // re-runs when an expense is approved

  const selectedFundEmp = useMemo(
    () => fundEmployees.find((u) => u.username === fundEmployee) || null,
    [fundEmployees, fundEmployee],
  );

  // Picking an employee fills in the amount already set for this month, so it can be edited.
  const pickFundEmployee = (username, list = fundEmployees) => {
    setFundEmployee(username);
    const hit = list.find((u) => u.username === username);
    setFundInput(hit && hit.amount != null ? String(hit.amount) : '');
  };

  const openFundModal = async () => {
    setFundInput('');
    setFundEmployee('');
    setFundEmployees([]);
    setIsFundModalOpen(true);
    try {
      const res = await fetch(`${API}/fund/employees?year=${year}&month=${month + 1}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const list = await res.json();
        setFundEmployees(list);
        if (filterUsername) pickFundEmployee(filterUsername, list);
      } else {
        alert(`Could not load employees (${res.status}).`);
      }
    } catch (err) {
      console.error('Failed to load employees', err);
      alert(`Could not load employees: ${err.message}. Check VITE_API_URL points to your deployed backend.`);
    }
  };

  const handleSaveFund = async () => {
    if (!fundEmployee) { alert('Please select an employee.'); return; }
    const amount = parseFloat(fundInput);
    if (!fundInput || isNaN(amount) || amount < 0) { alert('Please enter a valid amount for the fund.'); return; }

    try {
      const res = await fetch(`${API}/fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ employee_id: fundEmployee, year, month: month + 1, amount }),
      });
      if (res.ok) {
        setIsFundModalOpen(false);
        fetchFund();
      } else {
        const text = await res.text();
        alert(`Error ${res.status}: ${text}`);
      }
    } catch (err) {
      console.error(err);
      alert(`Request failed: ${err.message}`);
    }
  };

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
    <div className="btn-row">
      {user?.role === 'accounts' && (
        <>
          <button className="btn btn-outline btn-sm" onClick={openFundModal}>
            <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
            <span className="btn-text">Set Monthly Fund</span>
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => navigate('/employees/new')}>
            <svg className="icon" aria-hidden="true"><use href="#i-user" /></svg>
            <span className="btn-text">Create Employee</span>
          </button>
        </>
      )}
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/expenses', { state: { tab: 'pending' } })}>
        <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg>
        <span className="btn-text">Review pending</span>
      </button>
    </div>
  ) : (
    <button className="btn btn-primary btn-sm" onClick={() => navigate('/new')}>
      <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
      <span className="btn-text">New expense</span>
    </button>
  );

  const maxCat = data.categories.reduce((m, c) => Math.max(m, c.amt), 0);
  const maxCatN = data.categories.reduce((m, c) => Math.max(m, c.n), 0);

  return (
    <Layout title="Dashboard" headerRight={headerRight}>
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
            activeStatus={status} 
          />

          <div
            className="card mb-4 fund-card"
            role="button"
            tabIndex={0}
            title="Show the approved bills for this month"
            onClick={openBills}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBills(); } }}
          >
            <div className="fund-card-info">
              <h3 className="fund-card-title">Monthly Budget Overview</h3>
              <p className="fund-card-sub">{isApprover
                  ? (employee ? `${employee} · fund for ${monthLabel(year, month)}` : `All employees · fund for ${monthLabel(year, month)}`)
                  : `Your fund for ${monthLabel(year, month)}`}</p>
              <p className="fund-card-link">View approved bills ({approved.rows.length}) ›</p>
            </div>
            <div className="fund-stats">
              <div className="fund-stat">
                <span className="fund-stat-label">Total Fund</span>
                <div className="fund-stat-value">{formatMoney(fundData.total_fund)}</div>
              </div>
              <div className="fund-stat">
                <span className="fund-stat-label">Approved Spent</span>
                <div className="fund-stat-value is-spent">{formatMoney(fundData.spent_amount)}</div>
              </div>
              <div className="fund-stat">
                <span className="fund-stat-label">Remaining Fund</span>
                <div className={`fund-stat-value ${fundData.remaining_amount < 0 ? 'is-spent' : 'is-left'}`}>
                  {formatMoney(fundData.remaining_amount)}
                </div>
              </div>
            </div>
          </div>

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
                  <span data-status="queryraised"><i />Query</span>
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

            {/* ── NEW: Set Fund Modal ── */}
      {isFundModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div className="card" style={{ width: '400px', padding: '24px' }}>
            <h2 style={{ marginTop: 0 }}>Set Monthly Fund</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Choose an employee and enter the budget allocated to them for {monthLabel(year, month)}.</p>
            <select
              value={fundEmployee}
              onChange={(e) => pickFundEmployee(e.target.value)}
              style={{ width: '100%', marginBottom: '12px', padding: '8px' }}
            >
              <option value="">Select employee…</option>
              {fundEmployees.map((u) => (
                <option key={u.username} value={u.username}>
                  {u.display_name} ({u.username}){u.amount != null ? ` — ${formatMoney(u.amount)}` : ' — not set'}
                </option>
              ))}
            </select>
            {selectedFundEmp && (
              <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#64748b' }}>
                {selectedFundEmp.amount != null
                  ? `Current fund for ${monthLabel(year, month)}: ${formatMoney(selectedFundEmp.amount)}`
                  : `No fund set yet for ${monthLabel(year, month)}`}
                {selectedFundEmp.prev_amount != null && ` · Previous month: ${formatMoney(selectedFundEmp.prev_amount)}`}
              </p>
            )}
            <input 
              type="number" 
              className="input" 
              value={fundInput} 
              onChange={e => setFundInput(e.target.value)} 
              placeholder="e.g. 50000" 
              style={{ width: '100%', marginBottom: '16px', padding: '8px' }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setIsFundModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveFund}>{selectedFundEmp && selectedFundEmp.amount != null ? 'Update Fund' : 'Save Fund'}</button>
            </div>
          </div>
        </div>
      )}

      {billsOpen && (
        <Modal
          isOpen
          onClose={() => setBillsOpen(false)}
          size="lg"
          title={`Approved bills · ${monthLabel(year, month)}`}
        >
          <div className="modal-body">
            <p className="field-hint" style={{ margin: '0 0 12px' }}>
              {isApprover ? (billsEmployee || 'All employees') : 'Your approved bills'} · {approvedModal.rows.length} {approvedModal.rows.length === 1 ? 'bill' : 'bills'} · <strong>{formatMoney(approvedModal.total)}</strong>
            </p>

            {isApprover && billsEmployee && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setBillsEmployee('')} style={{ margin: '0 0 12px' }}>
                <svg className="icon rot-l" aria-hidden="true"><use href="#i-chevron" /></svg> Back to all employees
              </button>
            )}

            {isApprover && !billsEmployee && approvedEveryone.byEmployee.length > 1 && (
              <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {approvedEveryone.byEmployee.map((p) => (
                  <li key={p.name} className="badge" style={{ cursor: 'pointer' }} onClick={() => setBillsEmployee(p.name)} title={`Show only ${p.name}`}>
                    {p.name} · {p.n} · {formatMoney(p.amt)}
                  </li>
                ))}
              </ul>
            )}

            {approvedModal.rows.length === 0 ? (
              <div className="day-empty"><span>No approved bills in {monthLabel(year, month)} yet.</span></div>
            ) : (
              <div className="bills-wrap">
                <table className="bills-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      {isApprover && <th scope="col">Employee</th>}
                      <th scope="col">Type</th>
                      <th scope="col" className="bills-date">Date</th>
                      <th scope="col" className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedModal.rows.map((e) => (
                      <tr key={e.id} onClick={() => actions.openDetail(e)}>
                        <td>#{e.id}</td>
                        {isApprover && <td>{e.employee_name || 'Unknown'}</td>}
                        <td><span className="bills-type"><TypeIcon type={e.type} size="sm" />{e.type}</span></td>
                        <td className="bills-date">{formatDate(expenseDateKey(e))}</td>
                        <td className="num"><span className="amount">{formatMoney(e.data?.amount)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={isApprover ? 3 : 2} className="bills-total-label">Total</th>
                      <td className="bills-date" />
                      <td className="num"><strong className="amount">{formatMoney(approvedModal.total)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="route-actions" style={{ padding: '12px 0 0' }}>
              <button type="button" className="btn btn-outline" onClick={() => setBillsOpen(false)} style={{ marginLeft: 'auto' }}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {actions.elements}
    </Layout>
  );
}