import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { EmptyState } from '../components/ExpenseTable';
import { expenseAPI } from '../api/client';
import { loadGoogleMaps } from '../utils/mapsLoader';
import { formatAccuracy, mapUrl } from '../utils/geo';
import { formatDateTime } from '../utils/format';

/*
 * Live tracking (Accounts and Operation Head only — the Chairman has no access to location data).
 * Shows every trip that is In Progress, where the employee's phone last reported, and — for the trip you
 * pick — the route travelled so far. The page asks the server again every 15 seconds while it is open.
 *
 * A phone sends a new point after it has moved about 25 m, so a parked phone shows an older "last update"
 * even though tracking is working.
 */

const POLL_MS = 15_000;
const FRESH_S = 5 * 60;            // newer than this = green
const STALE_S = 30 * 60;           // older than this = grey

const initials = (name) => (name || '?').trim().substring(0, 2).toUpperCase();

function ageText(seconds) {
  if (seconds < 45) return 'just now';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

function freshness(trip, extraSeconds) {
  if (!trip.last) return { tone: 'none', label: 'Waiting for first location', age: null };
  const age = trip.last.age_seconds + extraSeconds;
  const tone = age <= FRESH_S ? 'fresh' : age <= STALE_S ? 'stale' : 'old';
  return { tone, label: ageText(age), age };
}

export default function LiveTrackingPage() {
  const [trips, setTrips] = useState([]);
  const [notSharing, setNotSharing] = useState(0);              // other trips in progress whose employee did not allow tracking
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [path, setPath] = useState(null);                       // route of the selected trip
  const [mapState, setMapState] = useState('loading');          // loading | ready | unavailable
  const [, setTick] = useState(0);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);                                  // { map, libs }
  const markersRef = useRef(new Map());                         // trip id -> Marker
  const lineRef = useRef([]);                                   // route overlays
  const fittedRef = useRef(false);

  /* ───────── data ───────── */
  const load = useCallback(async () => {
    try {
      const res = await expenseAPI('/tracking/live');
      setTrips(res?.trips || []);
      setNotSharing(res?.not_sharing || 0);
      setFetchedAt(Date.now());
      setError('');
    } catch (err) {
      const msg = err?.message || '';
      setError(/^not found$/i.test(msg)
        ? 'The server does not have live tracking yet. Update and restart (redeploy) the backend, then press Refresh.'
        : (msg || 'Could not load live trips.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;
    const loop = async () => {
      if (document.visibilityState === 'visible') await load();
      if (!stopped) timer = setTimeout(loop, POLL_MS);
    };
    loop();
    const onVisible = () => { if (document.visibilityState === 'visible') { load(); setTick((n) => n + 1); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // "2 min ago" keeps moving between polls.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const selected = useMemo(() => trips.find((t) => t.expense_id === selectedId) || null, [trips, selectedId]);
  const selectedLastAt = selected?.last?.at || '';

  // The route of the picked trip; fetched again whenever a newer point arrives.
  useEffect(() => {
    if (!selectedId) { setPath(null); return undefined; }
    let cancelled = false;
    expenseAPI(`/tracking/trips/${selectedId}/path`)
      .then((res) => { if (!cancelled) setPath(res); })
      .catch((err) => { if (!cancelled) console.warn('[live] could not load the route:', err?.message || err); });
    return () => { cancelled = true; };
  }, [selectedId, selectedLastAt]);

  // The picked trip finished (it left the live list): drop the selection.
  useEffect(() => {
    if (selectedId && !loading && !trips.some((t) => t.expense_id === selectedId)) setSelectedId(null);
  }, [trips, selectedId, loading]);

  /* ───────── map ───────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maps = await loadGoogleMaps();
        const [mapsLib, markerLib, core] = await Promise.all([
          maps.importLibrary('maps'), maps.importLibrary('marker'), maps.importLibrary('core'),
        ]);
        if (cancelled || !mapDivRef.current) return;
        const map = new mapsLib.Map(mapDivRef.current, {
          center: { lat: 20.5937, lng: 78.9629 }, zoom: 5,
          mapTypeControl: false, streetViewControl: false, clickableIcons: false, gestureHandling: 'greedy',
        });
        mapRef.current = { map, Marker: markerLib.Marker || maps.Marker, Polyline: mapsLib.Polyline, Bounds: core.LatLngBounds };
        setMapState('ready');
      } catch (err) {
        console.warn('[live] map unavailable:', err?.message || err);
        if (!cancelled) setMapState('unavailable');
      }
    })();
    const markers = markersRef.current;
    return () => {
      cancelled = true;
      markers.forEach((m) => m.setMap(null));
      markers.clear();
      lineRef.current.forEach((o) => o.setMap(null));
      lineRef.current = [];
      mapRef.current = null;
    };
  }, []);

  const fitAll = useCallback(() => {
    const m = mapRef.current;
    if (!m) return;
    const withPoint = trips.filter((t) => t.last);
    if (!withPoint.length) return;
    if (withPoint.length === 1) {
      m.map.setCenter({ lat: withPoint[0].last.lat, lng: withPoint[0].last.lng });
      m.map.setZoom(15);
      return;
    }
    const b = new m.Bounds();
    withPoint.forEach((t) => b.extend({ lat: t.last.lat, lng: t.last.lng }));
    m.map.fitBounds(b, 60);
  }, [trips]);

  // One marker per trip that has reported a location.
  useEffect(() => {
    const m = mapRef.current;
    if (mapState !== 'ready' || !m) return;
    const markers = markersRef.current;
    const live = new Set();
    for (const t of trips) {
      if (!t.last) continue;
      live.add(t.expense_id);
      const pos = { lat: t.last.lat, lng: t.last.lng };
      const active = t.expense_id === selectedId;
      let marker = markers.get(t.expense_id);
      if (!marker) {
        marker = new m.Marker({ position: pos, map: m.map, title: t.employee_name });
        marker.addListener('click', () => setSelectedId(t.expense_id));
        markers.set(t.expense_id, marker);
      } else {
        marker.setPosition(pos);
      }
      marker.setLabel({ text: initials(t.employee_name), color: '#ffffff', fontWeight: '700', fontSize: '12px' });
      marker.setZIndex(active ? 1000 : 1);
      marker.setOpacity(active || !selectedId ? 1 : 0.65);
    }
    for (const [id, marker] of markers) {
      if (!live.has(id)) { marker.setMap(null); markers.delete(id); }
    }
    if (!fittedRef.current && live.size) { fittedRef.current = true; fitAll(); }
  }, [trips, selectedId, mapState, fitAll]);

  // The route of the picked trip as a line.
  useEffect(() => {
    const m = mapRef.current;
    if (mapState !== 'ready' || !m) return;
    lineRef.current.forEach((o) => o.setMap(null));
    lineRef.current = [];
    if (!selectedId || !path || path.expense_id !== selectedId || !path.points.length) return;

    const pts = path.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const line = new m.Polyline({ path: pts, map: m.map, strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 5 });
    const start = new m.Marker({ position: pts[0], map: m.map, label: 'S', title: 'Where tracking began' });
    lineRef.current = [line, start];
    if (pts.length > 1) {
      const b = new m.Bounds();
      pts.forEach((p) => b.extend(p));
      m.map.fitBounds(b, 60);
    } else {
      m.map.setCenter(pts[0]);
      m.map.setZoom(16);
    }
  }, [path, selectedId, mapState]);

  /* ───────── render ───────── */
  const extra = Math.max(0, (Date.now() - fetchedAt) / 1000);
  const reporting = trips.filter((t) => t.last).length;
  const empty = !loading && !trips.length && !error;

  // The map stays mounted while the list is empty (it is only hidden); tell it to re-measure when it comes back.
  useEffect(() => {
    if (!empty && mapState === 'ready') window.google?.maps?.event?.trigger(mapRef.current?.map, 'resize');
  }, [empty, mapState]);

  const headerRight = (
    <button type="button" className="btn btn-outline" onClick={load}>
      <svg className="icon" aria-hidden="true"><use href="#i-spinner" /></svg>
      <span className="btn-text">Refresh</span>
    </button>
  );

  return (
    <Layout
      title="Live tracking"
      subtitle={loading ? 'Loading…' : `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} sharing their location · ${reporting} reporting a position`}
      headerRight={headerRight}
    >
      {error && (
        <div className="form-banner banner-error" role="alert" style={{ margin: '0 0 var(--sp-3)' }}>
          <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
          <span>{error}</span>
        </div>
      )}

      {empty && (
        <div className="card">
          <EmptyState
            icon="i-route"
            title="No trips are sharing their location"
            text="A trip appears here after the employee submits it and taps “Allow tracking”."
          />
        </div>
      )}

      <div className="live-grid" hidden={empty}>
          <div className="live-map-col">
            <div className="live-map" ref={mapDivRef} hidden={mapState === 'unavailable'} />
            {mapState === 'unavailable' && (
              <p className="live-note">The map could not load. Use “Open in Google Maps” on a trip to see where it is.</p>
            )}
            <div className="live-map-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSelectedId(null); fitAll(); }}>
                Show all trips
              </button>
              {selected && path && path.expense_id === selected.expense_id && (
                <span className="live-note" style={{ margin: 0 }}>
                  Route so far: <strong>{path.distance_km.toFixed(1)} km</strong> (approx.) from {path.count} {path.count === 1 ? 'point' : 'points'}
                </span>
              )}
            </div>
          </div>

          <ul className="live-list" aria-label="Trips in progress">
            {loading && <li className="live-item is-loading"><span className="skeleton" style={{ width: '60%' }} /></li>}
            {trips.map((t) => {
              const f = freshness(t, extra);
              const active = t.expense_id === selectedId;
              return (
                <li key={t.expense_id}>
                  <button
                    type="button"
                    className={`live-item${active ? ' is-active' : ''}`}
                    onClick={() => setSelectedId(active ? null : t.expense_id)}
                    aria-pressed={active}
                  >
                    <span className="avatar avatar-sm" aria-hidden="true">{initials(t.employee_name)}</span>
                    <span className="live-item-main">
                      <span className="live-item-name">{t.employee_name}</span>
                      <span className="live-item-sub">
                        #{t.expense_id} · {t.type}{t.from ? ` · from ${t.from}` : ''}
                      </span>
                      <span className="live-item-sub">Started {formatDateTime(t.started_at)}</span>
                      <span className={`live-badge is-${f.tone}`}>
                        <span className="live-dot" aria-hidden="true" />
                        {t.last ? `Last update ${f.label}` : f.label}
                      </span>
                      {t.last && (
                        <span className="live-item-sub">
                          {formatAccuracy(t.last.accuracy) || 'accuracy unknown'}
                          {t.last.speed != null && t.last.speed >= 0.5 ? ` · ${Math.round(t.last.speed * 3.6)} km/h` : ''}
                          {` · ${t.points} ${t.points === 1 ? 'point' : 'points'}`}
                        </span>
                      )}
                    </span>
                    {t.last && (
                      <a
                        className="live-item-link"
                        href={mapUrl(t.last.lat, t.last.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in Google Maps"
                      >
                        <svg className="icon" aria-hidden="true"><use href="#i-external" /></svg>
                        <span className="sr-only">Open in Google Maps</span>
                      </a>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
      </div>

      {notSharing > 0 && (
        <p className="live-note" role="status" style={{ marginTop: 'var(--sp-3)' }}>
          {notSharing === 1
            ? '1 other trip is in progress but is not sharing its location.'
            : `${notSharing} other trips are in progress but are not sharing their location.`}
        </p>
      )}

      {trips.length > 0 && reporting === 0 && (
        <p className="live-note" role="status" style={{ marginTop: 'var(--sp-3)' }}>
          No trip has sent a location yet. The employee has to open the app (or the website) while the trip is in progress,
          tap “Allow tracking”, and allow location on the phone or browser.
        </p>
      )}

      <p className="live-note" style={{ marginTop: 'var(--sp-3)' }}>
        A phone sends a new point after it moves about 25 metres, so a parked phone shows an older “last update” even though tracking is working.
      </p>
    </Layout>
  );
}
