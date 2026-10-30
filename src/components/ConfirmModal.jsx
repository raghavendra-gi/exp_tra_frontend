import Modal from './Modal';

export default function ConfirmModal({
  isOpen,
  title = 'Confirm',
  body,
  okLabel = 'Confirm',
  okClass = 'btn-primary',
  onCancel,
  onConfirm,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
      <p style={{ fontSize: 'var(--fs-md)', color: 'var(--ink-2)', lineHeight: 1.55 }}>
        {body}
      </p>
      <div className="btn-row btn-row-end" style={{ marginTop: 'var(--sp-5)' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`btn ${okClass}`} onClick={onConfirm}>
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
