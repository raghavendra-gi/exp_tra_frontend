import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import ExpenseTable, { EmptyState } from '../components/ExpenseTable';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseActions } from '../hooks/useExpenseActions';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import { formatMoney, isApproverRole } from '../utils/format';

const PAGE_SIZE = 10;
const TYPE_OPTIONS = Object.keys(EXPENSE_TYPES);

const TABS = [
  { key: 'all', label: 'All', status: '' },
  { key: 'pending', label: 'Pending', status: 'Pending' },
  { key: 'query', label: 'Query', status: 'Query Raised' },
  { key: 'approved', label: 'Approved', status: 'Approved' },
  /*{ key: 'rejected', label: 'Rejected', status: 'Rejected' },*/
  { key: 'inprogress', label: 'In progress', status: 'In Progress' },
];
const STATUS_TO_TAB = Object.fromEntries(TABS.filter((t) => t.status).map((t) => [t.status, t.key]));

/** 1 … 4 5 [6] 7 8 … 20 — never more than ~9 buttons, whatever the page count. */
function pageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push('…a');
  for (let n = from; n <= to; n++) out.push(n);
  if (to < total - 1) out.push('…b');
  out.push(total);
  return out;
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isApprover = isApproverRole(user);

  const { expenses, loading, error, reload, upsert, remove } = useExpenses();
  const actions = useExpenseActions({ upsert, remove, reload });

  // The dashboard's status ledger opens a specific tab.
  const [activeTab, setActiveTab] = useState(() => (TABS.some((t) => t.key === location.state?.tab) ? location.state.tab : 'all'));
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Approvers can narrow the list by category and by employee (same two filters as the dashboard).
  const [typeFilter, setTypeFilter] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');

  // A sidebar shortcut (Awaiting review, Needs fixing…) while already on this page.
  const navTab = location.state?.tab;
  const [seenKey, setSeenKey] = useState(location.key);
  if (seenKey !== location.key) {
    setSeenKey(location.key);
    const next = TABS.some((t) => t.key === navTab) ? navTab : 'all';
    if (next !== activeTab) { setActiveTab(next); setPage(1); setSelectedIds(new Set()); }
  }

  const employeeOptions = useMemo(
    () => [...new Set(expenses.map((e) => e.employee_name).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [expenses],
  );

  // The category / employee filters apply first, so the tab counts and the total follow them.
  const scoped = useMemo(() => {
    if (!isApprover || (!typeFilter && !employeeFilter)) return expenses;
    return expenses.filter((e) => (!typeFilter || e.type === typeFilter) && (!employeeFilter || e.employee_name === employeeFilter));
  }, [expenses, isApprover, typeFilter, employeeFilter]);

  // One pass for every tab count, instead of one filter() per tab per render.
  const counts = useMemo(() => {
    const c = { all: scoped.length, pending: 0, query: 0, approved: 0, rejected: 0, inprogress: 0 };
    for (const e of scoped) {
      const k = STATUS_TO_TAB[e.status];
      if (k) c[k] += 1;
    }
    return c;
  }, [scoped]);

  const statusForTab = TABS.find((t) => t.key === activeTab)?.status || '';

  const { filtered, totalAmount } = useMemo(() => {
    const list = statusForTab ? scoped.filter((e) => e.status === statusForTab) : scoped;
    const sum = list.reduce((s, e) => s + (Number(e.data?.amount) || 0), 0);
    return { filtered: list, totalAmount: sum };
  }, [scoped, statusForTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const slice = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe],
  );

  const toggleSelect = useCallback((id, on) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const allOnPageSelected = slice.length > 0 && slice.every((e) => selectedIds.has(e.id));
  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      slice.forEach((e) => (allOnPageSelected ? next.delete(e.id) : next.add(e.id)));
      return next;
    });
  };

  const changeTab = (key) => { setActiveTab(key); setPage(1); clearSelection(); };
  const changeType = (v) => { setTypeFilter(v); setPage(1); clearSelection(); };
  const changeEmployee = (v) => { setEmployeeFilter(v); setPage(1); clearSelection(); };
  const filtersOn = !!(typeFilter || employeeFilter);
  const clearFilters = () => { setTypeFilter(''); setEmployeeFilter(''); setPage(1); clearSelection(); };

  const filterControls = (
    <div className="dash-filters exp-filters" role="group" aria-label="Filters">
      <label className="filter">
        <span className="sr-only">Category</span>
        <select value={typeFilter} onChange={(e) => changeType(e.target.value)} className={typeFilter ? 'is-set' : ''}>
          <option value="">All categories</option>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label className="filter">
        <span className="sr-only">Employee</span>
        <select value={employeeFilter} onChange={(e) => changeEmployee(e.target.value)} className={employeeFilter ? 'is-set' : ''}>
          <option value="">All employees</option>
          {employeeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {filtersOn && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
          <svg className="icon" aria-hidden="true"><use href="#i-x" /></svg> Clear
        </button>
      )}
    </div>
  );

  const bulkDecide = (status) => {
    const byId = new Map(expenses.map((e) => [e.id, e]));
    const ids = [...selectedIds].filter((id) => {
      const e = byId.get(id);
      return e && e.status !== 'In Progress' && e.status !== 'Query Raised' && e.status !== status;
    });
    if (!ids.length) {
      toast('Nothing to update in the selection.', 'info');
      return;
    }
    actions.requestBulk(status, ids, clearSelection);
  };

  const headerRight = !isApprover ? (
    <button className="btn btn-primary btn-sm" onClick={() => navigate('/new')}>
      <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
      <span className="btn-text">New expense</span>
    </button>
  ) : (
    <div className="exp-filters-head">{filterControls}</div>   // the category / employee filters live in the page header only
  );

  const activeLabel = TABS.find((t) => t.key === activeTab)?.label.toLowerCase();

  return (
    <Layout
      title={isApprover ? 'All expenses' : 'My expenses'}
      headerRight={headerRight}
    >
      <div className="card card-flush">
        <div className="tabs" role="tablist" aria-label="Expense status">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              className="tab-btn"
              aria-selected={activeTab === t.key}
              onClick={() => changeTab(t.key)}
            >
              {t.label} <span className="tab-count">{loading ? '–' : counts[t.key]}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="form-banner banner-error" role="alert">
            <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
            <span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={reload}>Retry</button>
          </div>
        )}

        {isApprover && selectedIds.size > 0 && (
          <div className="bulk-bar show" role="region" aria-label="Bulk actions">
            <span className="count">{selectedIds.size} selected</span>
            <div className="btn-row" style={{ marginLeft: 'auto' }}>
              <button className="btn btn-success btn-sm" onClick={() => bulkDecide('Approved')}>
                <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg> Approve selected
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => bulkDecide('Rejected')}>
                <svg className="icon" aria-hidden="true"><use href="#i-x" /></svg> Reject selected
              </button>
              <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
            </div>
          </div>
        )}

        <div className="result-meta">
          <div aria-live="polite">
            <strong>{filtered.length}</strong> {filtered.length === 1 ? 'expense' : 'expenses'}, <strong className="amount">{formatMoney(totalAmount)}</strong> in total
          </div>
          {isApprover && slice.length > 0 && !loading && (
            <label className="select-page show-sm">
              <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectPage} />
              Select page
            </label>
          )}
        </div>

        <ExpenseTable
          id="listTable"
          expenses={slice}
          loading={loading}
          isApprover={isApprover}
          selectable={isApprover}
          selectedIds={selectedIds}
          onToggle={toggleSelect}
          onView={actions.openDetail}
          onAction={actions.handleAction}
          showQuickDecide={isApprover}
          allSelected={allOnPageSelected}
          onToggleAll={toggleSelectPage}
          empty={
            <EmptyState
              icon={activeTab === 'all' ? 'i-inbox' : 'i-filter'}
              title={filtersOn ? 'Nothing matches these filters' : activeTab === 'all' ? 'No expenses yet' : `No ${activeLabel} expenses`}
              text={filtersOn ? 'Try a different category or employee.' : activeTab === 'all' ? (isApprover ? 'Requests from employees will appear here.' : 'Submit a bill or start a trip, and it will show up here.') : 'Try another tab.'}
              action={activeTab === 'all' && !isApprover && (
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/new')}>
                  <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg> New expense
                </button>
              )}
            />
          }
        />

        {totalPages > 1 && (
          <nav className="pager" aria-label="Pagination">
            <button onClick={() => setPage(pageSafe - 1)} disabled={pageSafe === 1} aria-label="Previous page">‹</button>
            {pageList(pageSafe, totalPages).map((n) => (typeof n === 'number' ? (
              <button key={n} onClick={() => setPage(n)} aria-current={n === pageSafe ? 'page' : undefined}>
                {n}
              </button>
            ) : (
              <span key={n} className="pager-gap" aria-hidden="true">…</span>
            )))}
            <button onClick={() => setPage(pageSafe + 1)} disabled={pageSafe === totalPages} aria-label="Next page">›</button>
            <span className="pager-info">{filtered.length} total</span>
          </nav>
        )}
      </div>

      {actions.elements}
    </Layout>
  );
}