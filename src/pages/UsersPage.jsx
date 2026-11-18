import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { expenseAPI } from '../api/client';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import Modal from '../components/Modal';
import { EmptyState } from '../components/ExpenseTable';

/*
 * Accounts-only page (the route in App.jsx and GET/PUT /api/users both enforce it).
 * Lists every user - including what they changed on their own Profile page - and lets Accounts
 * correct a name, email, branch, designation or role, or reset a password.
 * The username is the login name and is never editable.
 */

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'clerk', label: 'Clerk (files bills)' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'op_head', label: 'Operational Head' },
  { value: 'chairman', label: 'Chairman' },
];
const ROLE_LABEL = { employee: 'Employee', clerk: 'Clerk', accounts: 'Accounts', op_head: 'Operational Head' , chairman: 'Chairman' };
const CUSTOM_ROLE = '__custom__';

// Same comparison the backend makes, so a typed label cannot pose as a built-in role.
const BUILTIN_NAMES = ['employee', 'clerk', 'accounts', 'ophead', 'operationhead', 'operationalhead', 'chairman'];
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const roleText = (u) => u.role_title || ROLE_LABEL[u.role] || u.role;

// The project has two kinds of people: the users who file bills, and the approvers who review them.
const APPROVER_ROLES = ['accounts', 'op_head', 'chairman'];
const isApprover = (u) => APPROVER_ROLES.includes(u.role);
const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'users', label: 'Users' },          // employees and clerks
  { key: 'approvers', label: 'Approvers' },  // Accounts and Operational Head
];

function EditUserModal({ user, isSelf, onClose, onSaved }) {
  const startsCustom = user.role === 'employee' && !!user.role_title;
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    role: startsCustom ? CUSTOM_ROLE : user.role,
    custom_role: startsCustom ? user.role_title : '',
    email: user.email || '',
    branch: user.branch || '',
    designation: user.designation || '',
    new_password: '',
  });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const isCustom = form.role === CUSTOM_ROLE;

  const set = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((er) => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const er = {};
    if (!form.display_name.trim()) er.display_name = 'Enter the full name.';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) er.email = 'Enter a valid email address.';
    if (form.new_password && form.new_password.length < 6) er.new_password = 'Use at least 6 characters.';
    if (isCustom) {
      const n = form.custom_role.trim();
      if (!n) er.custom_role = 'Type the role name.';
      else if (n.length > 50) er.custom_role = 'Use 50 characters or fewer.';
      else if (BUILTIN_NAMES.includes(squash(n))) er.custom_role = 'That role already exists. Choose it from the Role list.';
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
      const body = {
        display_name: form.display_name.trim(),
        role: isCustom ? 'employee' : form.role,
        role_title: isCustom ? form.custom_role.trim().replace(/\s+/g, ' ') : '',
        email: form.email.trim(),
        branch: form.branch.trim(),
        designation: form.designation.trim(),
      };
      if (form.new_password) body.new_password = form.new_password;
      const saved = await expenseAPI(`/users/${user.id}`, { method: 'PUT', body: JSON.stringify(body) });
      onSaved(saved, !!form.new_password);
    } catch (err) {
      setBanner(err.message || 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={busy ? undefined : onClose} title={`Edit ${user.display_name}`}>
      <form onSubmit={submit} noValidate>
        {banner && (
          <div className="form-banner banner-error" role="alert" style={{ marginBottom: 16 }}>
            <svg className="icon" aria-hidden="true"><use href="#i-alert" /></svg>
            <span>{banner}</span>
          </div>
        )}

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="eu-username">Username</label>
            <input id="eu-username" type="text" value={user.username} readOnly disabled />
            <p className="form-card-sub">The login name cannot be changed.</p>
          </div>

          <div className="form-group">
            <label htmlFor="eu-name">Full name *</label>
            <input
              id="eu-name" name="display_name" type="text" autoComplete="off"
              value={form.display_name} onChange={set}
              aria-invalid={errors.display_name ? 'true' : undefined}
            />
            {errors.display_name && <p className="field-error">{errors.display_name}</p>}
          </div>

          <div className="form-group">
            <label htmlFor={isCustom ? 'eu-custom' : 'eu-role'}>{isCustom ? 'Role name *' : 'Role'}</label>
            {isCustom ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="eu-custom" name="custom_role" type="text" autoComplete="off" maxLength={50} autoFocus
                  value={form.custom_role} onChange={set} placeholder="e.g. Area Manager" style={{ flex: 1 }}
                  aria-invalid={errors.custom_role ? 'true' : undefined}
                />
                <button
                  type="button" className="btn btn-outline btn-icon"
                  onClick={() => { setForm((f) => ({ ...f, role: 'employee', custom_role: '' })); setErrors((er) => ({ ...er, custom_role: '' })); }}
                  aria-label="Back to the role list" title="Back to the role list"
                >
                  <svg className="icon" aria-hidden="true"><use href="#i-close" /></svg>
                </button>
              </div>
            ) : (
              <select id="eu-role" name="role" value={form.role} onChange={set} disabled={isSelf}>
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                <option value={CUSTOM_ROLE}>+ Custom role…</option>
              </select>
            )}
            {isSelf && <p className="form-card-sub">You cannot change your own role.</p>}
            {errors.custom_role && <p className="field-error">{errors.custom_role}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="eu-email">Email</label>
            <input
              id="eu-email" name="email" type="text" inputMode="email" autoComplete="off"
              value={form.email} onChange={set} placeholder="optional"
              aria-invalid={errors.email ? 'true' : undefined}
            />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>

          <div className="form-group">
            <label htmlFor="eu-branch">Branch</label>
            <input id="eu-branch" name="branch" type="text" maxLength={100} value={form.branch} onChange={set} placeholder="optional" />
          </div>

          <div className="form-group">
            <label htmlFor="eu-designation">Designation</label>
            <input id="eu-designation" name="designation" type="text" maxLength={100} value={form.designation} onChange={set} placeholder="optional" />
          </div>

          <div className="form-group span-2">
            <label htmlFor="eu-password">Reset password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="eu-password" name="new_password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                value={form.new_password} onChange={set} placeholder="Leave blank to keep the current password" style={{ flex: 1 }}
                aria-invalid={errors.new_password ? 'true' : undefined}
              />
              <button
                type="button" className="btn btn-outline btn-icon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <svg className="icon" aria-hidden="true"><use href={showPassword ? '#i-eye-off' : '#i-eye'} /></svg>
              </button>
            </div>
            {errors.new_password && <p className="field-error">{errors.new_password}</p>}
          </div>
        </div>

        <div className="btn-row btn-row-end" style={{ marginTop: 'var(--sp-5)' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn btn-primary${busy ? ' is-busy' : ''}`} disabled={busy}>Save changes</button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user: me, updateUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [role, setRole] = useState('');
  const [branch, setBranch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setUsers(await expenseAPI('/users'));
    } catch (err) {
      setError(err.message || 'Could not load the users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const approvers = users.filter(isApprover).length;
    return { all: users.length, users: users.length - approvers, approvers };
  }, [users]);
  const inGroup = useCallback((u) => group === 'all' || (group === 'approvers') === isApprover(u), [group]);

  const roleOptions = useMemo(() => [...new Set(users.filter(inGroup).map(roleText))].sort(), [users, inGroup]);
  const branchOptions = useMemo(() => [...new Set(users.filter(inGroup).map((u) => u.branch).filter(Boolean))].sort(), [users, inGroup]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (!inGroup(u)) return false;
      if (role && roleText(u) !== role) return false;
      if (branch && u.branch !== branch) return false;
      if (!q) return true;
      return [u.display_name, u.username, u.email, u.branch, u.designation, roleText(u)]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [users, inGroup, search, role, branch]);

  const filtersOn = !!(search || role || branch);
  const clear = () => { setSearch(''); setRole(''); setBranch(''); };
  const changeGroup = (key) => { setGroup(key); setRole(''); setBranch(''); };

  const saved = (u, passwordChanged) => {
    setUsers((list) => list.map((x) => (x.id === u.id ? u : x)));
    if (u.id === me?.id) updateUser({ display_name: u.display_name, email: u.email, branch: u.branch, designation: u.designation, role_title: u.role_title });
    setEditing(null);
    toast(`${u.display_name} was updated${passwordChanged ? ' and the password was reset' : ''}.`, 'success');
  };

  return (
    <Layout
      title="Users"
      subtitle="Everyone who can sign in. Edit their details, change a role or reset a password."
      headerRight={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/employees/new')}>
          <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
          <span className="btn-text">Create Employee</span>
        </button>
      }
    >
      <div className="card card-flush">
        <div className="tabs" role="tablist" aria-label="Kind of user">
          {GROUPS.map((g) => (
            <button
              key={g.key} type="button" role="tab" className="tab-btn"
              aria-selected={group === g.key} onClick={() => changeGroup(g.key)}
            >
              {g.label} <span className="tab-count">{loading ? '–' : counts[g.key]}</span>
            </button>
          ))}
        </div>

        <div className="dash-toolbar users-toolbar">
          <div className="dash-filters" role="group" aria-label="Filters">
            <label className="filter users-search">
              <span className="sr-only">Search users</span>
              <input
                type="search" className="input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, username, email…" aria-label="Search users"
              />
            </label>
            <label className="filter">
              <span className="sr-only">Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={role ? 'is-set' : ''}>
                <option value="">All roles</option>
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="filter">
              <span className="sr-only">Branch</span>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className={branch ? 'is-set' : ''}>
                <option value="">All branches</option>
                {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            {filtersOn && <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>}
          </div>
        </div>

        {error && (
          <div className="form-banner banner-error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>Retry</button>
          </div>
        )}

        <div className="result-meta">
          <div aria-live="polite">
            <strong>{rows.length}</strong> {group === 'approvers' ? (rows.length === 1 ? 'approver' : 'approvers') : (rows.length === 1 ? 'user' : 'users')}
            {(filtersOn || group !== 'all') && counts.all !== rows.length ? <> of {counts.all}</> : null}
          </div>
        </div>

        <div className="table-wrap" aria-busy={loading || undefined}>
          <table className="table users-table" id="usersTable">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Email</th>
                <th scope="col">Branch</th>
                <th scope="col">Designation</th>
                <th scope="col"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><span className="skeleton" style={{ width: '50%' }} /></td></tr>
              ) : rows.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={6}>
                    <EmptyState
                      icon="i-user"
                      title={filtersOn ? 'No users match these filters' : group === 'approvers' ? 'No approvers yet' : 'No users yet'}
                      text={filtersOn ? 'Try another search, role or branch.' : 'Create an employee to see them here.'}
                      action={filtersOn && <button className="btn btn-outline btn-sm" onClick={clear}>Clear filters</button>}
                    />
                  </td>
                </tr>
              ) : rows.map((u) => (
                <tr key={u.id}>
                  <td className="c-name">
                    <div>
                      <div className="user-name">{u.display_name}{u.id === me?.id ? ' (you)' : ''}</div>
                      <div className="cell-sub">@{u.username}</div>
                    </div>
                  </td>
                  <td className="c-role"><span className={`role-chip is-${u.role}`}>{roleText(u)}</span></td>
                  <td className="c-email">{u.email || '—'}</td>
                  <td className="c-branch">{u.branch || '—'}</td>
                  <td className="c-desig">{u.designation || '—'}</td>
                  <td className="c-actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(u)}>
                      <svg className="icon" aria-hidden="true"><use href="#i-pencil" /></svg>
                      <span className="btn-text">Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditUserModal
          key={editing.id}
          user={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </Layout>
  );
}