/*
 * Helpers for the location that is saved with an expense.
 *
 * Where it lives: expense.data["<field>Geo"], e.g. data.fromGeo or data.startLocationGeo:
 *   { lat, lng, accuracy (metres), at (ISO time the person pressed the location button) }
 * Only the "Use my current location" button creates it; typing a place clears it.
 */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** "±25 m" or "±2.3 km" */
export function formatAccuracy(metres) {
  if (!isNum(metres) || metres < 0) return '';
  return metres >= 1000 ? `±${(metres / 1000).toFixed(1)} km` : `±${Math.round(metres)} m`;
}

/** Opens in Google Maps. No API key or billing needed. */
export function mapUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Every valid saved location inside an expense's data.
 * `fields` (optional) is the expense type's field list, used to show the field's label.
 */
export function geoPoints(data, fields = []) {
  const labels = Object.fromEntries((fields || []).map((f) => [f.key, f.label || f.title || f.key]));
  const out = [];
  for (const [key, v] of Object.entries(data || {})) {
    if (!key.endsWith('Geo') || !v || !isNum(v.lat) || !isNum(v.lng)) continue;
    const base = key.slice(0, -3);
    out.push({
      key,
      label: labels[base] || base,
      lat: v.lat,
      lng: v.lng,
      accuracy: isNum(v.accuracy) ? v.accuracy : null,
      at: typeof v.at === 'string' ? v.at : '',
      address: typeof data[base] === 'string' ? data[base] : '',
    });
  }
  return out;
}