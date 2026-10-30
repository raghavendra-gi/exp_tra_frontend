import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/*
 * Stack of open modals (top = last). Escape now closes only the TOP one —
 * before, pressing Escape in an attachment preview closed the expense
 * details underneath it as well.
 */
const stack = [];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ isOpen, onClose, title, children, size = 'lg', headerRight, className = '' }) {
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const token = {};
    stack.push(token);
    document.body.classList.add('modal-open');
    const previouslyFocused = document.activeElement;

    // Move focus into the dialog (unless a child, e.g. the prompt textarea, already took it).
    const t = setTimeout(() => {
      const d = dialogRef.current;
      if (d && !d.contains(document.activeElement)) d.focus({ preventScroll: true });
    }, 0);

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;   // not the top-most modal
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      // Keep Tab inside the dialog.
      if (e.key === 'Tab' && dialogRef.current) {
        const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.body.classList.remove('modal-open');
      // Give focus back to whatever opened the dialog (e.g. the "View" button).
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`modal active ${size === 'lg' ? 'modal-lg' : size === 'sm' ? 'modal-sm' : ''}`}
      onMouseDown={(e) => {
        // Stop clicks from bubbling up to the parent modal
        e.stopPropagation();
        if (e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      <div
        className={`modal-content ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <div className="btn-row">
            {headerRight}
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
              <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
