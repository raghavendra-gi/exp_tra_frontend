import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext';
import { expenseAPI } from '../api/client';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import Modal from './Modal';
import { formatDate, formatDateTime, formatMoney, statusBadgeClass, statusIcon, isApproverRole } from '../utils/format';

const FIELD_ICONS = {
  date: 'i-calendar', fromDate: 'i-calendar', toDate: 'i-calendar',
  amount: 'i-rupee', estimatedCost: 'i-calc', items: 'i-list',
  receipt: 'i-receipt', remarks: 'i-comment', from: 'i-pin', to: 'i-flag',
  kilometers: 'i-road', transport: 'i-car', startLocation: 'i-play',
  currentLocation: 'i-pin', endLocation: 'i-stop',
  startMeterImage: 'i-camera', endMeterImage: 'i-camera',
  ticketBill: 'i-ticket', startMeter: 'i-camera', endMeter: 'i-camera',
  eventName: 'i-star', location: 'i-pin', courierService: 'i-truck',
  recipientName: 'i-user', trackingNumber: 'i-barcode', occasion: 'i-gift',
  giftDescription: 'i-tag', description: 'i-doc', distanceKm: 'i-route',
};
const HIDDEN = ['date', 'amount', 'remarks'];

/*
 * Lists now hold "lite" expenses (no attachment bytes). The full record, with
 * attachments, is fetched here when the request is opened, and kept in a small
 * cache so re-opening the same request is instant. The cache key includes the
 * status and submit time, so an edited / decided request is fetched fresh.
 */
const fullCache = new Map();
const cacheKey = (e) => `${e.id}|${e.status}|${e.submitted_date}|${e.decided_date}`;
const MAX_CACHE = 20;

let html2pdfPromise = null;
function loadHtml2Pdf() {
  if (window.html2pdf) return Promise.resolve();
  if (!html2pdfPromise) {
    html2pdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = resolve;
      script.onerror = () => {
        html2pdfPromise = null;
        script.remove();
        reject(new Error('Failed to load PDF library. Check your internet.'));
      };
      document.head.appendChild(script);
    });
  }
  return html2pdfPromise;
}

const PDF_CLONE_CSS = `
  .btn-row { display: none !important; }
  .modal-banner { border: 1px solid #e0e0e0 !important; }
  .badge { border: 1px solid transparent !important; }
  .reason-box { border: 1px solid #e0e0e0 !important; }
  .badge-approved { border-color: #0ca30c !important; }
  .badge-pending { border-color: #fab219 !important; }
  .badge-rejected { border-color: #d03b3b !important; }
  .timeline { page-break-inside: avoid !important; }
  .timeline li { page-break-inside: avoid !important; }
`;

export default function ExpenseDetailModal({ expense: listExpense, onClose, onAction }) {
  const { user } = useAuth();
  const toast = useToast();
  const [previewFiles, setPreviewFiles] = useState(null);
  const [full, setFull] = useState(() => fullCache.get(cacheKey(listExpense)) || null);
  const [loadError, setLoadError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const key = cacheKey(listExpense);
    if (fullCache.has(key)) { setFull(fullCache.get(key)); return undefined; }
    let cancelled = false;
    setFull(null);
    setLoadError('');
    expenseAPI(`/expenses/${listExpense.id}`)
      .then((data) => {
        if (cancelled) return;
        fullCache.set(key, data);
        if (fullCache.size > MAX_CACHE) fullCache.delete(fullCache.keys().next().value);
        setFull(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoadError(err.message || 'Could not load attachments.');
      });
    return () => { cancelled = true; };
  }, [listExpense]);

  // Show the full record once it's here; until then the list copy (same fields, no file bytes).
  const expense = full || listExpense;
  const ready = !!full;
  const data = expense.data || {};

  const config = EXPENSE_TYPES[expense.type] || { fields: [], icon: '📋', title: expense.type };
  const isApprover = isApproverRole(user);
  const isOwner = expense.employee_id === user?.username
    || expense.employee_name === user?.display_name || expense.employee_name === user?.username;
  const canDecide = isApprover && expense.status === 'Pending';

  const fileFields = useMemo(() => config.fields.filter((f) =>
    f.type === 'file'
    && Array.isArray(data[f.key])
    && data[f.key].length > 0
    && (!f.showIf || f.showIf(data))), [config, data]);

  const tripOrigin = data.from || data.startLocation || '';
  const tripDestination = data.to || data.endLocation || '';
  const showTripLink = tripOrigin && tripDestination;

  const latestNote = useMemo(() => {
    if (!Array.isArray(expense.history)) return '';
    for (let i = expense.history.length - 1; i >= 0; i--) {
      const h = expense.history[i];
      if (/Approved|Rejected/.test(h.action)) return h.note || '';
    }
    return '';
  }, [expense.history]);

  const mapsLink = showTripLink
    ? 'https://www.google.com/maps/dir/?api=1'
      + `&origin=${encodeURIComponent(tripOrigin)}`
      + `&destination=${encodeURIComponent(tripDestination)}`
      + '&travelmode=driving'
    : '';

  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await loadHtml2Pdf();
      const el = document.querySelector('.modal-content');
      if (!el) throw new Error('Could not find modal content.');
      await window.html2pdf().set({
        margin: 10,
        filename: `Expense-${expense.id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2, useCORS: true, logging: false,
          onclone: (doc) => {
            const style = doc.createElement('style');
            style.innerHTML = PDF_CLONE_CSS;
            doc.head.appendChild(style);
          },
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(el).save();
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast(err.message || 'Could not generate PDF. Use Print and choose "Save as PDF" instead.', 'error');
    } finally {
      setPdfBusy(false);
    }
  };

  const headerButtons = (
    <div className="modal-file-buttons" style={{ marginRight: '8px' }}>
      {fileFields.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '240px' }}>
          {fileFields.flatMap((f) => data[f.key].map((file, index) => (
            <button
              type="button"
              key={`${f.key}-${index}`}
              className={`peek-btn${ready ? '' : ' is-loading'}`}
              disabled={!ready}
              onClick={() => setPreviewFiles({
                files: [{ ...file, label: f.label || f.title || f.key }],
                title: f.label || f.title || 'Attachment',
              })}
              title={ready ? `View ${f.label || 'File'} ${index + 1}` : 'Loading attachment…'}
              aria-label={`View ${f.label || 'file'} ${index + 1}`}
            >
              <svg className="icon" aria-hidden="true"><use href={ready ? '#i-eye' : '#i-spinner'} /></svg>
            </button>
          )))}
        </div>
      )}

      <button type="button" className="peek-btn" onClick={() => window.print()} title="Print" aria-label="Print">
        <svg className="icon" aria-hidden="true"><use href="#i-print" /></svg>
      </button>

      <button
        type="button"
        className={`peek-btn${pdfBusy ? ' is-loading' : ''}`}
        onClick={downloadPdf}
        disabled={pdfBusy}
        title="Download as PDF"
        aria-label="Download as PDF"
      >
        <svg className="icon" aria-hidden="true"><use href={pdfBusy ? '#i-spinner' : '#i-download'} /></svg>
      </button>
    </div>
  );

  const renderDetails = (isSplit) => config.fields.map((f) => {
    if (HIDDEN.includes(f.key) || f.type === 'file' || f.type === 'route') return null;
    if (showTripLink && ['from', 'to', 'startLocation', 'endLocation'].includes(f.key)) return null;
    if (isSplit && f.key === 'kilometers') return null;

    const v = data[f.key];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;

    return (
      <div className="detail-row" key={f.key}>
        <div className="detail-icon"><svg className="icon" aria-hidden="true"><use href={`#${FIELD_ICONS[f.key] || 'i-info'}`} /></svg></div>
        <div className="detail-text">
          <div className="detail-label">{f.label || f.title || f.key}</div>
          <div className="detail-value">
            {f.type === 'date' ? formatDate(v)
              : f.type === 'number' ? (f.money ? formatMoney(v) : String(v) + (f.unit ? ' ' + f.unit : ''))
                : f.type === 'checkboxes' ? (
                  <div className="items-list">
                    {v.map((item, i) => <span key={i} className="item-chip">{item}</span>)}
                  </div>
                )
                  : String(v)}
          </div>
        </div>
      </div>
    );
  });

  // Edit / resubmit / end trip carry the attachments into the form, so they wait for the full record.
  const needsFull = { disabled: !ready, title: ready ? undefined : 'Loading…' };

  return (
    <Modal isOpen onClose={onClose} title={`${expense.type} #${expense.id}`} size="lg" headerRight={headerButtons}>
      <div className="modal-banner">
        <div className="banner-main">
          <div className="banner-title-row">
            <span className="banner-emoji" aria-hidden="true">{config.icon}</span>
            <span className="banner-title">{config.title || expense.type}</span>
          </div>
          <div className="banner-sub">
            Submitted by {expense.employee_name} on {formatDateTime(expense.submitted_date || expense.created_date)}
          </div>
        </div>
        <div className="banner-center">
          {config.fields.some((f) => f.key === 'amount') && (
            <div className="hero-figure">{formatMoney(data.amount)}</div>
          )}
          <div className="banner-actions">
            <span className={`badge ${statusBadgeClass(expense.status)}`}>
              <svg className="icon" aria-hidden="true"><use href={`#${statusIcon(expense.status)}`} /></svg>
              {expense.status}
            </span>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="form-banner banner-warn" role="status">
          <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
          <span>{loadError} Details are shown; attachments are unavailable.</span>
        </div>
      )}

      {expense.status === 'Rejected' && (latestNote || expense.rejection_reason) && (
        <div className="reason-box">
          <strong>Reason for rejection</strong>
          {latestNote || expense.rejection_reason}
        </div>
      )}
      {expense.status === 'Approved' && latestNote && (
        <div className="reason-box is-approved">
          <strong>Approval comment</strong>
          {latestNote}
        </div>
      )}

      <div className="meta-row">
        <div className="meta-card">
          <div className="meta-label"><svg className="icon" aria-hidden="true"><use href="#i-user" /></svg> Employee</div>
          <div className="meta-value">{expense.employee_name}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label"><svg className="icon" aria-hidden="true"><use href="#i-calendar" /></svg> Date</div>
          <div className="meta-value">{formatDate(data[config.dateField || 'date'])}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label"><svg className="icon" aria-hidden="true"><use href="#i-check" /></svg> Decision</div>
          <div className="meta-value">
            {expense.decided_by ? expense.decided_by : <span className="muted">Not decided yet</span>}
          </div>
        </div>
      </div>

      {showTripLink ? (
        <div className="split-details-layout">
          <div>
            <div className="section-title">Route</div>
            <div className="route-detail">
              <div className="rd-line"><svg className="icon" aria-hidden="true"><use href="#i-pin" /></svg><span>{tripOrigin}</span></div>
              <div className="rd-line"><svg className="icon" aria-hidden="true"><use href="#i-flag" /></svg><span>{tripDestination}</span></div>
              <div className="rd-line">
                <svg className="icon" aria-hidden="true"><use href="#i-route" /></svg>
                <span className="rd-figures">
                  {data.kilometers ? `${data.kilometers} km` : data.distanceKm ? `${data.distanceKm} km` : 'Distance not recorded'}
                </span>
              </div>
              <a className="rd-map-link" href={mapsLink} target="_blank" rel="noopener noreferrer">
                <svg className="icon" aria-hidden="true"><use href="#i-external" /></svg> Open in Google Maps
              </a>
            </div>
          </div>
          <div>
            <div className="section-title">Details</div>
            <div className="detail-grid" style={{ gridTemplateColumns: '1fr' }}>
              {renderDetails(true)}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="section-title">Details</div>
          <div className="detail-grid">{renderDetails(false)}</div>
        </>
      )}

      {Array.isArray(expense.history) && expense.history.length > 0 && (
        <>
          <div className="section-title">Activity</div>
          <ul className="timeline">
            {expense.history.map((h, i) => {
              const good = /Approved/.test(h.action);
              const bad = /Rejected/.test(h.action);
              return (
                <li key={h.id ?? i}>
                  <span className={`dot ${good ? 'good' : bad ? 'bad' : ''}`} />
                  <span className="tl-card">
                    <strong className="tl-action">{h.action}</strong>
                    <span className="tl-by">{h.by}</span>
                    <span
                      className="when"
                      style={good
                        ? { color: 'var(--st-good-ink)', fontWeight: 'bold' }
                        : bad ? { color: 'var(--st-critical-ink)', fontWeight: 'bold' } : undefined}
                    >
                      {formatDateTime(h.at)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="btn-row" style={{ marginTop: 'var(--sp-5)' }}>
        {canDecide && (
          <>
            <button className="btn btn-success" onClick={() => onAction('approve', expense)}>
              <svg className="icon" aria-hidden="true"><use href="#i-check" /></svg> Approve
            </button>
            <button className="btn btn-danger" onClick={() => onAction('reject', expense)}>
              <svg className="icon" aria-hidden="true"><use href="#i-x" /></svg> Reject
            </button>
          </>
        )}

        {isOwner && !isApprover && (
          <>
            {expense.status === 'In Progress' && (
              <button className="btn btn-success" {...needsFull} onClick={() => onAction('endTrip', full)}>
                <svg className="icon" aria-hidden="true"><use href="#i-stop" /></svg> End trip
              </button>
            )}
            {(expense.status === 'Pending' || expense.status === 'In Progress') && (
              <button className="btn btn-secondary" {...needsFull} onClick={() => onAction('edit', full)}>
                <svg className="icon" aria-hidden="true"><use href="#i-pencil" /></svg> Edit
              </button>
            )}
            {expense.status === 'Rejected' && (
              <button className="btn btn-primary" {...needsFull} onClick={() => onAction('resubmit', full)}>
                <svg className="icon" aria-hidden="true"><use href="#i-copy" /></svg> Fix &amp; resubmit
              </button>
            )}
            {expense.status !== 'Approved' && (
              <button className="btn btn-ghost btn-ghost-danger" onClick={() => onAction('delete', expense)}>
                <svg className="icon" aria-hidden="true"><use href="#i-trash" /></svg> Delete
              </button>
            )}
          </>
        )}
      </div>

      {previewFiles && (
        <FilePreviewModal files={previewFiles.files} title={previewFiles.title} onClose={() => setPreviewFiles(null)} />
      )}
    </Modal>
  );
}

function FilePreviewModal({ files, title, onClose }) {
  return (
    <Modal isOpen onClose={onClose} title={title} className="image-viewer-modal">
      <div className="preview-strip">
        {files.map((file, i) => {
          if (!file.dataUrl) return <p key={i} className="preview-cap">{file.name} — no preview available</p>;
          return file.type === 'application/pdf' ? (
            <iframe key={i} src={file.dataUrl} className="image-preview-pdf" title={file.name} />
          ) : (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: file.label ? '16px 16px 0 16px' : '0' }}>
              {file.label && <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: 2 }}>{file.label}</p>}
              <img src={file.dataUrl} alt={file.name} decoding="async" />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
