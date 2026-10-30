import { memo, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { isApproverRole } from '../utils/format';
import { readCache, subscribeCache } from '../utils/expenseCache';

const ROLE_LABEL = { head: 'Head', hr: 'HR', employee: 'Employee' };

/*
 * Navigation in two groups:
 *   Workspace — dashboard and the full list
 *   Queues    — shortcuts into the list with live counts (what needs attention)
 * Counts come from the shared in-memory expense list, so they update as soon
 * as anything is approved, rejected, filed or deleted — no extra request.
 */
function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isApprover = isApproverRole(user);

  const list = useSyncExternalStore(subscribeCache, () => readCache(user?.username || null));
  const counts = useMemo(() => {
    const c = { pending: 0, rejected: 0, inprogress: 0, approved: 0 };
    for (const e of list || []) {
      if (e.status === 'Pending') c.pending += 1;
      else if (e.status === 'Rejected') c.rejected += 1;
      else if (e.status === 'In Progress') c.inprogress += 1;
      else if (e.status === 'Approved') c.approved += 1;
    }
    return c;
  }, [list]);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const name = user?.display_name || user?.username || '';
  const initials = (name || '?').substring(0, 2).toUpperCase();
  const onList = location.pathname === '/expenses';
  const tab = location.state?.tab;

  // "All/My expenses" is active on the list unless a queue shortcut opened it.
  const listLink = ({ isActive }) => (isActive && !['pending', 'rejected', 'inprogress', 'approved'].includes(tab) ? 'active' : undefined);

  const queues = isApprover
    ? [
      { tab: 'pending', label: 'Awaiting review', icon: 'i-inbox', n: counts.pending, tone: 'warning' },
      { tab: 'approved', label: 'Approved', icon: 'i-check', n: counts.approved },
      { tab: 'rejected', label: 'Rejected', icon: 'i-x', n: counts.rejected },
    ]
    : [
      { tab: 'pending', label: 'Awaiting approval', icon: 'i-inbox', n: counts.pending },
      { tab: 'inprogress', label: 'Active trips', icon: 'i-route', n: counts.inprogress, tone: 'info' },
      { tab: 'rejected', label: 'Needs fixing', icon: 'i-alert', n: counts.rejected, tone: 'critical' },
    ];

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={onClose} aria-hidden="true" />
      <nav className={`sidebar ${isOpen ? 'open' : ''}`} id="sidebar" aria-label="Main navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img className="sidebar-logo" src="/login-logo.png" alt="" width="36" height="36" />
            <div className="sidebar-brand-text">
              <span className="sidebar-app">Expense Tracker</span>
              <span className="sidebar-panel" id="sidebarTitle">{isApprover ? 'Approver portal' : 'Employee portal'}</span>
            </div>
          </div>
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu">
            <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
          </button>
        </div>

        <div className="sidebar-scroll">
          <p className="sidebar-section">Workspace</p>
          <ul className="sidebar-menu">
            <li>
              <NavLink to={isApprover ? '/dashboard' : '/my'} onClick={onClose} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <svg className="icon" aria-hidden="true"><use href="#i-dashboard" /></svg>
                <span className="sidebar-label">Dashboard</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/expenses" onClick={onClose} className={listLink}>
                <svg className="icon" aria-hidden="true"><use href="#i-list" /></svg>
                <span className="sidebar-label">{isApprover ? 'All expenses' : 'My expenses'}</span>
                {list && <span className="sidebar-count">{list.length}</span>}
              </NavLink>
            </li>
          </ul>

          <p className="sidebar-section">{isApprover ? 'Review' : 'Status'}</p>
          <ul className="sidebar-menu">
            {queues.map((q) => (
              <li key={q.tab}>
                <Link
                  to="/expenses"
                  state={{ tab: q.tab }}
                  onClick={onClose}
                  className={onList && tab === q.tab ? 'active' : undefined}
                >
                  <svg className="icon" aria-hidden="true"><use href={`#${q.icon}`} /></svg>
                  <span className="sidebar-label">{q.label}</span>
                  {list && q.n > 0 && (
                    <span className={`sidebar-count${q.tone ? ` is-${q.tone}` : ''}`}>{q.n}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div className="sidebar-user-text">
              <span className="sidebar-user-name">{name}</span>
              <span className="sidebar-user-role">{ROLE_LABEL[user?.role] || user?.role}</span>
            </div>
            <button type="button" className="sidebar-signout" onClick={handleLogout} title="Sign out" aria-label="Sign out">
              <svg className="icon" aria-hidden="true"><use href="#i-logout" /></svg>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

export default memo(Sidebar);