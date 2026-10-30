/**
 * Driving-route calculation with three independent strategies, so one broken
 * piece (slow SDK, a service not enabled on the key…) doesn't kill the feature:
 *
 *   1. Route.computeRoutes   – Maps JS SDK, modern Routes library
 *   2. Routes REST API       – plain fetch(), needs only the key (no SDK!)
 *   3. DirectionsService     – Maps JS SDK, classic fallback
 *
 * Every strategy returns the same shape:
 *   { distanceKm, durationText, path: [{lat,lng}], source }
 */
import { loadGoogleMaps, getMapsKey, MapsError, normalizeMapsCode } from './mapsLoader';

const REGION = 'in';
const REST_TIMEOUT_MS = 20000;

/* ── helpers ────────────────────────────────────────────────────────────── */
export function formatDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s <= 0) return '';
  let h = Math.floor(s / 3600);
  let m = Math.round((s % 3600) / 60);
  if (m === 60) { h += 1; m = 0; }
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${Math.max(1, m)} min`;
}

/** Decode a Google "encoded polyline" string into [{lat,lng}] — no SDK needed. */
export function decodePolyline(encoded) {
  const out = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng']) {
      let shift = 0, result = 0, b;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (axis === 'lat') lat += delta; else lng += delta;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

export function googleMapsDirectionsUrl(from, to) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`;
}

/** Map Google's many error shapes onto our small set of codes. */
function classify(err) {
  if (err instanceof MapsError) return err;
  const raw = `${err?.code ?? ''} ${err?.status ?? ''} ${err?.message ?? ''}`.toUpperCase();
  let code = 'GENERIC';
  if (/ZERO_RESULTS/.test(raw)) code = 'ZERO_RESULTS';
  else if (/NOT_FOUND/.test(raw)) code = 'NOT_FOUND';
  else if (/PERMISSION_DENIED|REQUEST_DENIED|API KEY|NOT ENABLED|NOT AUTHORIZED|FORBIDDEN/.test(raw)) code = 'REQUEST_DENIED';
  else if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|QUOTA/.test(raw)) code = 'OVER_QUERY_LIMIT';
  else if (/UNAUTHENTICATED|INVALID_KEY/.test(raw)) code = 'AUTH';
  return new MapsError(code, err?.message);
}

const num = (v) => (typeof v === 'function' ? v() : v);

/* ── 1. Route.computeRoutes (JS SDK) ────────────────────────────────────── */
async function viaRouteClass(maps, origin, destination) {
  const lib = await maps.importLibrary('routes');
  if (!lib?.Route?.computeRoutes) throw new MapsError('UNAVAILABLE');

  let res;
  try {
    res = await lib.Route.computeRoutes({
      origin,
      destination,
      travelMode: 'DRIVING',
      region: REGION,
      fields: ['distanceMeters', 'durationMillis', 'path'],
    });
  } catch (e) {
    throw classify(e);
  }
  const r = res?.routes?.[0];
  if (!r || !r.distanceMeters) throw new MapsError('ZERO_RESULTS');

  return {
    distanceKm: r.distanceMeters / 1000,
    durationText: formatDuration((r.durationMillis || 0) / 1000),
    path: (r.path || []).map((p) => ({ lat: num(p.lat), lng: num(p.lng) })),
    source: 'route-class',
  };
}

/* ── 2. Routes REST API (no SDK required) ───────────────────────────────── */
async function viaRest(origin, destination) {
  const key = getMapsKey();
  if (!key) throw new MapsError('NO_KEY');

  const ctrl = new AbortController();
  const abortTimer = setTimeout(() => ctrl.abort(), REST_TIMEOUT_MS);
  let resp;
  try {
    resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        polylineQuality: 'OVERVIEW',
        units: 'METRIC',
        languageCode: 'en',
        regionCode: REGION.toUpperCase(),
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new MapsError(e?.name === 'AbortError' ? 'TIMEOUT' : 'LOAD_FAILED');
  } finally {
    clearTimeout(abortTimer);
  }

  let data = null;
  try { data = await resp.json(); } catch { /* not JSON */ }

  if (!resp.ok) {
    throw classify({
      status: data?.error?.status,
      code: resp.status === 429 ? 'OVER_QUERY_LIMIT' : resp.status === 403 ? 'REQUEST_DENIED' : data?.error?.status,
      message: data?.error?.message,
    });
  }

  const r = data?.routes?.[0];
  if (!r || !r.distanceMeters) throw new MapsError('ZERO_RESULTS');

  return {
    distanceKm: Number(r.distanceMeters) / 1000,
    durationText: formatDuration(parseInt(String(r.duration || '0s'), 10)),
    path: r.polyline?.encodedPolyline ? decodePolyline(r.polyline.encodedPolyline) : [],
    source: 'routes-rest',
  };
}

/* ── 3. DirectionsService (JS SDK, classic) ─────────────────────────────── */
async function viaDirections(maps, origin, destination) {
  const lib = await maps.importLibrary('routes');
  const core = await maps.importLibrary('core');
  if (!lib?.DirectionsService) throw new MapsError('UNAVAILABLE');

  let res;
  try {
    res = await new lib.DirectionsService().route({
      origin,
      destination,
      travelMode: 'DRIVING',
      unitSystem: core.UnitSystem.METRIC,
      region: REGION,
    });
  } catch (e) {
    throw classify(e);
  }
  const route = res?.routes?.[0];
  if (!route?.legs?.length) throw new MapsError('ZERO_RESULTS');

  const meters = route.legs.reduce((s, l) => s + (l.distance?.value || 0), 0);
  const seconds = route.legs.reduce((s, l) => s + (l.duration?.value || 0), 0);
  return {
    distanceKm: meters / 1000,
    durationText: formatDuration(seconds),
    path: (route.overview_path || []).map((p) => ({ lat: num(p.lat), lng: num(p.lng) })),
    source: 'directions',
  };
}

/* ── public entry point ─────────────────────────────────────────────────── */
export async function computeDrivingRoute(origin, destination) {
  /* The SDK is only needed for strategies 1 and 3 and for drawing the map.
     If it can't load (slow network / timeout / blocked) we STILL try the REST API. */
  let maps = null;
  let loadErr = null;
  try {
    maps = await loadGoogleMaps();
  } catch (e) {
    loadErr = e;
    console.error('[maps] SDK failed to load:', e?.code, e?.message);
  }

  const attempts = [];
  if (maps) attempts.push(['Route.computeRoutes', () => viaRouteClass(maps, origin, destination)]);
  attempts.push(['Routes REST API', () => viaRest(origin, destination)]);
  if (maps) attempts.push(['DirectionsService', () => viaDirections(maps, origin, destination)]);

  const errors = [];
  for (const [name, run] of attempts) {
    try {
      return await run();
    } catch (err) {
      const e = classify(err);
      console.error(`[maps] ${name} failed:`, e.code, e.message);
      errors.push(e);
      if (e.code === 'ZERO_RESULTS' || e.code === 'NOT_FOUND') throw e;   // a real answer, stop here
    }
  }
  if (loadErr) errors.push(classify(loadErr));     // least specific — report it last

  /* Report the most useful error, not simply the first one. */
  throw errors.find((e) => normalizeMapsCode(e.code) !== 'GENERIC') || errors[0];
}
