import { useLocation, useNavigate } from 'react-router-dom';
import { EXPENSE_TYPES } from '../constants/expenseTypes';
import Layout from '../components/Layout';
import { dayLong } from '../utils/dates';
import TypeIcon from '../components/TypeIcon';

const TYPES = Object.keys(EXPENSE_TYPES);

// One line under each category so people know which one to pick.
const DESCRIPTIONS = {
  'Pooja': 'Flowers, camphor, ghee and other pooja items',
  'Food': 'Tiffin, lunch or dinner while on duty',
  'Plan Trip': 'Bus, train, flight or own-vehicle travel',
  'Regional Trip': 'Start when you leave, end when you arrive',
  'Accommodation': 'Hotel stays, with food if included',
  'Inauguration': 'Costs for an opening or launch event',
  'Couriers': 'Parcels and documents sent by courier',
  'Gifts': 'Gifts for clients, staff or occasions',
  'Miscellaneous': 'Anything that doesn’t fit the others',
};

// Start downloading the form (and its date picker) as soon as a card is hovered or touched.
const preloadForm = () => { import('./ExpenseFormPage'); };

export default function SelectExpenseTypePage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Set when coming from a day on the dashboard calendar.
  const presetDate = /^\d{4}-\d{2}-\d{2}$/.test(location.state?.presetDate || '') ? location.state.presetDate : '';

  const handleSelect = (type) => {
    navigate('/form', { state: { expenseType: type, ...(presetDate ? { presetDate } : {}) } });
  };

  return (
    <Layout title="New expense" subtitle="Choose what you’re claiming for">
      {presetDate && (
        <div className="form-banner banner-info preset-banner" role="status">
          <svg className="icon" aria-hidden="true"><use href="#i-calendar" /></svg>
          <span>Filing for <strong>{dayLong(presetDate)}</strong>. You can still change the date on the form.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/new', { replace: true })}>Use today</button>
        </div>
      )}
      <div className="type-grid" onPointerEnter={preloadForm} onTouchStart={preloadForm}>
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="type-btn"
            onClick={() => handleSelect(type)}
          >
            <TypeIcon type={type} size="lg" />
            <span className="type-text">
              <span className="type-title">
                {type}
                {EXPENSE_TYPES[type].twoStage && <span className="type-tag">2 steps</span>}
              </span>
              <span className="type-desc">{DESCRIPTIONS[type]}</span>
            </span>
            <svg className="icon type-chevron" aria-hidden="true"><use href="#i-arrow-right" /></svg>
          </button>
        ))}
      </div>
    </Layout>
  );
}