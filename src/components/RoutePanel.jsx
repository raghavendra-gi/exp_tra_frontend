import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, mapsErrorMessage, mapsAuthFailed, MAPS_MESSAGES } from '../utils/mapsLoader';
import { computeDrivingRoute, googleMapsDirectionsUrl } from '../utils/routeService';

const MIN_CHARS = 3;          // don't call Google for half-typed places
const DEBOUNCE_MS = 700;      // wait until the person stops typing
const routeCache = new Map(); // "from|to" -> result, so going back and forth is instant

/**
 * Driving distance + map for a trip.
 *
 * Fixes compared with the old version:
 *  • The map <div> is ALWAYS mounted. Before, it was unmounted while a new route
 *    loaded, but the Google Map object kept pointing at the dead element, so the
 *    2nd route showed a blank map.
 *  • Distance no longer needs the Maps JS SDK (see routeService → REST fallback).
 *  • Errors show a "Try again" button; a retry really retries.
 *  • No stale-closure / sequence-number juggling: each effect run owns a
 *    `cancelled` flag.
 */
export default function RoutePanel({ field, allValues, onKmUpdate }) {
  const fromValue = String(allValues?.[field.fromKey] || '').trim();
  const toValue = String(allValues?.[field.toKey] || '').trim();

  const [status, setStatus] = useState('idle');        // idle | loading | ready | error
  const [route, setRoute] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [mapState, setMapState] = useState('pending'); // pending | ready | unavailable
  const [attempt, setAttempt] = useState(0);           // bumped by "Try again"

  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const polylineRef = useRef(null);

  /* Always call the latest callback without making it an effect dependency. */
  const kmCallbackRef = useRef(onKmUpdate);
  useEffect(() => { kmCallbackRef.current = onKmUpdate; });

  /* ── 1. work out the route when from / to change ── */
  useEffect(() => {
    if (fromValue.length < MIN_CHARS || toValue.length < MIN_CHARS) {
      setStatus('idle');
      setRoute(null);
      setErrorMsg('');
      return undefined;
    }

    const reqKey = `${fromValue}|${toValue}`;
    let cancelled = false;

    const apply = (result) => {
      setRoute(result);
      setErrorMsg('');
      setStatus('ready');
      if (field.kmKey) kmCallbackRef.current?.(Number(result.distanceKm.toFixed(1)));
    };

    const cached = routeCache.get(reqKey);
    if (cached) {
      apply(cached);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setStatus('loading');
      setErrorMsg('');
      try {
        const result = await computeDrivingRoute(fromValue, toValue);
        if (cancelled) return;
        routeCache.set(reqKey, result);
        apply(result);
      } catch (err) {
        if (cancelled) return;
        console.error('[RoutePanel] route failed:', err);
        setRoute(null);
        setErrorMsg(mapsAuthFailed() ? MAPS_MESSAGES.AUTH : mapsErrorMessage(err));
        setStatus('error');
      }
    }, DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [fromValue, toValue, attempt, field.kmKey]);

  /* ── 2. draw the map (optional — the distance works without it) ── */
  useEffect(() => {
    if (status !== 'ready' || !route || !mapDivRef.current) return undefined;
    let cancelled = false;
    setMapState((s) => (s === 'unavailable' ? 'pending' : s));

    (async () => {
      try {
        const maps = await loadGoogleMaps();
        const mapsLib = await maps.importLibrary('maps');
        const core = await maps.importLibrary('core');
        if (cancelled || !mapDivRef.current) return;

        if (!mapRef.current) {
          mapRef.current = new mapsLib.Map(mapDivRef.current, {
            center: { lat: 20.5937, lng: 78.9629 },
            zoom: 5,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            clickableIcons: false,
            gestureHandling: 'cooperative',
          });
        }
        const map = mapRef.current;
        core.event.trigger(map, 'resize');           // the div was hidden while loading

        if (polylineRef.current) polylineRef.current.setMap(null);
        polylineRef.current = null;

        if (route.path?.length) {
          polylineRef.current = new mapsLib.Polyline({
            path: route.path,
            map,
            strokeColor: '#0055cc',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          const bounds = new core.LatLngBounds();
          route.path.forEach((p) => bounds.extend(p));
          map.fitBounds(bounds, 28);
        }
        setMapState('ready');
      } catch (err) {
        console.warn('[RoutePanel] map preview unavailable:', err?.message || err);
        if (!cancelled) setMapState('unavailable');
      }
    })();

    return () => { cancelled = true; };
  }, [status, route]);

  const retry = () => {
    routeCache.delete(`${fromValue}|${toValue}`);
    setAttempt((n) => n + 1);
  };

  const showMap = status === 'ready' && mapState !== 'unavailable';

  return (
    <div className="form-group" id={`wrap_${field.key}`}>
      <div className="route-panel" hidden={status === 'idle'}>
        {status === 'loading' && (
          <div className="route-status is-loading">
            <svg className="icon"><use href="#i-spinner" /></svg>
            <span>Working out the driving route…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="route-status is-error" role="alert">
            <svg className="icon"><use href="#i-alert" /></svg>
            <span>{errorMsg}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 'auto', flexShrink: 0 }}
              onClick={retry}
            >
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && route && (
          <div className="route-body">
            <div className="route-stats">
              <div className="route-stat rs-primary">
                <div className="rs-label">
                  <svg className="icon"><use href="#i-road" /></svg> Driving distance
                </div>
                <div className="rs-value">{route.distanceKm.toFixed(1)} km</div>
              </div>
              {route.durationText && (
                <div className="route-stat">
                  <div className="rs-label">
                    <svg className="icon"><use href="#i-clock" /></svg> Approx. driving time
                  </div>
                  <div className="rs-value">{route.durationText}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Always mounted — see note at the top of the file. */}
        <div className="route-map" ref={mapDivRef} hidden={!showMap} />

        {status === 'ready' && route && (
          <div className="route-actions">
            <a
              className="btn btn-secondary"
              href={googleMapsDirectionsUrl(fromValue, toValue)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg className="icon"><use href="#i-external" /></svg> Open in Google Maps
            </a>
            <span className="route-note">
              {mapState === 'unavailable'
                ? 'Map preview unavailable — the distance was still calculated.'
                : 'Kilometers updates when you change a location.'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
