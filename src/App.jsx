import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ToastProvider } from './context/ToastContext';
import LoginPage from './pages/LoginPage';
import { isApproverRole } from './utils/format';

/*
 * Pages are split into their own files and downloaded on first visit.
 * The sign-in screen no longer waits for the date picker, the form,
 * the maps code etc. — those arrive only when a page needs them.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const SelectExpenseTypePage = lazy(() => import('./pages/SelectExpenseTypePage'));
const ExpenseFormPage = lazy(() => import('./pages/ExpenseFormPage'));

/** Once signed in, fetch the other pages in the background so navigation is instant. */
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
  const isApprover = isApproverRole(user);
  const home = isApprover ? '/dashboard' : '/my';

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Send approvers to /dashboard, employees to /my */}
        <Route path="/login" element={user ? <Navigate to={home} replace /> : <LoginPage />} />

        {/* Approver Dashboard */}
        <Route path="/dashboard" element={user && isApprover ? <DashboardPage /> : <Navigate to={user ? home : '/login'} replace />} />

        {/* Employee Dashboard (same component) */}
        <Route path="/my" element={user && !isApprover ? <DashboardPage /> : <Navigate to={user ? home : '/login'} replace />} />

        {/* Shared Routes */}
        <Route path="/expenses" element={user ? <ExpensesPage /> : <Navigate to="/login" replace />} />
        <Route path="/new" element={user ? <SelectExpenseTypePage /> : <Navigate to="/login" replace />} />
        <Route path="/form" element={user ? <ExpenseFormPage /> : <Navigate to="/login" replace />} />

        {/* Fallback */}
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
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}

export default App;
