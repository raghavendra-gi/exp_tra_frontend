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

  const handleAction = useCallback((action, expense) => {
    switch (action) {
      case 'approve':
      case 'reject':
        setPrompt({ action, expense });
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
  const elements = (
    <>
      {selected && (
        <ExpenseDetailModal expense={selected} onClose={closeDetail} onAction={handleAction} />
      )}

      <PromptModal
        isOpen={!!prompt}
        title={prompt?.bulk
          ? (isApprove ? 'Approve selected' : 'Reject selected')
          : (isApprove ? 'Approve expense' : 'Reject expense')}
        body={prompt?.bulk
          ? `This comment will apply to ${prompt.count} selected expense${prompt.count === 1 ? '' : 's'}.`
          : prompt
            ? `Request #${prompt.expense.id}: ${prompt.expense.type} from ${prompt.expense.employee_name}, ${formatMoney(prompt.expense.data?.amount)}`
            : ''}
        inputLabel={isApprove ? 'Approval comments' : 'Reason for rejection'}
        placeholder={isApprove ? 'Write your approval comments here' : 'Write the reason for rejection'}
        required
        okLabel={isApprove ? 'Approve' : 'Reject'}
        okClass={isApprove ? 'btn-success' : 'btn-danger'}
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
    </>
  );

  return { openDetail, handleAction, requestBulk, elements };
}
