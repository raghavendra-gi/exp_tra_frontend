import DashboardPage from './DashboardPage';

export default function OpHeadDashboardPage() {
  // By simply returning the original DashboardPage, the Op Head gets the exact same 
  // interface (calendar, approvals, charts) because we already added 'op_head' 
  // to the isApproverRole() check in utils/format.js!
  return <DashboardPage />;
}