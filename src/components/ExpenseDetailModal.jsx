import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext';
import { expenseAPI } from '../api/client';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import Modal from './Modal';
import { formatDate, formatDateTime, formatMoney, statusBadgeClass, statusIcon, isApproverRole } from '../utils/format';
import TypeIcon from './TypeIcon';

// 👇 IMPORT THE NEW MODERN LIBRARIES 👇
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

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

const fullCache = new Map();
const cacheKey = (e) => `${e.id}|${e.status}|${e.submitted_date}|${e.decided_date}`;
const MAX_CACHE = 20;

export default function ExpenseDetailModal({ expense: listExpense, onClose, onAction }) {
  const { user } = useAuth();
  const toast = useToast();
  const [galleryStart, setGalleryStart] = useState(null);
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

  const expense = full || listExpense;
  const ready = !!full;
  const data = expense.data || {};

  const config = EXPENSE_TYPES[expense.type] || { fields: [], title: expense.type };
  const isApprover = isApproverRole(user);
  const isOwner = expense.employee_id === user?.username
    || expense.employee_name === user?.display_name || expense.employee_name === user?.username;
  const canDecide = isApprover && expense.status === 'Pending';

  const fileFields = useMemo(() => config.fields.filter((f) =>
    f.type === 'file'
    && Array.isArray(data[f.key])
    && data[f.key].length > 0
    && (!f.showIf || f.showIf(data))), [config, data]);

  const attachments = useMemo(() => fileFields.flatMap((f) => {
    const label = f.label || f.title || f.key;
    const list = data[f.key];
    return list.map((file, i) => ({ ...file, label: list.length > 1 ? `${label} ${i + 1}` : label }));
  }), [fileFields, data]);

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

  // 👇 COMPLETELY REWRITTEN PDF GENERATION FUNCTION 👇
  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const el = document.querySelector('.modal-content');
      if (!el) throw new Error('Could not find modal content.');

      // 1. Render the DOM to a Canvas using html2canvas-pro
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: (doc) => {
          // Hide interactive buttons in the PDF view
          const style = doc.createElement('style');
          style.innerHTML = `
            .btn-row { display: none !important; }
            .timeline { page-break-inside: avoid !important; }
            .timeline li { page-break-inside: avoid !important; }
          `;
          doc.head.appendChild(style);
        }
      });

      // 2. Create the PDF using jsPDF
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Expense-${expense.id}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast(err.message || 'Could not generate PDF. Use Print and choose "Save as PDF" instead.', 'error');
    } finally {
      setPdfBusy(false);
    }
  };

  const headerButtons = (
    <div className="modal-file-buttons" style={{ marginRight: '8px' }}>
      {attachments.length > 0 && (
        <button
          type="button"
          className={`peek-btn peek-btn-count${ready ? '' : ' is-loading'}`}
          disabled={!ready}
          onClick={() => setGalleryStart(0)}
          title={ready ? `View attachments (${attachments.length})` : 'Loading attachments…'}
          aria-label={`View ${attachments.length} ${attachments.length === 1 ? 'attachment' : 'attachments'}`}
        >
          <svg className="icon" aria-hidden="true"><use href={ready ? '#i-eye' : '#i-spinner'} /></svg>
          {ready && attachments.length > 1 && <span className="peek-count" aria-hidden="true">{attachments.length}</span>}
        </button>
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

  const needsFull = { disabled: !ready, title: ready ? undefined : 'Loading…' };

  return (
    <Modal isOpen onClose={onClose} title={`${expense.type} #${expense.id}`} size="lg" headerRight={headerButtons}>
      <div className="modal-banner">
        <div className="banner-main">
          <div className="banner-title-row">
            <TypeIcon type={expense.type} size="lg" />
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

      {galleryStart !== null && (
        <AttachmentGallery files={attachments} startIndex={galleryStart} onClose={() => setGalleryStart(null)} />
      )}
    </Modal>
  );
}

export function AttachmentGallery({ files, startIndex = 0, onClose }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(startIndex);
  const count = files.length;

  const goTo = useCallback((i, smooth = true) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(count - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    setIndex(next);
  }, [count]);

  useEffect(() => { goTo(startIndex, false); }, [goTo, startIndex]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = track.clientWidth || 1;
        setIndex(Math.round(track.scrollLeft / w));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); track.removeEventListener('scroll', onScroll); };
  }, []);

  useEffect(() => {
    const onResize = () => goTo(index, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [goTo, index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goTo, index]);

  const current = files[index] || files[0];
  const title = count > 1 ? `${current?.label || 'Attachment'} · ${index + 1} of ${count}` : (current?.label || 'Attachment');

  return (
    <Modal isOpen onClose={onClose} title={title} className="image-viewer-modal gallery-modal">
      <div className="gallery" aria-roledescription="carousel">
        <div className="gallery-track" ref={trackRef}>
          {files.map((file, i) => (
            <div
              key={i}
              className="gallery-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${file.label}`}
              aria-hidden={i !== index}
            >
              {!file.dataUrl ? (
                <p className="preview-cap">{file.name || file.label} — no preview available</p>
              ) : file.type === 'application/pdf' ? (
                <iframe src={file.dataUrl} className="image-preview-pdf" title={file.name || file.label} tabIndex={i === index ? 0 : -1} />
              ) : (
                <img src={file.dataUrl} alt={file.name || file.label} decoding="async" draggable={false} />
              )}
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button type="button" className="gallery-nav is-prev" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous attachment">
              <svg className="icon" aria-hidden="true"><use href="#i-chevron" /></svg>
            </button>
            <button type="button" className="gallery-nav is-next" onClick={() => goTo(index + 1)} disabled={index === count - 1} aria-label="Next attachment">
              <svg className="icon" aria-hidden="true"><use href="#i-chevron" /></svg>
            </button>
            <div className="gallery-dots">
              {files.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  className={`gallery-dot${i === index ? ' is-active' : ''}`}
                  onClick={() => goTo(i)}
                  aria-label={`Show ${f.label}`}
                  aria-current={i === index ? 'true' : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}