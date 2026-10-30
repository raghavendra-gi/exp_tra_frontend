import { useCallback, useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../utils/mapsLoader';
import { useToast } from '../context/ToastContext';

const MIN_CHARS = 3;

/** Normalise Google's "FormattableText | string" into a plain string. */
const text = (v) => (!v ? '' : typeof v === 'string' ? v : typeof v.text === 'string' ? v.text : String(v));

/**
 * Place field with Google Places autocomplete.
 *
 * Fixes compared with the old version:
 *  • A failed library load used to be permanent for the page's lifetime. Now every
 *    keystroke retries until it works (the loader no longer caches failures).
 *  • If the "new" Places API isn't enabled for the key, it falls back to the
 *    classic AutocompleteService instead of just giving up.
 *  • `geolocate: true` fields (Start location, Starting location) now get the
 *    "use my current location" button the standalone version already had.
 */
export default function PlaceInput({ id, field, value, onChange, placeholder }) {
  const toast = useToast();
  const containerRef = useRef(null);

  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle');   // idle | error
  const [locating, setLocating] = useState(false);

  const placesRef = useRef(null);      // the Places library, once loaded
  const legacyRef = useRef(null);      // classic AutocompleteService instance
  const tokenRef = useRef(null);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  /** Load Maps + Places. Safe to call repeatedly — it only caches SUCCESS. */
  const ensurePlaces = useCallback(async () => {
    if (placesRef.current) return placesRef.current;
    const maps = await loadGoogleMaps();
    const lib = await maps.importLibrary('places');
    placesRef.current = lib;
    if (lib.AutocompleteSessionToken) tokenRef.current = new lib.AutocompleteSessionToken();
    return lib;
  }, []);

  /* Start downloading early so suggestions are instant; ignore failures here —
     the next keystroke will retry and show a message if it still fails. */
  useEffect(() => { ensurePlaces().catch(() => {}); }, [ensurePlaces]);

  /* Close the list when clicking elsewhere. */
  useEffect(() => {
    const onDocClick = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const queryGoogle = async (lib, input) => {
    let firstError = null;

    // 1) modern Places API (New)
    if (lib.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      try {
        const req = { input, language: 'en', region: 'IN', includedRegionCodes: ['in'] };
        if (tokenRef.current) req.sessionToken = tokenRef.current;
        const resp = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        return (resp.suggestions || [])
          .map((s) => s.placePrediction)
          .filter(Boolean)
          .map((p) => ({
            placeId: p.placeId || '',
            main: text(p.mainText) || text(p.text),
            secondary: text(p.secondaryText),
            full: text(p.text) || text(p.mainText),
          }));
      } catch (e) {
        firstError = e;
        console.warn('[PlaceInput] Places API (New) failed, trying the classic service:', e?.message || e);
      }
    }

    // 2) classic AutocompleteService (projects without Places API (New))
    if (lib.AutocompleteService) {
      if (!legacyRef.current) legacyRef.current = new lib.AutocompleteService();
      const req = { input, componentRestrictions: { country: ['in'] } };
      if (tokenRef.current) req.sessionToken = tokenRef.current;
      const preds = await new Promise((resolve, reject) => {
        legacyRef.current.getPlacePredictions(req, (r, st) => {
          if (st === 'OK' && r) resolve(r);
          else if (st === 'ZERO_RESULTS') resolve([]);
          else reject(new Error(`Places: ${st}`));
        });
      });
      return preds.map((p) => ({
        placeId: p.place_id || '',
        main: p.structured_formatting?.main_text || p.description,
        secondary: p.structured_formatting?.secondary_text || '',
        full: p.description,
      }));
    }

    throw firstError || new Error('Places library not available');
  };

  const fetchSuggestions = async (input) => {
    if (!input || input.length < MIN_CHARS) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    const seq = ++seqRef.current;
    try {
      const lib = await ensurePlaces();
      const results = await queryGoogle(lib, input);
      if (seq !== seqRef.current) return;          // a newer request won
      setSuggestions(results);
      setActiveIndex(-1);
      setIsOpen(results.length > 0);
      setStatus('idle');
    } catch (err) {
      console.warn('[PlaceInput] autocomplete failed:', err?.message || err);
      if (seq === seqRef.current) {
        setSuggestions([]);
        setIsOpen(false);
        setStatus('error');
      }
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    onChange(field.key, val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val.trim()), 260);
  };

  const chooseSuggestion = (s) => {
    onChange(field.key, s.full);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    // a picked suggestion ends the billing session; start a fresh one
    const lib = placesRef.current;
    tokenRef.current = lib?.AutocompleteSessionToken ? new lib.AutocompleteSessionToken() : null;
  };

  const onKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        chooseSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  /* ── "Use my current location" ── */
  const useCurrentLocation = async () => {
    if (!navigator.geolocation || locating) return;
    setLocating(true);
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
        }));
      const maps = await loadGoogleMaps();
      const geocoding = await maps.importLibrary('geocoding');
      const res = await new geocoding.Geocoder().geocode({
        location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
      const best = res?.results?.[0];
      if (!best) throw new Error('no match');
      onChange(field.key, best.formatted_address);
      setSuggestions([]);
      setIsOpen(false);
      toast('Location set to where you are now.', 'success', { duration: 2500 });
    } catch (e) {
      console.error('[PlaceInput] geolocate failed:', e);
      let msg = 'Could not read your location. Please type it in instead.';
      if (e?.code === 1) msg = 'Location permission is blocked. Allow it in your browser settings, or type it in.';
      else if (e?.code === 2) msg = 'Your device could not determine its position. Check that location services are on.';
      else if (e?.code === 3) msg = 'Getting your location timed out. Try again or type it in.';
      else if (e?.code === 'REQUEST_DENIED' || /geocod/i.test(e?.message || '')) msg = 'Google Geocoding is not enabled for this API key.';
      toast(msg, 'warn');
    } finally {
      setLocating(false);
    }
  };

  const canLocate = !!field.geolocate && typeof navigator !== 'undefined' && !!navigator.geolocation;

  return (
    <div className="place-field" ref={containerRef}>
      <div className="place-control">
        <input
          type="text"
          id={id}
          placeholder={placeholder || 'Search a place, address or city'}
          value={value || ''}
          onChange={handleInputChange}
          onKeyDown={onKeyDown}
          onFocus={() => { if (suggestions.length) setIsOpen(true); }}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={200}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {canLocate && (
          <button
            type="button"
            className={`place-geo${locating ? ' is-busy' : ''}`}
            onClick={useCurrentLocation}
            disabled={locating}
            title="Use my current location"
            aria-label="Use my current location"
          >
            <svg className="icon"><use href="#i-crosshair" /></svg>
          </button>
        )}
      </div>

      {isOpen && (
        <ul className="place-suggest open" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId || i}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => { e.preventDefault(); chooseSuggestion(s); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <svg className="icon"><use href="#i-pin" /></svg>
              <span>
                <span className="ps-main">{s.main}</span>
                {s.secondary && (
                  <>
                    <br />
                    <span className="ps-sub">{s.secondary}</span>
                  </>
                )}
              </span>
            </li>
          ))}
          <li className="ps-attrib" aria-hidden="true">Powered by Google</li>
        </ul>
      )}

      {status === 'error' && (
        <div className="field-hint" style={{ color: 'var(--st-warning-ink)' }}>
          Autocomplete unavailable — type the address manually.
        </div>
      )}
    </div>
  );
}
