import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { loadGoogleMaps, mapsAuthFailed, mapsErrorMessage, MAPS_MESSAGES } from '../utils/mapsLoader';
import { computeDrivingRoute, googleMapsDirectionsUrl } from '../utils/routeService';
import { formatAccuracy, mapUrl } from '../utils/geo';
import { formatDateTime } from '../utils/format';

/*
 * Shows one captured start location on a map and, when the trip has a destination,
 * the driving route from that exact GPS point to it (distance, time, line on the map).
 *
 *   trip = { title, employee, label, address, start: { lat, lng, accuracy, at }, destination }
 *
 * The map is optional: if Google Maps cannot load, the details and the
 * "Open in Google Maps" link still work.
 */
export default function TripRouteModal({ trip, onClose }) {
  const { start, destination } = trip;
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  const [mapState, setMapState] = useState('loading');       // loading | ready | unavailable
  const [routeState, setRouteState] = useState(destination ? 'loading' : 'none'); // none | loading | ready | error
  const [route, setRoute] = useState(null);
  const [routeError, setRouteError] = useState('');

  /* 1. Work out the driving route from the captured point to the destination. */
  useEffect(() => {
    if (!destination) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const result = await computeDrivingRoute({ lat: start.lat, lng: start.lng }, destination, { fallback: true });
        if (!cancelled) { setRoute(result); setRouteState('ready'); }
      } catch (err) {
        if (cancelled) return;
        console.error('[TripRouteModal] route failed:', err);
        setRouteError(mapsAuthFailed() ? MAPS_MESSAGES.AUTH : mapsErrorMessage(err));
        setRouteState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [start.lat, start.lng, destination]);

  /* 2. Create the map and drop a pin on the captured start location. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maps = await loadGoogleMaps();
        const [mapsLib, markerLib] = await Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')]);
        if (cancelled || !mapDivRef.current) return;
        const map = new mapsLib.Map(mapDivRef.current, {
          center: { lat: start.lat, lng: start.lng },
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        const Marker = markerLib.Marker || maps.Marker;
        const pin = new Marker({ position: { lat: start.lat, lng: start.lng }, map, label: 'A', title: 'Start location' });
        mapRef.current = { map, Marker, maps };
        overlaysRef.current = [pin];
        setMapState('ready');
      } catch (err) {
        console.warn('[TripRouteModal] map unavailable:', err?.message || err);
        if (!cancelled) setMapState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      overlaysRef.current.forEach((o) => o.setMap?.(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [start.lat, start.lng]);

  /* 3. When both the map and the route are ready, draw the line and the destination pin. */
  useEffect(() => {
    if (mapState !== 'ready' || routeState !== 'ready' || !route?.path?.length || !mapRef.current) return;
    (async () => {
      const { map, Marker, maps } = mapRef.current;
      const [mapsLib, core] = await Promise.all([maps.importLibrary('maps'), maps.importLibrary('core')]);
      const line = new mapsLib.Polyline({ path: route.path, map, strokeColor: '#0055cc', strokeOpacity: 0.9, strokeWeight: 5 });
      const end = route.path[route.path.length - 1];
      const endPin = new Marker({ position: end, map, label: 'B', title: destination });
      overlaysRef.current.push(line, endPin);
      const bounds = new core.LatLngBounds();
      route.path.forEach((p) => bounds.extend(p));
      bounds.extend({ lat: start.lat, lng: start.lng });
      map.fitBounds(bounds, 40);
    })().catch((err) => console.warn('[TripRouteModal] could not draw route:', err?.message || err));
  }, [mapState, routeState, route, destination, start.lat, start.lng]);

  const openUrl = destination ? googleMapsDirectionsUrl({ lat: start.lat, lng: start.lng }, destination) : mapUrl(start.lat, start.lng);

  return (
    <Modal isOpen onClose={onClose} title={trip.title} size="lg">
      <div className="modal-body">
        <div className="geo-item" style={{ marginBottom: 12 }}>
          <div className="geo-icon"><svg className="icon" aria-hidden="true"><use href="#i-pin" /></svg></div>
          <div className="geo-text">
            <div className="geo-label">{trip.employee} · {trip.label}</div>
            {trip.address && <div className="geo-address">{trip.address}</div>}
            <div className="geo-meta">
              {start.lat.toFixed(5)}, {start.lng.toFixed(5)}
              {start.accuracy != null && ` · ${formatAccuracy(start.accuracy)}`}
              {start.at && ` · captured ${formatDateTime(start.at)}`}
            </div>
          </div>
        </div>

        {destination ? (
          <p className="field-hint" style={{ margin: '0 0 8px' }}>Destination: <strong>{destination}</strong></p>
        ) : (
          <p className="field-hint" style={{ margin: '0 0 8px' }}>
            No destination has been entered for this trip yet, so only the start location is shown.
          </p>
        )}

        {routeState === 'loading' && (
          <div className="route-status is-loading">
            <svg className="icon"><use href="#i-spinner" /></svg>
            <span>Working out the driving route…</span>
          </div>
        )}
        {routeState === 'error' && (
          <div className="route-status is-error" role="alert">
            <svg className="icon"><use href="#i-alert" /></svg>
            <span>{routeError}</span>
          </div>
        )}
        {routeState === 'ready' && route?.source === 'osm' && (
          <p className="field-hint" style={{ margin: '0 0 8px' }}>
            Google routing is not available for this key, so this route comes from OpenStreetMap. It is a good guide, but
            the distance can differ slightly from Google's.
          </p>
        )}
        {routeState === 'ready' && route && (
          <div className="route-stats" style={{ marginBottom: 12 }}>
            <div className="route-stat rs-primary">
              <div className="rs-label"><svg className="icon"><use href="#i-road" /></svg> Driving distance</div>
              <div className="rs-value">{route.distanceKm.toFixed(1)} km</div>
            </div>
            {route.durationText && (
              <div className="route-stat">
                <div className="rs-label"><svg className="icon"><use href="#i-clock" /></svg> Approx. driving time</div>
                <div className="rs-value">{route.durationText}</div>
              </div>
            )}
          </div>
        )}

        {/* Always mounted so the map can attach to it. */}
        <div className="route-map" ref={mapDivRef} hidden={mapState === 'unavailable'} style={{ height: 340 }} />
        {mapState === 'unavailable' && (
          <p className="route-note" style={{ marginLeft: 0 }}>
            The map preview is unavailable here (Google Maps could not load) — use the button below to open it in Google Maps.
          </p>
        )}

        <div className="route-actions" style={{ padding: '12px 0 0' }}>
          <a className="btn btn-secondary" href={openUrl} target="_blank" rel="noopener noreferrer">
            <svg className="icon" aria-hidden="true"><use href="#i-external" /></svg> Open in Google Maps
          </a>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ marginLeft: 'auto' }}>Close</button>
        </div>
      </div>
    </Modal>
  );
}