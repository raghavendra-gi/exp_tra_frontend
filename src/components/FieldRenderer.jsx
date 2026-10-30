import { memo, useRef, useState } from 'react';
import PlaceInput from './PlaceInput';
import RoutePanel from './RoutePanel';
import CameraModal from './CameraModal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';

function FieldWrapper({ field, children }) {
  const id = `f_${field.key}`;
  const req = field.required ? <span className="req" aria-hidden="true">*</span> : null;
  return (
    <div className="form-group" id={`wrap_${field.key}`}>
      {field.label && <label htmlFor={id}>{field.label}{req}</label>}
      {children}
    </div>
  );
}

const ACCEPT = 'image/png,image/jpeg,application/pdf';
const ACCEPT_SET = new Set(ACCEPT.split(','));

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileField({ field, value, onChange }) {
  const fileList = Array.isArray(value) ? value : [];
  const inputRef = useRef(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const add = (picked) => {
    const ok = picked.filter((f) => !f.type || ACCEPT_SET.has(f.type));
    if (ok.length) onChange(field.key, [...fileList, ...ok]); // always append
  };

  const handleFilePick = (e) => {
    add(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removeFile = (index) => onChange(field.key, fileList.filter((_, i) => i !== index));
  const openPicker = () => inputRef.current?.click();

  const dnd = {
    onDragOver: (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop: (e) => { e.preventDefault(); setDragOver(false); add(Array.from(e.dataTransfer?.files || [])); },
  };

  return (
    <FieldWrapper field={field}>
      <div
        className={`upload-box has-file${dragOver ? ' drag-active' : ''}`}
        style={{ minHeight: fileList.length ? 'auto' : '180px' }}
        {...dnd}
      >
        {fileList.length === 0 ? (
          <div className="upload-box-empty">
            <div className="upload-box-title">{field.title || 'Upload ' + field.label}</div>
            <div className="upload-box-sub">{field.hint || 'Tap to upload image'}</div>
            <div className="upload-box-actions">
              <button type="button" className="btn btn-secondary" id={`f_${field.key}`} onClick={openPicker}>
                <svg className="icon" aria-hidden="true"><use href="#i-upload" /></svg> Upload
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIsCameraOpen(true)} aria-label="Take a photo">
                <svg className="icon" aria-hidden="true"><use href="#i-camera" /></svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="file-thumb" style={{ width: '100%' }}>
            {fileList.map((file, i) => (
              <div key={file.id || `${file.name}-${i}`} className="file-line">
                <svg className="icon" aria-hidden="true"><use href={file.type === 'application/pdf' ? '#i-pdf' : '#i-receipt'} /></svg>
                <span className="file-thumb-text" style={{ flex: 1, textAlign: 'left' }} title={file.name}>
                  {file.name}
                  {file.size ? <span className="file-size"> · {fmtSize(file.size)}</span> : null}
                  {file.dataUrl && (
                    <span style={{ color: 'var(--st-good-ink)', marginLeft: 8, fontSize: 11 }}>✓ saved</span>
                  )}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeFile(i)} aria-label={`Remove ${file.name}`}>
                  Remove
                </button>
              </div>
            ))}
            <div className="btn-row" style={{ marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary btn-sm" id={`f_${field.key}`} onClick={openPicker}>
                + Add more
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsCameraOpen(true)} aria-label="Take a photo">
                <svg className="icon" aria-hidden="true"><use href="#i-camera" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" id={`file_${field.key}`} hidden accept={ACCEPT} multiple onChange={handleFilePick} />

      {isCameraOpen && (
        <CameraModal
          isOpen
          onClose={() => setIsCameraOpen(false)}
          onCapture={(file) => {
            onChange(field.key, [...fileList, file]); // always append new photo
            setIsCameraOpen(false);
          }}
        />
      )}
    </FieldWrapper>
  );
}

function CheckboxesField({ field, value, onChange }) {
  const selected = Array.isArray(value) ? value : [];
  const known = new Set(field.options);
  const extras = selected.filter((v) => !known.has(v));
  const hasOther = extras.length > 0;

  const toggleOption = (opt) => {
    const next = selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt];
    onChange(field.key, next);
  };
  const toggleOther = () => {
    if (hasOther) onChange(field.key, selected.filter((v) => known.has(v)));
    else onChange(field.key, [...selected, '']);
  };
  const handleOtherText = (text) => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    onChange(field.key, [...selected.filter((v) => known.has(v)), ...parts]);
  };

  return (
    <FieldWrapper field={field}>
      <div className="items-grid" role="group" aria-label={field.label} id={`f_${field.key}`} tabIndex={-1}>
        {field.options.map((opt) => (
          <label className="item-label" key={opt}>
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} />
            {opt}
          </label>
        ))}
        {field.allowOther && (
          <label className="item-label">
            <input type="checkbox" checked={hasOther} onChange={toggleOther} />
            Other
          </label>
        )}
      </div>

      {field.allowOther && hasOther && (
        <div className="other-input visible" style={{ marginTop: '6px' }}>
          <input
            type="text"
            placeholder="Specify other item(s), comma separated"
            value={extras.join(', ')}
            onChange={(e) => handleOtherText(e.target.value)}
            maxLength={160}
            aria-label="Other items"
          />
        </div>
      )}

      {selected.length > 0 && (
        <div className="selected-summary visible">
          <strong>{selected.length} selected:</strong> {selected.filter(Boolean).join(', ')}
        </div>
      )}
    </FieldWrapper>
  );
}

/*
 * Memoised: a field only re-renders when its own value changes. Before, every
 * keystroke anywhere re-rendered every field on the form (including the date
 * picker and the place inputs). `allValues` is only passed to route fields.
 */
function FieldRenderer({ field, value, onChange, allValues = {}, invalid = false }) {
  const id = `f_${field.key}`;
  const aria = invalid ? { 'aria-invalid': true, 'aria-describedby': `err_${field.key}` } : {};

  switch (field.type) {
    case 'text':
      return (
        <FieldWrapper field={field}>
          <input
            type="text"
            id={id}
            placeholder={field.placeholder || ''}
            value={value || ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            maxLength={120}
            {...aria}
          />
        </FieldWrapper>
      );

    case 'place':
      return (
        <FieldWrapper field={field}>
          <PlaceInput id={id} field={field} value={value} onChange={onChange} placeholder={field.placeholder} />
        </FieldWrapper>
      );

    case 'route':
      return (
        <RoutePanel field={field} allValues={allValues} onKmUpdate={(km) => onChange(field.kmKey, km)} />
      );

    case 'number': {
      const input = (
        <input
          type="number"
          id={id}
          step="0.01"
          min={field.min}
          inputMode="decimal"
          placeholder={field.placeholder || ''}
          value={value ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
          onWheel={(e) => e.currentTarget.blur()} /* scrolling the page must not change the amount */
          {...aria}
        />
      );
      return (
        <FieldWrapper field={field}>
          {field.money ? (
            <span className="input-affix">
              <span className="affix" aria-hidden="true">₹</span>
              {input}
            </span>
          ) : input}
        </FieldWrapper>
      );
    }

    case 'date': {
      // Stored as YYYY-MM-DD; 'T00:00:00' keeps the picker from shifting a day by timezone.
      const selectedDate = value ? new Date(value + 'T00:00:00') : null;
      return (
        <FieldWrapper field={field}>
          <DatePicker
            id={id}
            selected={selectedDate}
            onChange={(date) => onChange(field.key, date ? format(date, 'yyyy-MM-dd') : '')}
            dateFormat="dd-MM-yyyy"
            placeholderText="dd-mm-yyyy"
            className="input"
            /* Opens below the field. 'right-start' had no room next to the full-width
               input, so on laptops the calendar flipped left and hid behind the sidebar. */
            popperPlacement="bottom-start"
            showPopperArrow={false}
            autoComplete="off"
            {...aria}
          />
        </FieldWrapper>
      );
    }

    case 'textarea':
      return (
        <FieldWrapper field={field}>
          <textarea
            id={id}
            rows="3"
            maxLength={600}
            placeholder={field.placeholder || ''}
            value={value || ''}
            onChange={(e) => onChange(field.key, e.target.value)}
            {...aria}
          />
        </FieldWrapper>
      );

    case 'select':
      return (
        <FieldWrapper field={field}>
          <select id={id} value={value || ''} onChange={(e) => onChange(field.key, e.target.value)} {...aria}>
            <option value="">{field.placeholder || 'Select…'}</option>
            {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </FieldWrapper>
      );

    case 'chips':
      return (
        <FieldWrapper field={field}>
          <div className="chip-row" role="group" aria-label={field.label} id={id} tabIndex={-1}>
            {field.options.map((opt) => (
              <button
                key={opt}
                type="button"
                className="chip"
                aria-pressed={value === opt}
                onClick={() => onChange(field.key, value === opt ? '' : opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </FieldWrapper>
      );

    case 'checkboxes':
      return <CheckboxesField field={field} value={value} onChange={onChange} />;

    case 'file':
      return <FileField field={field} value={value} onChange={onChange} />;

    default:
      return (
        <FieldWrapper field={field}>
          <p className="muted">Unknown field type: {field.type}</p>
        </FieldWrapper>
      );
  }
}

export default memo(FieldRenderer);
