import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';

export default function CreateEmployee() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    userType: 'Employee / Clerk (Files bills)',
    role: 'Employee',
    email: '',
    branch: '',
    designation: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    toast('User created successfully!', 'success');
    navigate('/employees');
  };

  return (
    <Layout 
      title="Create Employee" 
      subtitle="Add a new person who can Login to the expense tracker system."
      headerRight={
        <button className="btn btn-outline btn-sm" onClick={() => navigate('/employees')}>
          <svg className="icon" aria-hidden="true"><use href="#i-arrow-left" /></svg>
          Back to users
        </button>
      }
    >
      <div className="profile-wrapper" style={{ maxWidth: '900px', margin: '0 auto' }}>
        
        {/* Security Note REMOVED here */}

        <div className="card card-flush">
          <div className="card-head" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="card-heading">New user account</h2>
              <p className="form-card-sub">The username is the login name and cannot be changed later.</p>
            </div>
            <span className="badge badge-info">Fields marked * are required</span>
          </div>

          <form className="form-card" onSubmit={handleSubmit}>
            <div className="form-grid">
              
              {/* Row 1 */}
              <div className="form-group">
                <label htmlFor="username">Username <span className="req">*</span></label>
                <input 
                  type="text" 
                  id="username" 
                  name="username" 
                  placeholder="e.g. emp4" 
                  value={formData.username}
                  onChange={handleChange}
                  required 
                />
                <div className="field-hint">Unique alphanumeric.</div>
              </div>

              <div className="form-group">
                <label htmlFor="fullName">Full name <span className="req">*</span></label>
                <input 
                  type="text" 
                  id="fullName" 
                  name="fullName" 
                  placeholder="e.g. Ravi Kumar" 
                  value={formData.fullName}
                  onChange={handleChange}
                  required 
                />
                <div className="field-hint">First and last name for audit records.</div>
              </div>

              {/* Row 2 */}
              <div className="form-group">
                <label htmlFor="password">Password <span className="req">*</span></label>
                <div className="pw-wrap">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    id="password" 
                    name="password" 
                    placeholder="At least 6 characters" 
                    value={formData.password}
                    onChange={handleChange}
                    required 
                    minLength={6}
                  />
                  <button 
                    type="button" 
                    className="pw-toggle" 
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <svg className="icon" aria-hidden="true">
                      <use href={showPassword ? "#i-eye-off" : "#i-eye"} />
                    </svg>
                  </button>
                </div>
                <div className="field-hint" style={{ color: 'var(--st-good-ink)' }}>Good password strength</div>
              </div>

              <div className="form-group">
                <label htmlFor="userType">User Type <span className="req">*</span></label>
                <select id="userType" name="userType" value={formData.userType} onChange={handleChange} required>
                  <option value="Employee / Clerk (Files bills)">Employee / Clerk (Files bills)</option>
                  <option value="Approver / Manager">Approver / Manager</option>
                  <option value="Accounts / Admin">Accounts / Admin</option>
                </select>
              </div>

              {/* Row 3 */}
              <div className="form-group">
                <label htmlFor="role">Role <span className="req">*</span></label>
                <select id="role" name="role" value={formData.role} onChange={handleChange} required>
                  <option value="Employee">Employee</option>
                  <option value="Manager">Manager</option>
                  <option value="Accounts">Accounts</option>
                </select>
              </div>

              {/* Moved Email to be full width and fixed the placeholder */}
              <div className="form-group span-2">
                <label htmlFor="email">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  placeholder="optional (e.g. employee@company.com)" 
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>

              {/* Row 4 */}
              <div className="form-group">
                <label htmlFor="branch">Branch</label>
                <input 
                  type="text" 
                  id="branch" 
                  name="branch" 
                  placeholder="optional (e.g. Vijayawada / SN Puram)" 
                  value={formData.branch}
                  onChange={handleChange}
                />
                <div className="field-hint">Assigned regional office branch.</div>
              </div>

              <div className="form-group">
                <label htmlFor="designation">Designation</label>
                <input 
                  type="text" 
                  id="designation" 
                  name="designation" 
                  placeholder="optional (e.g. Senior Associate)" 
                  value={formData.designation}
                  onChange={handleChange}
                />
                <div className="field-hint">Department function.</div>
              </div>

            </div>

            {/* Form Footer / Actions */}
            <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <div className="btn-row">
                <button type="button" className="btn btn-outline" onClick={() => setFormData({ username: '', fullName: '', password: '', userType: 'Employee / Clerk (Files bills)', role: 'Employee', email: '', branch: '', designation: '' })}>
                  Clear form
                </button>
                <button type="submit" className="btn btn-primary">
                  <svg className="icon" aria-hidden="true"><use href="#i-plus" /></svg>
                  Create user
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}