/*
 * Light / dark theme, remembered between visits.
 * Before, the toggle only lasted until the page was reloaded.
 * Nothing saved yet → follow the phone / computer setting.
 */
const KEY = 'theme';

function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function getTheme() {
  const saved = read();
  if (saved === 'light' || saved === 'dark') return saved;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#131926' : '#003d99');
}

export function setTheme(theme) {
  applyTheme(theme);
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
}

/** Called once at start-up (main.jsx) — only applies a theme the person chose. */
export function initTheme() {
  const saved = read();
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
}
