import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';

import ProfilePage from './pages/ProfilePage';
import CreateEmployeePage from './pages/CreateEmployeePage';
import UsersPage from './pages/UsersPage';

import OpHeadDashboardPage from './pages/OpHeadDashboardPage';
import AccountsDashboardPage from './pages/AccountsDashboardPage';
import { isApproverRole, canSeeLocations } from './utils/format';      // add canSeeLocations
import TripTracker from './components/TripTracker';
import ChairmanDashboardPage from './pages/ChairmanDashboardPage';     // new import
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const SelectExpenseTypePage = lazy(() => import('./pages/SelectExpenseTypePage'));
const ExpenseFormPage = lazy(() => import('./pages/ExpenseFormPage'));
const LocationLogPage = lazy(() => import('./pages/LocationLogPage'));
const LiveTrackingPage = lazy(() => import('./pages/LiveTrackingPage'));

let prefetched = false;
function prefetchPages(user) {
  if (prefetched || !user) return;
  prefetched = true;
  const run = () => {
    import('./pages/DashboardPage');
    import('./pages/ExpensesPage');
    if (!isApproverRole(user)) {
      import('./pages/SelectExpenseTypePage');
      import('./pages/ExpenseFormPage');
    }
  };
  (window.requestIdleCallback || ((cb) => setTimeout(cb, 1200)))(run);
}

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loader-spinner" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;

  prefetchPages(user);

  // Where each role lands after sign-in. A signed-in user with any other
  // (e.g. retired) role goes to /expenses instead of bouncing between /login and itself.
  const home =
    user?.role === 'clerk' ? '/dashboard' :
    user?.role === 'accounts' ? '/accounts-dashboard' :
    user?.role === 'op_head' ? '/op-head-dashboard' :
    user?.role === 'manager' ? '/dashboard' : 
    user?.role === 'employee' ? '/my' :
    user?.role === 'chairman' ? '/chairman-dashboard' :
    user ? '/expenses' :
    '/login';

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={home} replace /> : <LoginPage />} />

        <Route path="/dashboard" element={user?.role === 'clerk' ? <DashboardPage /> : <Navigate to={home} replace />} />
        <Route path="/accounts-dashboard" element={user?.role === 'accounts' ? <AccountsDashboardPage /> : <Navigate to={home} replace />} />
        <Route path="/op-head-dashboard" element={user?.role === 'op_head' ? <OpHeadDashboardPage /> : <Navigate to={home} replace />} />
        <Route path="/my" element={user?.role === 'employee' ? <DashboardPage /> : <Navigate to={home} replace />} />
        <Route path="/chairman-dashboard" element={user?.role === 'chairman' ? <ChairmanDashboardPage /> : <Navigate to={home} replace />} />

        {/* Only the Accounts team can create users (the backend enforces this too). */}
        <Route
          path="/employees/new"
          element={user?.role === 'accounts' ? <CreateEmployeePage /> : <Navigate to={home} replace />}
        />

        {/* Accounts only: see every user and edit their details (the backend enforces this too). */}
        <Route path="/users" element={user?.role === 'accounts' ? <UsersPage /> : <Navigate to={home} replace />} />

        {/* Accounts and Op Head only. The Chairman has no access to location data. */}
        <Route path="/locations" element={user?.role === 'accounts' ? <LocationLogPage /> : <Navigate to={home} replace />} />
        {/* Live tracking: Accounts and Op Head only (the backend enforces this too). The Chairman has no access. */}
        <Route path="/live" element={canSeeLocations(user) ? <LiveTrackingPage /> : <Navigate to={home} replace />} />
        <Route path="/expenses" element={user ? <ExpensesPage /> : <Navigate to="/login" replace />} />
        <Route path="/new" element={user ? <SelectExpenseTypePage /> : <Navigate to="/login" replace />} />
        <Route path="/form" element={user ? <ExpenseFormPage /> : <Navigate to="/login" replace />} />
        <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/login" replace />} />

        {/* Fallback must be at the very bottom */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
          <TripTracker />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}

export default App;