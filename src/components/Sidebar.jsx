import { memo, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { isApproverRole } from '../utils/format';

const ROLE_LABEL = { head: 'Head', hr: 'HR', employee: 'Employee' };

function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isApprover = isApproverRole(user);

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

  const link = ({ isActive }) => (isActive ? 'active' : undefined);
  const name = user?.display_name || user?.username || '';
  const initials = (name || '?').substring(0, 2).toUpperCase();

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={onClose} aria-hidden="true" />
      <nav className={`sidebar ${isOpen ? 'open' : ''}`} id="sidebar" aria-label="Main navigation">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img className="sidebar-logo" src="/login-logo.png" alt="" width="34" height="34" />
            <div className="sidebar-brand-text">
              <span className="sidebar-app">Expense Tracker</span>
              <span className="sidebar-panel" id="sidebarTitle">{isApprover ? 'Approver panel' : 'Employee panel'}</span>
            </div>
          </div>
          <button type="button" className="icon-btn sidebar-close" onClick={onClose} aria-label="Close menu">
            <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
          </button>
        </div>

        <ul className="sidebar-menu" id="sidebarMenu">
          <li>
            <NavLink to={isApprover ? '/dashboard' : '/my'} onClick={onClose} className={link}>
              <svg className="icon" aria-hidden="true"><use href="#i-dashboard" /></svg> Dashboard
            </NavLink>
          </li>

          {/* Submit expense — ONLY for employees */}
          {!isApprover && (
            <li>
              <NavLink to="/new" onClick={onClose} className={link}>
                <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg> New expense
              </NavLink>
            </li>
          )}

          <li>
            <NavLink to="/expenses" onClick={onClose} className={link}>
              <svg className="icon" aria-hidden="true"><use href="#i-list" /></svg> {isApprover ? 'All expenses' : 'My expenses'}
            </NavLink>
          </li>
        </ul>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div className="sidebar-user-text">
              <span className="sidebar-user-name">{name}</span>
              <span className="sidebar-user-role">{ROLE_LABEL[user?.role] || user?.role}</span>
            </div>
          </div>
          <button type="button" className="sidebar-signout" onClick={handleLogout}>
            <svg className="icon" aria-hidden="true"><use href="#i-logout" /></svg> Sign out
          </button>
        </div>
      </nav>
    </>
  );
}

export default memo(Sidebar);
