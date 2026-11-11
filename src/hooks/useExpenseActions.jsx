import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { expenseAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import ExpenseDetailModal from '../components/ExpenseDetailModal';
import PromptModal from '../components/PromptModal';
import ConfirmModal from '../components/ConfirmModal';
import { formatMoney } from '../utils/format';

/*
 * Everything that happens after "View", "Approve", "Reject", "Edit", "Delete"…
 * The Dashboard and View Expenses pages used to each carry their own copy of
 * this logic (and had drifted: one used a styled confirm dialog, the other the
 * browser's confirm()). Both now share this one.
 *
 * Usage:  const actions = useExpenseActions({ upsert, remove, reload });
 *         actions.openDetail(expense) / actions.handleAction('approve', e)
 *         {actions.elements}   ← render once in the page
 */
export function useExpenseActions({ upsert, remove, reload }) {
  const toast = useToast();
  const navigate = useNavigate();

  const [selected, setSelected] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);

  const openDetail = useCallback((expense) => setSelected(expense), []);
  const closeDetail = useCallback(() => setSelected(null), []);

  const doDelete = useCallback(async (expense) => {
    try {
      await expenseAPI(`/expenses/${expense.id}`, { method: 'DELETE' });
      toast('Expense deleted.', 'success');
      setSelected(null);
      remove(expense.id);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to delete expense.', 'error');
    }
  }, [toast, remove]);

  /** "Reject" removes the expense totally. */
  const doReject = useCallback(async (expense) => {
    try {
      await expenseAPI(`/expenses/${expense.id}`, { method: 'DELETE' });
      toast(`Expense #${expense.id} rejected and removed.`, 'success');
      setSelected(null);
      remove(expense.id);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to reject expense.', 'error');
    }
  }, [toast, remove]);

  const handleAction = useCallback((action, expense) => {
    switch (action) {
      case 'approve':
        setPrompt({ action, expense });
        return;
      case 'query':
        setPrompt({ action: 'query', expense });
        return;
      case 'reject':
        setConfirmReject(expense);
        return;
      case 'edit':
        setSelected(null);
        navigate('/form', { state: { editingExpense: expense } });
        return;
      case 'resubmit':
        setSelected(null);
        navigate('/form', { state: { editingExpense: expense, resubmit: true } });
        return;
      case 'endTrip':
        setSelected(null);
        navigate('/form', { state: { editingExpense: expense, stage: 'end' } });
        return;
      case 'delete':
        setConfirmDelete(expense);
        return;
      default:
    }
  }, [navigate]);

  /** Approver bulk action — `ids` already filtered by the caller. */
  const requestBulk = useCallback((status, ids, onDone) => {
    setPrompt({ action: status === 'Approved' ? 'approve' : 'reject', bulk: true, ids, count: ids.length, onDone });
  }, []);

  const submitPrompt = async (comment) => {
    const p = prompt;
    if (p.action === 'query') {
      setPrompt(null);
      try {
        const updated = await expenseAPI(`/expenses/${p.expense.id}/query`, {
          method: 'POST',
          body: JSON.stringify({ reason: comment }),
        });
        toast(`Query sent to ${p.expense.employee_name} for request #${p.expense.id}.`, 'info');
        setSelected(null);
        if (updated?.id) upsert(updated); else await reload();
      } catch (err) {
        console.error(err);
        toast(err.message || 'Failed to raise query.', 'error');
      }
      return;
    }
    const status = p.action === 'approve' ? 'Approved' : 'Rejected';
    const kind = p.action === 'approve' ? 'success' : 'error';
    setPrompt(null);
    try {
      if (p.bulk) {
        await expenseAPI('/expenses/bulk-decide', {
          method: 'POST',
          body: JSON.stringify({ ids: p.ids, status, reason: comment }),
        });
        toast(`${p.ids.length} expense${p.ids.length === 1 ? '' : 's'} ${status.toLowerCase()}.`, kind);
        p.onDone?.();
        await reload();
      } else {
        const updated = await expenseAPI(`/expenses/${p.expense.id}/decide`, {
          method: 'POST',
          body: JSON.stringify({ status, reason: comment }),
        });
        toast(`Expense #${p.expense.id} ${status.toLowerCase()}.`, kind);
        setSelected(null);
        if (updated?.id) upsert(updated); else await reload();
      }
    } catch (err) {
      console.error(err);
      toast(err.message || (p.bulk ? 'Failed to update selection.' : 'Failed to update expense.'), 'error');
    }
  };

  const isApprove = prompt?.action === 'approve';
  const isQuery = prompt?.action === 'query';
  const elements = (
    <>
      {selected && (
        <ExpenseDetailModal expense={selected} onClose={closeDetail} onAction={handleAction} />
      )}

      <PromptModal
        isOpen={!!prompt}
        title={prompt?.bulk
          ? (isApprove ? 'Approve selected' : 'Reject selected')
          : isQuery ? 'Raise query' : (isApprove ? 'Approve expense' : 'Reject expense')}
        body={prompt?.bulk
          ? `This comment will apply to ${prompt.count} selected expense${prompt.count === 1 ? '' : 's'}.`
          : prompt
            ? `Request #${prompt.expense.id}: ${prompt.expense.type} from ${prompt.expense.employee_name}, ${formatMoney(prompt.expense.data?.amount)}${isQuery ? '. The employee will see your comment, fix the expense and resubmit it.' : ''}`
            : ''}
        inputLabel={isQuery ? 'What does the employee need to correct?' : isApprove ? 'Approval comments' : 'Reason for rejection'}
        placeholder={isQuery ? 'e.g. The bill is not clear. Upload a clear copy showing the GST number.' : isApprove ? 'Write your approval comments here' : 'Write the reason for rejection'}
        required
        okLabel={isQuery ? 'Raise query' : isApprove ? 'Approve' : 'Reject'}
        okClass={isQuery ? 'btn-query' : isApprove ? 'btn-success' : 'btn-danger'}
        onCancel={() => setPrompt(null)}
        onSubmit={submitPrompt}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title={`Delete request #${confirmDelete?.id}?`}
        body={`This removes the ${confirmDelete?.type} expense and its attachments. It cannot be undone.`}
        okLabel="Delete"
        okClass="btn-danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const exp = confirmDelete;
          setConfirmDelete(null);
          doDelete(exp);
        }}
      />

      <ConfirmModal
        isOpen={!!confirmReject}
        title={`Reject request #${confirmReject?.id}?`}
        body={`This permanently deletes the ${confirmReject?.type} expense from ${confirmReject?.employee_name}, with its attachments and history. It cannot be undone. If the bill only needs a correction, use Raise Query instead.`}
        okLabel="Reject & delete"
        okClass="btn-danger"
        onCancel={() => setConfirmReject(null)}
        onConfirm={() => {
          const exp = confirmReject;
          setConfirmReject(null);
          doReject(exp);
        }}
      />
    </>
  );

  return { openDetail, handleAction, requestBulk, elements };
}