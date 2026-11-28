import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};
const UserIcon = () => (
  <svg className="lf-icon" {...svgProps}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
);
const LockIcon = () => (
  <svg className="lf-icon" {...svgProps}><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
);
const EyeIcon = () => (
  <svg className="lf-eye-svg" {...svgProps}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);
const EyeOffIcon = () => (
  <svg className="lf-eye-svg" {...svgProps}><path d="M10.7 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></svg>
);
const ArrowIcon = () => (
  <svg className="lf-arrow" {...svgProps} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · Expense Tracker';
    // Clear anything the browser auto-filled
    setUsername('');
    setPassword('');
    const t = setTimeout(() => {
      setUsername('');
      setPassword('');
    }, 100);
    return () => clearTimeout(t);
  }, []);

  // A sleeping free-tier server can take a while — tell the person instead of a silent spinner.
  useEffect(() => {
    if (!isBusy) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, [isBusy]);

  const checkCaps = (e) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter username and password.');
      return;
    }

    setIsBusy(true);
    try {
      await login(username.trim(), password);
      // Redirect happens automatically in App.jsx based on auth state
    } catch (err) {
      setError(err.message || 'Incorrect username or password.');
      setPassword('');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="page active" aria-label="Sign in">
      <div className="login-wrap">
        <div className="login-box">
          <img className="login-logo" src="/login-logo.png" alt="" width="72" height="72" decoding="async" />
          <h1>Expense Tracker</h1>
          <p className="login-sub">Sign in to submit and review expenses</p>

          <form onSubmit={handleSubmit} autoComplete="off" noValidate>
            <div className="form-group">
              <label htmlFor="empId">Username</label>
              <div className="lf-field">
                <UserIcon />
                <input
                  type="text"
                  id="empId"
                  name="empId"
                  required
                  placeholder="e.g. emp1"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  disabled={isBusy}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="pw-wrap lf-field">
                <LockIcon />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={checkCaps}
                  onKeyDown={checkCaps}
                  autoComplete="new-password"
                  disabled={isBusy}
                  aria-describedby={capsOn ? 'capsHint' : undefined}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <div className={`caps-hint${capsOn ? ' show' : ''}`} id="capsHint" role="status">
                <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg> Caps Lock is on
              </div>
            </div>

            {error && (
              <div className="form-banner banner-error" role="alert">
                <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className={`btn btn-primary btn-block ${isBusy ? 'is-busy' : ''}`}
              disabled={isBusy}
            >
              <span>Sign in</span>
              <ArrowIcon />
            </button>
            {slow && (
              <p className="login-slow" role="status">
                Starting the server. The first sign-in of the day can take up to a minute.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}