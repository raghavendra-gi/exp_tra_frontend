import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { expenseAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

/*
 * Accounts-only page (the route in App.jsx and POST /api/users both enforce it):
 * creates a login for a new employee, clerk, accounts user or operational head.
 */

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'clerk', label: 'Clerk' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'op_head', label: 'Operational Head' },
 /* { value: 'custom', label: 'Other (Type manually)' },*/
];

const EMPTY = {
  username: '',
  display_name: '',
  password: '',
  role: 'employee',
  /*customRole: '',*/
  email: '',
  branch: '',
  designation: '',
};

export default function CreateEmployeePage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const set = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const er = {};
    if (!form.username.trim()) er.username = 'Enter a username.';
    else if (/\s/.test(form.username.trim())) er.username = 'The username cannot contain spaces.';
    if (!form.display_name.trim()) er.display_name = 'Enter the full name.';
    if (!form.password) er.password = 'Enter a password.';
    else if (form.password.length < 6) er.password = 'Use at least 6 characters.';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) er.email = 'Enter a valid email address.';
    if (!form.role.trim()) {
      er.role = 'Please select or type a role.';
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  };

    const submit = async (e) => {
    e.preventDefault();
    setBanner('');
    if (!validate()) return;

    setBusy(true);
    try {
      const created = await expenseAPI('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username.trim(),
          display_name: form.display_name.trim(),
          password: form.password,
          role: form.role.trim().toLowerCase(), // 👈 Directly sends what was selected/typed
          email: form.email.trim() || null,
          branch: form.branch.trim() || null,
          designation: form.designation.trim() || null,
        }),
      });
      toast(`${created?.display_name || form.display_name.trim()} was created. They can sign in now.`, 'success');
      setForm(EMPTY);
      setErrors({});
    } catch (err) {
      setBanner(err.message || 'Could not create the user.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout
      title="Create Employee"
      subtitle="Add a new person who can sign in to the expense tracker"
      headerRight={
        <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate('/accounts-dashboard')}>
          <span className="btn-text">Back to dashboard</span>
        </button>
      }
    >
      <form className="card form-card" onSubmit={submit} noValidate style={{ maxWidth: 760 }}>
        <div className="form-card-head">
          <div>
            <h2 style={{ margin: 0 }}>New user</h2>
            <p className="form-card-sub">The username is the login name and cannot be changed later.</p>
          </div>
        </div>

        {banner && (
          <div className="form-banner banner-error" role="alert" style={{ marginBottom: 16 }}>
            <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
            <span>{banner}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="ce-username">Username *</label>
            <input
              id="ce-username" name="username" type="text" autoComplete="off"
              value={form.username} onChange={set} placeholder="e.g. emp4"
              aria-invalid={errors.username ? 'true' : undefined}
            />
            {errors.username && <p className="field-error">{errors.username}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="ce-name">Full name *</label>
            <input
              id="ce-name" name="display_name" type="text" autoComplete="off"
              value={form.display_name} onChange={set} placeholder="e.g. Ravi Kumar"
              aria-invalid={errors.display_name ? 'true' : undefined}
            />
            {errors.display_name && <p className="field-error">{errors.display_name}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="ce-password">Password *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="ce-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                value={form.password} onChange={set} placeholder="At least 6 characters" style={{ flex: 1 }}
                aria-invalid={errors.password ? 'true' : undefined}
              />
              <button
                type="button" className="btn btn-outline btn-icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg className="icon" aria-hidden="true"><use href={showPassword ? '#i-eye-off' : '#i-eye'} /></svg>
              </button>
            </div>
            {errors.password && <p className="field-error">{errors.password}</p>}
          </div>

                    {/* Replace the old Role select and custom role input with this */}
          <div className="form-group">
            <label htmlFor="ce-role">Role *</label>
            <input
              id="ce-role"
              name="role"
              type="text"
              list="role-options"
              value={form.role}
              onChange={set}
              placeholder="Select or type a role"
              autoComplete="off"
              aria-invalid={errors.role ? 'true' : undefined}
            />
            {/* Datalist provides the dropdown suggestions but allows typing */}
            <datalist id="role-options">
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </datalist>
            {errors.role && <p className="field-error">{errors.role}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="ce-email">Email</label>
            <input
              id="ce-email" name="email" type="text" inputMode="email" autoComplete="off"
              value={form.email} onChange={set} placeholder="optional"
              aria-invalid={errors.email ? 'true' : undefined}
            />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="ce-branch">Branch</label>
            <input id="ce-branch" name="branch" type="text" value={form.branch} onChange={set} placeholder="optional" />
          </div>

          <div className="form-group span-2">
            <label htmlFor="ce-designation">Designation</label>
            <input id="ce-designation" name="designation" type="text" value={form.designation} onChange={set} placeholder="optional" />
          </div>
        </div>

        <div className="form-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={() => { setForm(EMPTY); setErrors({}); setBanner(''); }} disabled={busy}>
            Clear
          </button>
          <button type="submit" className={`btn btn-primary${busy ? ' is-busy' : ''}`} disabled={busy}>
            Create user
          </button>
        </div>
      </form>
    </Layout>
  );
}