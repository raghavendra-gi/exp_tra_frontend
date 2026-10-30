import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import { expenseAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import FieldRenderer from '../components/FieldRenderer';
import { fileToDataUrl, compressImage, newFileId } from '../utils/fileUtils';
import { invalidateExpenses } from '../hooks/useExpenses';
import { todayKey } from '../utils/dates';
import TypeIcon from '../components/TypeIcon';

/**
 * Guard component. With no expense type there is no form to show.
 * This check lives in its own component so the form below never calls a hook
 * conditionally (an early `return` before `useState` breaks React's rules of hooks
 * and can crash with "rendered fewer hooks than expected").
 * `key={location.key}` also resets the form when you open another expense.
 */
export default function ExpenseFormPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const expenseType = location.state?.editingExpense?.type || location.state?.expenseType;

  if (!expenseType || !EXPENSE_TYPES[expenseType]) {
    return (
      <Layout title="Submit Expense">
        <div className="card">
          <p style={{ marginBottom: 'var(--sp-4)' }}>No expense type selected.</p>
          <button className="btn btn-primary" onClick={() => navigate('/new')}>
            Pick a category
          </button>
        </div>
      </Layout>
    );
  }
  return <ExpenseForm key={location.key} />;
}

// These fields take the full width of the form; the rest sit two to a row on wide screens.
const WIDE_TYPES = new Set(['checkboxes', 'file', 'textarea', 'route', 'place', 'chips']);

/** Turn a picked File into the stored { id, name, type, size, dataUrl } shape. */
async function toStoredFile(file) {
  if (file.dataUrl) {
    // Already saved — keep as-is
    return { id: file.id || newFileId(), name: file.name, type: file.type, size: file.size, dataUrl: file.dataUrl };
  }
  const processed = await compressImage(file);
  const dataUrl = await fileToDataUrl(processed);
  return { id: newFileId(), name: file.name, type: processed.type || file.type, size: processed.size, dataUrl };
}

function ExpenseForm() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  // Mode detection
  const editingExpense = location.state?.editingExpense || null;
  const resubmitMode = location.state?.resubmit === true;
  const expenseType = editingExpense?.type || location.state?.expenseType;

  const config = EXPENSE_TYPES[expenseType];
  const isEditing = !!editingExpense;

  // ── Figure out the current stage ──
  //   • New two-stage trip → 'start'
  //   • Existing two-stage trip (edit or End trip) → 'end'
  //   • Any other type → null
  const [currentStage] = useState(() => {
    if (!config.twoStage) return null;
    if (location.state?.stage) return location.state.stage;   // dashboard "End trip"
    if (editingExpense) return 'end';                          // editing existing trip
    return 'start';                                            // brand new
  });

  const visibleFields = useMemo(
    () => (config.twoStage ? config.fields.filter((f) => f.stage === currentStage) : config.fields),
    [config, currentStage],
  );

  // Initial values (pre-fill if editing)
  // New expenses start with their date filled in: the day picked on the dashboard
  // calendar, else today (fields marked `default: 'today'`).
  const [values, setValues] = useState(() => {
    if (editingExpense) return editingExpense.data || {};
    const preset = /^\d{4}-\d{2}-\d{2}$/.test(location.state?.presetDate || '') ? location.state.presetDate : '';
    const init = {};
    for (const f of visibleFields) {
      if (f.type === 'date' && f.default === 'today') init[f.key] = preset || todayKey();
    }
    return init;
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Stable identity → memoised fields only re-render when their own value changes.
  const handleChange = useCallback((key, val) => {
    setValues((prev) => (prev[key] === val ? prev : { ...prev, [key]: val }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  }, []);

  // ── Validation (only for visible fields) ──
  const validate = () => {
    const newErrors = {};
    for (const field of visibleFields) {
      if (field.showIf && !field.showIf(values)) continue;
      const v = values[field.key];

      if (field.required) {
        if (field.type === 'checkboxes' || field.type === 'file') {
          if (!v || !v.length) {
            newErrors[field.key] = field.type === 'file'
              ? 'Please attach at least one file.'
              : 'Please select at least one.';
          }
        } else if (v === '' || v === null || v === undefined) {
          newErrors[field.key] = 'This field is required.';
        }
      }

      if (field.type === 'number' && v !== '' && v !== undefined) {
        const n = Number(v);
        if (isNaN(n)) newErrors[field.key] = 'Enter a valid number.';
        else if (field.min !== undefined && n < field.min) {
          newErrors[field.key] = `Must be at least ${field.min}.`;
        }
      }
    }
    setErrors(newErrors);
    return newErrors;
  };

  // ── File handling — all files are compressed in parallel ──
  const prepareFilesForSubmit = async () => {
    const dataWithFiles = { ...values };
    const fileFields = visibleFields.filter((f) => f.type === 'file');
    await Promise.all(fileFields.map(async (field) => {
      const list = values[field.key];
      dataWithFiles[field.key] = Array.isArray(list) && list.length
        ? await Promise.all(list.map(toStoredFile))
        : [];
    }));
    return dataWithFiles;
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isBusy) return;
    setFormError('');
    const found = validate();
    const firstBad = visibleFields.find((f) => found[f.key]);
    if (firstBad) {
      setFormError('Please fix the highlighted fields.');
      // Take the person straight to the first problem.
      const el = document.getElementById(`wrap_${firstBad.key}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector('input, select, textarea, button, [tabindex]')?.focus({ preventScroll: true });
      return;
    }

    setIsBusy(true);
    try {
      // Merge with existing data so we don't lose stage-1 fields when PUT-ing stage-2
      const stageData = await prepareFilesForSubmit();
      const mergedData = isEditing ? { ...editingExpense.data, ...stageData } : stageData;

      if (isEditing) {
        // ── UPDATE / END TRIP ──
        await expenseAPI(`/expenses/${editingExpense.id}`, {
          method: 'PUT',
          body: JSON.stringify({ data: mergedData }),
        });

        if (config.twoStage && currentStage === 'end') toast('Trip ended and submitted.', 'success');
        else if (resubmitMode) toast('Expense resubmitted.', 'success');
        else toast('Expense updated.', 'success');
      } else {
        // ── CREATE NEW ──
        await expenseAPI('/expenses', {
          method: 'POST',
          body: JSON.stringify({
            type: expenseType,
            data: mergedData,
            stage: currentStage || 'submit',   // 'start' for Regional Trip, 'submit' otherwise
          }),
        });

        if (config.twoStage && currentStage === 'start') {
          toast('Trip started. End it from the dashboard when you arrive.', 'success', { duration: 6000 });
        } else {
          toast('Expense submitted.', 'success');
        }
      }

      invalidateExpenses();
      navigate('/my');
    } catch (err) {
      console.error(err);
      setFormError(err.message || 'Failed to save expense.');
    } finally {
      setIsBusy(false);
    }
  };

  // ── Labels ──
  const backTarget = isEditing ? '/my' : '/new';

  const pageTitle = config.twoStage
    ? (currentStage === 'start' ? config.startTitle || `Start ${expenseType}` : config.endTitle || `End ${expenseType}`)
    : resubmitMode
      ? `Resubmit · ${expenseType}`
      : isEditing
        ? `Edit · ${expenseType}`
        : config.title || expenseType;

  const submitLabel = config.twoStage
    ? (currentStage === 'start' ? 'Start trip' : 'End trip & submit')
    : resubmitMode
      ? 'Resubmit for approval'
      : isEditing
        ? 'Save changes'
        : 'Submit request';

  const pageSubtitle = config.twoStage
    ? (currentStage === 'start' ? 'Step 1 of 2: where you are starting' : 'Step 2 of 2: where you arrived')
    : resubmitMode
      ? 'Fix what was flagged and send it again'
      : isEditing
        ? `Request #${editingExpense.id}`
        : 'Fill in the details and attach the bill';

  // ── Regional Trip summary card (stage 2 only) ──
  const startLocation = editingExpense?.data?.startLocation || '';
  const showTripSummary = config.twoStage && currentStage === 'end';

  const renderField = (field) => (
    <div key={field.key} className={`field field-${field.type}${WIDE_TYPES.has(field.type) ? ' span-2' : ''}`}>
      <FieldRenderer
        field={field}
        value={values[field.key]}
        onChange={handleChange}
        allValues={field.type === 'route' ? values : undefined}
        invalid={!!errors[field.key]}
      />
      {errors[field.key] && (
        <div className="field-error" role="alert" id={`err_${field.key}`}>
          <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg> {errors[field.key]}
        </div>
      )}
    </div>
  );

  return (
    <Layout title={pageTitle} subtitle={pageSubtitle}>
      <div className="card form-card">
        <div className="form-card-head">
          <TypeIcon type={expenseType} size="lg" />
          <div>
            <h2 className="card-heading">{config.title || expenseType}</h2>
            <p className="form-card-sub">Fields marked <span className="req">*</span> are required.</p>
          </div>
        </div>

        {resubmitMode && editingExpense?.rejection_reason && (
          <div className="form-banner banner-warn">
            <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
            <span>Fix what was flagged and resubmit. Reason: “{editingExpense.rejection_reason}”</span>
          </div>
        )}

        {config.twoStage && currentStage === 'start' && (
          <div className="form-banner banner-info">
            <svg className="icon" aria-hidden="true"><use href="#i-info" /></svg>
            <span>Fill in where you're starting and upload the start meter. You'll add the destination and end meter later.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate aria-busy={isBusy || undefined}>
          {/* Trip Summary Card — shown only on stage 'end' */}
          {showTripSummary && (
            <div className="trip-summary-card">
              <div className="trip-summary-heading">Trip Details</div>
              <div className="trip-summary-grid">
                <div className="trip-summary-item">
                  <div className="trip-summary-label">Start Location</div>
                  <div className="trip-summary-value">{startLocation || '—'}</div>
                </div>
                <div className="trip-summary-item">
                  {visibleFields.filter((f) => f.key === 'endLocation').map(renderField)}
                </div>
              </div>

              <div className="trip-summary-divider" />

              {visibleFields.filter((f) => f.key === 'distanceKm').map(renderField)}
            </div>
          )}

          {/* Remaining fields */}
          <div className="form-grid">
            {visibleFields
              .filter((f) => !(showTripSummary && ['endLocation', 'distanceKm'].includes(f.key)))
              .filter((f) => !f.showIf || f.showIf(values))
              .map(renderField)}
          </div>

          {formError && (
            <div className="form-banner banner-error" role="alert">
              <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
              <span>{formError}</span>
            </div>
          )}

          <div className="btn-row btn-row-end form-actions">
            <button type="button" className="btn btn-outline" onClick={() => navigate(backTarget)} disabled={isBusy}>
              {isEditing ? 'Cancel' : 'Back'}
            </button>
            <button
              type="submit"
              className={`btn ${config.twoStage && currentStage === 'start' ? 'btn-success' : 'btn-primary'} ${isBusy ? 'is-busy' : ''}`}
              disabled={isBusy}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}