import { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';

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
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                name="username"
                required
                placeholder="e.g. emp1"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={isBusy}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="pw-wrap">
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
                  <svg className="icon" aria-hidden="true">
                    <use href={showPassword ? '#i-eye-off' : '#i-eye'} />
                  </svg>
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
              Sign in
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
