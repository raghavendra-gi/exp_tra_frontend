import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../context/ToastContext';
import { expenseAPI } from '../api/client';
import { fileToDataUrl } from '../utils/fileUtils'; // Make sure this is imported
import Layout from '../components/Layout';

export default function ProfilePage() {
  const { user, updateUser } = useAuth(); // Get updateUser
  const toast = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    username: user?.username || '',
    employeeId: user?.employee_id || user?.id || '',
    branch: user?.branch || '',
    designation: user?.designation || '',
    email: user?.email || user?.mail || '',
    avatar: user?.avatar || '', // Add avatar to state
  });

  const name = user?.display_name || user?.username || 'User';
  const initials = name.substring(0, 2).toUpperCase();
  const roleLabel = user?.role === 'head' ? 'Head' : user?.role === 'hr' ? 'HR' : 'Employee';
  const deptLabel = user?.role === 'head' ? 'Department Head' : roleLabel;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Convert image to Base64
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await fileToDataUrl(file);
        setFormData(prev => ({ ...prev, avatar: dataUrl }));
      } catch (err) {
        toast('Failed to read image file.', 'error');
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Send data to backend
      const updatedUser = await expenseAPI('/users/profile', {
        method: 'PUT',
        body: JSON.stringify(formData),
      });
      
      // 2. Update global context so it persists on refresh
      updateUser(updatedUser);
      
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
      <div className="profile-wrapper">
        <div className="profile-main-card">
          
          <div className="profile-header-gradient">
            <div className="ph-top-row">
              <span className="ph-badge">EMPLOYEE ACCOUNT</span>
              {!isEditing ? (
                <button className="btn btn-sm ph-edit-btn" onClick={() => setIsEditing(true)}>
                  <svg className="icon" aria-hidden="true"><use href="#i-pencil" /></svg> Edit Profile
                </button>
              ) : (
                <div className="btn-row" style={{ gap: '8px' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</button>
                  <button className={`btn btn-sm btn-primary ${isSaving ? 'is-busy' : ''}`} onClick={handleSave} disabled={isSaving}>Save</button>
                </div>
              )}
            </div>
            
            <div className="ph-main-row">
              <div className="ph-avatar-wrap">
                {/* Show image if exists, otherwise initials */}
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Profile" className="ph-avatar" style={{ objectFit: 'cover' }} />
                ) : (
                  <div className="avatar ph-avatar">{initials}</div>
                )}
                
                <label className="ph-avatar-camera" title="Upload Profile Picture">
                  <svg className="icon" aria-hidden="true"><use href="#i-camera" /></svg>
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
              </div> 
              
              <div className="ph-text">
                <h2 className="ph-name">
                  {name}
                  <span className="ph-role-badge">{deptLabel}</span>
                </h2>
               
              </div>
            </div>
          </div>

          <div className="profile-quick-stats">
            <div className="pqs-item">
              <div className="pqs-label">
                <svg className="icon text-blue"><use href="#i-mail" /></svg> Mail ID
              </div>
              <div className="pqs-value">{formData.email || '—'}</div>
            </div>
            <div className="pqs-item">
              <div className="pqs-label">
                <svg className="icon text-purple"><use href="#i-pin" /></svg> Branch
              </div>
              <div className="pqs-value">{formData.branch || '—'}</div>
            </div>
          </div>

          <div className="profile-info-section">
            <div className="pi-header">
              <h3>Profile Information</h3>
            </div>

            <div className="pi-grid">
              <div className="pi-field">
                <label>Username</label>
                {isEditing ? (
                  <input type="text" name="username" value={formData.username} onChange={handleChange} className="input" />
                ) : (
                  <div className="pi-value-box">{formData.username || '—'}</div>
                )}
              </div>

              <div className="pi-field">
                <label>Employee ID</label>
                <div className="pi-value-box">{formData.employeeId || '—'}</div>
              </div>

              <div className="pi-field">
                <label>Designation</label>
                {isEditing ? (
                  <input type="text" name="designation" value={formData.designation} onChange={handleChange} className="input" placeholder="Enter designation" />
                ) : (
                  <div className="pi-value-box">{formData.designation || '—'}</div>
                )}
              </div>

              <div className="pi-field">
                <label>Email Address</label>
                {isEditing ? (
                  <input type="email" name="email" value={formData.email} onChange={handleChange} className="input" placeholder="Enter email" />
                ) : (
                  <div className="pi-value-box">{formData.email || '—'}</div>
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </Layout>
  );
}