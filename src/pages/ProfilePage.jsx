import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext';
import { expenseAPI } from '../api/client'; // Assuming you have this
import Layout from '../components/Layout';

export default function ProfilePage() {
  const { user } = useAuth();
  const toast = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize form state. We fallback to empty strings so the user can fill them in.
  const [formData, setFormData] = useState({
    username: user?.username || '',
    employeeId: user?.employee_id || user?.id || '',
    branch: user?.branch || '',
    designation: user?.designation || '',
    email: user?.email || user?.mail || '',
  });

  const name = user?.display_name || user?.username || 'User';
  const initials = name.substring(0, 2).toUpperCase();
  const roleLabel = user?.role === 'head' ? 'Head' : user?.role === 'hr' ? 'HR' : 'Employee';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // NOTE: You will need a backend endpoint to handle this PUT request.
      // Example: await expenseAPI('/auth/profile', { method: 'PUT', body: JSON.stringify(formData) });
      
      // Simulating a successful save for now
      await new Promise(resolve => setTimeout(resolve, 800)); 
      
      toast('Profile updated successfully.', 'success');
      setIsEditing(false);
    } catch (err) {
      toast(err.message || 'Failed to update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout title="My Profile" subtitle="Manage your account information">
      <div className="profile-container">
        
        {/* Header Section */}
        <div className="profile-header-card">
          <div className="profile-header-bg" />
          <div className="profile-header-content">
            <div className="avatar profile-avatar-large">{initials}</div>
            <div className="profile-title-area">
              <h2>{name}</h2>
              <span className="badge badge-info">{roleLabel}</span>
            </div>
            {!isEditing && (
              <button className="btn btn-outline btn-sm profile-edit-btn" onClick={() => setIsEditing(true)}>
                <svg className="icon" aria-hidden="true"><use href="#i-pencil" /></svg> Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Details Section */}
        <div className="profile-body-card">
          <div className="profile-grid">
            
            <div className="profile-field">
              <label>Username</label>
              {isEditing ? (
                <input type="text" name="username" value={formData.username} onChange={handleChange} className="input" />
              ) : (
                <div className="profile-value">{formData.username || '—'}</div>
              )}
            </div>

            <div className="profile-field">
              <label>Employee ID</label>
              {isEditing ? (
                <input type="text" name="employeeId" value={formData.employeeId} onChange={handleChange} className="input" readOnly title="Employee ID cannot be changed" />
              ) : (
                <div className="profile-value">{formData.employeeId || '—'}</div>
              )}
            </div>

            <div className="profile-field">
              <label>Branch</label>
              {isEditing ? (
                <input type="text" name="branch" value={formData.branch} onChange={handleChange} className="input" placeholder="Enter branch" />
              ) : (
                <div className="profile-value">{formData.branch || '—'}</div>
              )}
            </div>

            <div className="profile-field">
              <label>Designation</label>
              {isEditing ? (
                <input type="text" name="designation" value={formData.designation} onChange={handleChange} className="input" placeholder="Enter designation" />
              ) : (
                <div className="profile-value">{formData.designation || '—'}</div>
              )}
            </div>

            <div className="profile-field span-2">
              <label>Email Address</label>
              {isEditing ? (
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="input" placeholder="Enter email address" />
              ) : (
                <div className="profile-value">{formData.email || '—'}</div>
              )}
            </div>

          </div>

          {/* Action Buttons (only in edit mode) */}
          {isEditing && (
            <div className="profile-actions">
              <button className="btn btn-outline" onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </button>
              <button className={`btn btn-primary ${isSaving ? 'is-busy' : ''}`} onClick={handleSave} disabled={isSaving}>
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}