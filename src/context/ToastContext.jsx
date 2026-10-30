import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';

const ToastContext = createContext(null);

const ICONS = {
  success: 'i-check',
  error: 'i-alert',
  warn: 'i-alert',
  info: 'i-info',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const removeToast = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message, kind = 'info', options = {}) => {
    const id = Date.now() + Math.random();
    const duration = options.duration || (kind === 'error' ? 6000 : 4200); // errors stay a little longer

    setToasts((prev) => {
      // De-dupe: if the same message is already showing, don't add it again
      if (prev.some((t) => t.message === message)) return prev;
      return [...prev.slice(-3), { id, message, kind }];   // at most 4 on screen
    });

    timers.current.set(id, setTimeout(() => removeToast(id), duration));
  }, [removeToast]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Stable value: components using useToast() no longer re-render whenever a toast appears.
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
            <span className="t-icon">
              <svg className="icon" aria-hidden="true"><use href={`#${ICONS[t.kind] || 'i-info'}`} /></svg>
            </span>
            <span className="t-body">{t.message}</span>
            <button type="button" className="t-close" onClick={() => removeToast(t.id)} aria-label="Dismiss">
              <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx.toast;
}
