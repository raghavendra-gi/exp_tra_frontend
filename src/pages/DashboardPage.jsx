import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import StatusSummary from '../components/StatusSummary';
import ExpenseTable, { EmptyState } from '../components/ExpenseTable';
import { useExpenses } from '../hooks/useExpenses';
import { useExpenseActions } from '../hooks/useExpenseActions';
import { formatMoney, isApproverRole } from '../utils/format';

const RECENT_COUNT = 8;

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isApprover = isApproverRole(user);

  const { expenses, loading, error, reload, upsert, remove } = useExpenses();
  const actions = useExpenseActions({ upsert, remove, reload });

  const { approvedSum, pendingCount, recent } = useMemo(() => {
    let sum = 0;
    let pending = 0;
    for (const e of expenses) {
      if (e.status === 'Approved') sum += Number(e.data?.amount) || 0;
      if (e.status === 'Pending') pending += 1;
    }
    const sorted = [...expenses]
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, RECENT_COUNT);
    return { approvedSum: sum, pendingCount: pending, recent: sorted };
  }, [expenses]);

  const firstName = user?.display_name || user?.username || '';
  const subtitle = loading ? '' : isApprover
    ? (pendingCount ? `${pendingCount} ${pendingCount === 1 ? 'request is' : 'requests are'} waiting for your decision` : 'Nothing is waiting for your decision')
    : `Signed in as ${firstName}. ${formatMoney(approvedSum)} approved so far`;

  const headerRight = isApprover ? (
    <button className="btn btn-primary btn-sm" onClick={() => navigate('/expenses', { state: { tab: 'pending' } })}>
      <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg>
      <span className="btn-text">Review pending</span>
    </button>
  ) : (
    <>
      <button className="btn btn-outline btn-sm hide-sm" onClick={() => navigate('/expenses')}>
        <svg className="icon" aria-hidden="true"><use href="#i-list" /></svg>
        <span className="btn-text">My expenses</span>
      </button>
      <button className="btn btn-primary btn-sm" onClick={() => navigate('/new')}>
        <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
        <span className="btn-text">New expense</span>
      </button>
    </>
  );

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
          <StatusSummary expenses={expenses} loading={loading} />

          <section className="card card-flush">
            <div className="card-head">
              <h2 className="card-heading">Recent expenses</h2>
              {!loading && expenses.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/expenses')}>
                  View all
                </button>
              )}
            </div>

            <ExpenseTable
              id="recentTable"
              expenses={recent}
              loading={loading}
              isApprover={isApprover}
              onView={actions.openDetail}
              onAction={actions.handleAction}
              showQuickDecide={isApprover}
              empty={
                <EmptyState
                  title={isApprover ? 'No requests yet' : 'You have no expenses yet'}
                  text={isApprover ? 'Requests from employees will appear here.' : 'Submit a bill or start a trip, and it will show up here.'}
                  action={!isApprover && (
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/new')}>
                      <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg> New expense
                    </button>
                  )}
                />
              }
            />
          </section>
        </>
      )}

      {actions.elements}
    </Layout>
  );
}
