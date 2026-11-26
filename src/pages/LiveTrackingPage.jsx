import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { EmptyState } from '../components/ExpenseTable';
import { expenseAPI } from '../api/client';
import { loadGoogleMaps, mapsAuthFailed } from '../utils/mapsLoader';
import { formatAccuracy, mapUrl } from '../utils/geo';
import { formatDateTime } from '../utils/format';

/*
 * Live tracking (Accounts and Operation Head only — the Chairman has no access to location data).
 * Shows every trip that is In Progress and where the employee's phone last reported.
 * Pick one user (from the list, the drop-down or a pin) and the map shows ONLY that person: their current
 * position, an accuracy circle and the route travelled so far. "Show all trips" brings everybody back.
 * The picked trip is kept in the address (#/live?trip=54), so a refresh or a shared link opens the same user.
 * The page asks the server again every 15 seconds while it is open.
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
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('trip')) || null;        // the picked trip lives in the address
  const setSelectedId = useCallback(
    (id) => setParams(id ? { trip: String(id) } : {}, { replace: true }),
    [setParams],
  );
  const [path, setPath] = useState(null);                       // route of the selected trip
  const [mapState, setMapState] = useState('loading');          // loading | ready | unavailable
  const [keyRejected, setKeyRejected] = useState(() => mapsAuthFailed());   // Google refused the key for this app's address
  const [, setTick] = useState(0);

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);                                  // { map, libs }
  const markersRef = useRef(new Map());                         // trip id -> Marker
  const lineRef = useRef([]);                                   // route overlays
  const circleRef = useRef(null);                               // accuracy circle of the picked trip
  const fittedRef = useRef(false);
  const routeFitRef = useRef(null);                             // trip id whose route the map was already fitted to

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

  // Google shows its own "Oops! Something went wrong" box when it refuses the key for this address; explain it here.
  useEffect(() => {
    const onRejected = () => setKeyRejected(true);
    window.addEventListener('maps-auth-failed', onRejected);
    return () => window.removeEventListener('maps-auth-failed', onRejected);
  }, []);

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
        mapRef.current = { map, Marker: markerLib.Marker || maps.Marker, Polyline: mapsLib.Polyline, Circle: mapsLib.Circle, Bounds: core.LatLngBounds };
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
      circleRef.current?.setMap(null);
      circleRef.current = null;
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

  // One marker per trip that has reported a location. When a user is picked, only that user's pin is drawn.
  useEffect(() => {
    const m = mapRef.current;
    if (mapState !== 'ready' || !m) return;
    const markers = markersRef.current;
    const live = new Set();
    for (const t of trips) {
      if (!t.last) continue;
      if (selectedId && t.expense_id !== selectedId) continue;
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
    }
    for (const [id, marker] of markers) {
      if (!live.has(id)) { marker.setMap(null); markers.delete(id); }
    }
    if (!fittedRef.current && live.size) { fittedRef.current = true; fitAll(); }
  }, [trips, selectedId, mapState, fitAll]);

  // Accuracy circle around the picked user's current position.
  useEffect(() => {
    const m = mapRef.current;
    if (mapState !== 'ready' || !m) return;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    const last = selected?.last;
    if (!last || !Number.isFinite(last.accuracy) || last.accuracy <= 0) return;
    circleRef.current = new m.Circle({
      map: m.map, center: { lat: last.lat, lng: last.lng }, radius: last.accuracy,
      strokeColor: '#2563eb', strokeOpacity: 0.5, strokeWeight: 1, fillColor: '#2563eb', fillOpacity: 0.12, clickable: false,
    });
  }, [selected, mapState]);

  // A user was picked: go to their pin straight away (the route fits the view once it arrives).
  useEffect(() => {
    const m = mapRef.current;
    if (mapState !== 'ready' || !m || !selectedId) return;
    const last = trips.find((t) => t.expense_id === selectedId)?.last;
    if (last && routeFitRef.current !== selectedId) {
      m.map.setCenter({ lat: last.lat, lng: last.lng });
      m.map.setZoom(16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mapState, loading]);

  const showAll = useCallback(() => {
    routeFitRef.current = null;
    setSelectedId(null);
    fitAll();
  }, [setSelectedId, fitAll]);

  // The route of the picked trip as a line.
  useEffect(() => {
    const m = mapRef.current;
    if (mapState !== 'ready' || !m) return;
    lineRef.current.forEach((o) => o.setMap(null));
    lineRef.current = [];
    if (!selectedId) { routeFitRef.current = null; return; }
    if (!path || path.expense_id !== selectedId || !path.points.length) return;

    const pts = path.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    const line = new m.Polyline({ path: pts, map: m.map, strokeColor: '#2563eb', strokeOpacity: 0.9, strokeWeight: 5 });
    const start = pts.length > 1 ? new m.Marker({ position: pts[0], map: m.map, label: 'S', title: 'Where tracking began' }) : null;
    lineRef.current = start ? [line, start] : [line];
    if (routeFitRef.current !== selectedId) {        // fit once per user, so the 15 s refresh never fights the person's panning
      routeFitRef.current = selectedId;
      if (pts.length > 1) {
        const b = new m.Bounds();
        pts.forEach((p) => b.extend(p));
        m.map.fitBounds(b, 60);
      } else {
        m.map.setCenter(pts[0]);
        m.map.setZoom(16);
      }
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

      {keyRejected && (
        <div className="form-banner banner-warn" role="alert" style={{ margin: '0 0 var(--sp-3)' }}>
          <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
          <span>
            Google Maps did not accept this app&apos;s address (<strong>{window.location.origin}</strong>), so the map cannot show.
            In Google Cloud, open APIs &amp; Services → Credentials → your Maps key → Website restrictions and add
            {' '}<strong>{window.location.origin}/*</strong>, then wait a few minutes. Until then, use the arrow button on a trip to open it in Google Maps.
          </span>
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
            <div className="live-toolbar">
              <div className="form-group live-picker">
                <label htmlFor="live-user">Show on map</label>
                <select id="live-user" value={selectedId ?? ''} onChange={(e) => (e.target.value ? setSelectedId(Number(e.target.value)) : showAll())}>
                  <option value="">All trips ({trips.length})</option>
                  {trips.map((t) => (
                    <option key={t.expense_id} value={t.expense_id}>
                      {t.employee_name} · #{t.expense_id}{t.last ? '' : ' (no location yet)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="live-map" ref={mapDivRef} hidden={mapState === 'unavailable'} />
            {mapState === 'unavailable' && (
              <p className="live-note">The map could not load. Use “Open in Google Maps” on a trip to see where it is.</p>
            )}
            <div className="live-map-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={showAll}>
                Show all trips
              </button>
              {selected && (
                <span className="live-note" style={{ margin: 0 }}>Showing only <strong>{selected.employee_name}</strong>.</span>
              )}
            </div>

            {selected && (() => {
              const f = freshness(selected, extra);
              const hasPath = path && path.expense_id === selected.expense_id;
              const last = selected.last;
              return (
                <section className="live-detail" aria-label={`Details for ${selected.employee_name}`}>
                  <div className="live-detail-head">
                    <span className="avatar avatar-sm" aria-hidden="true">{initials(selected.employee_name)}</span>
                    <div>
                      <div className="live-item-name">{selected.employee_name}</div>
                      <div className="live-item-sub">#{selected.expense_id} · {selected.type}{selected.from ? ` · from ${selected.from}` : ''}</div>
                    </div>
                    <span className={`live-badge is-${f.tone}`}><span className="live-dot" aria-hidden="true" />{last ? `Last update ${f.label}` : f.label}</span>
                  </div>
                  <dl className="live-stats">
                    <div><dt>Started</dt><dd>{formatDateTime(selected.started_at)}</dd></div>
                    <div><dt>Distance so far</dt><dd>{hasPath ? `${path.distance_km.toFixed(1)} km (approx.)` : '…'}</dd></div>
                    <div><dt>Points</dt><dd>{hasPath ? path.count : selected.points}</dd></div>
                    <div><dt>Speed</dt><dd>{last && last.speed != null ? `${Math.round(last.speed * 3.6)} km/h` : '—'}</dd></div>
                    <div><dt>Accuracy</dt><dd>{(last && formatAccuracy(last.accuracy)) || '—'}</dd></div>
                    <div>
                      <dt>Position</dt>
                      <dd>{last ? <a href={mapUrl(last.lat, last.lng)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a> : 'Waiting for first location'}</dd>
                    </div>
                  </dl>
                </section>
              );
            })()}
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
