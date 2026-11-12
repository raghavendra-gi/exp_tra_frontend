import { memo } from 'react';
import { formatDateTime } from '../utils/format';
import { formatAccuracy, geoPoints, mapUrl } from '../utils/geo';

/*
 * "Captured location" block for the expense detail modal.
 * Renders nothing unless the employee used the location button on this expense.
 */
function CapturedLocations({ data, fields }) {
  const points = geoPoints(data, fields);
  if (!points.length) return null;

  return (
    <>
      <div className="section-title">Captured location</div>
      <div className="geo-list">
        {points.map((p) => (
          <div className="geo-item" key={p.key}>
            <div className="geo-icon"><svg className="icon" aria-hidden="true"><use href="#i-pin" /></svg></div>
            <div className="geo-text">
              <div className="geo-label">{p.label}</div>
              {p.address && <div className="geo-address">{p.address}</div>}
              <div className="geo-meta">
                {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                {p.accuracy != null && ` · ${formatAccuracy(p.accuracy)}`}
                {p.at && ` · captured ${formatDateTime(p.at)}`}
              </div>
            </div>
            <a className="btn btn-outline btn-sm geo-link" href={mapUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
              <svg className="icon" aria-hidden="true"><use href="#i-external" /></svg> View on map
            </a>
          </div>
        ))}
      </div>
    </>
  );
}

export default memo(CapturedLocations);