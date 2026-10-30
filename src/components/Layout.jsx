import { useCallback, useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../AuthContext';
import { getTheme, setTheme as persistTheme } from '../utils/theme';

/**
 * Page frame: sidebar + header.
 *  title     — page heading
 *  subtitle  — one short line under the heading (optional)
 *  headerRight — page actions (buttons) shown on the right
 */
export default function Layout({ children, title = 'Dashboard', subtitle, headerRight }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const [theme, setTheme] = useState(getTheme);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    persistTheme(next);   // remembered for the next visit
  };

  // Browser tab / app switcher shows which page you're on.
  useEffect(() => {
    document.title = title ? `${title} · Expense Tracker` : 'Expense Tracker';
  }, [title]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const initials = (user?.display_name || user?.username || '?').substring(0, 2).toUpperCase();

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      <main className="main" id="main" tabIndex={-1}>
        <header className="page-header">
          <div className="page-header-left">
            <button
              type="button"
              className="menu-toggle visible"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              aria-expanded={sidebarOpen}
              aria-controls="sidebar"
            >
              <svg className="icon" aria-hidden="true"><use href="#i-menu" /></svg>
            </button>
            <div className="page-heading">
              <h1>{title}</h1>
              {subtitle && <p className="page-subtitle">{subtitle}</p>}
            </div>
          </div>

          <div className="page-header-right">
            {headerRight}

            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <svg className="icon i-sun" aria-hidden="true"><use href="#i-sun" /></svg>
              <svg className="icon i-moon" aria-hidden="true"><use href="#i-moon" /></svg>
            </button>

            {/* On wide screens the user is shown at the bottom of the sidebar instead. */}
            <div className="user-chip" title={user?.display_name || user?.username}>
              <div className="avatar" aria-hidden="true">{initials}</div>
            </div>
          </div>
        </header>

        <div className="page-body">{children}</div>
      </main>
    </div>
  );
}
