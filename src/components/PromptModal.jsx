import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';

export default function PromptModal({
  isOpen,
  title,
  body,
  inputLabel = 'Comments',
  placeholder = '',
  required = false,
  okLabel = 'Confirm',
  okClass = 'btn-primary',
  onCancel,
  onSubmit,
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError('Please enter a comment.');
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
      {body && (
        <p style={{ fontSize: 'var(--fs-md)', color: 'var(--ink-2)', lineHeight: 1.55 }}>
          {body}
        </p>
      )}

      <div className="form-group" style={{ marginTop: 'var(--sp-4)', marginBottom: 0 }}>
        <label htmlFor="promptInput">
          {inputLabel}
          {required && <span className="req">*</span>}
        </label>
        <textarea
          id="promptInput"
          ref={inputRef}
          rows="3"
          placeholder={placeholder}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(''); }}
        />
        {error && (
          <div className="field-error" role="alert">
            <svg className="icon"><use href="#i-alert" /></svg> {error}
          </div>
        )}
      </div>

      <div className="btn-row btn-row-end" style={{ marginTop: 'var(--sp-5)' }}>
        <button type="button" className="btn btn-outline" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`btn ${okClass}`} onClick={handleSubmit}>
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
