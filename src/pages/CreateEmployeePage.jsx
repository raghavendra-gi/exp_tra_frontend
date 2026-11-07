import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { expenseAPI } from '../api/client';
import Layout from '../components/Layout';

const INITIAL_STATE = {
  username: '',
  password: '',
  display_name: '',
  role: 'employee',
  email: '',
  branch: '',
  designation: '',
};

export default function CreateEmployeePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [isBusy, setIsBusy] = useState(false);

  const [formData, setFormData] = useState(INITIAL_STATE);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password || !formData.display_name) {
      toast('Username, Password, and Display Name are required.', 'error');
      return;
    }

    setIsBusy(true);
    try {
      await expenseAPI('/users/', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      toast('Employee created successfully!', 'success');
      
      // 👇 Instead of navigating away, reset the form so you can add another
      setFormData(INITIAL_STATE);
      
    } catch (err) {
      toast(err.message || 'Failed to create employee.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Layout title="Create User" subtitle="Add a new Employee or Head to your organization">
      <div className="card form-card" style={{ maxWidth: '700px', margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Username <span className="req">*</span></label>
              <input type="text" name="username" value={formData.username} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Display Name <span className="req">*</span></label>
              <input type="text" name="display_name" value={formData.display_name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Password <span className="req">*</span></label>
              <input type="text" name="password" value={formData.password} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Role <span className="req">*</span></label>
              <select name="role" value={formData.role} onChange={handleChange}>
                <option value="employee">Employee</option>
                <option value="hr">HR</option>
                <option value="head">Head</option>
                <option value="op_head">Operational Head</option>
              </select>
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Branch</label>
              <input type="text" name="branch" value={formData.branch} onChange={handleChange} />
            </div>
            <div className="form-group span-2">
              <label>Designation</label>
              <input type="text" name="designation" value={formData.designation} onChange={handleChange} />
            </div>
          </div>

          <div className="btn-row btn-row-end form-actions" style={{ marginTop: 'var(--sp-5)' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate(-1)} disabled={isBusy}>Back</button>
            <button type="submit" className={`btn btn-primary ${isBusy ? 'is-busy' : ''}`} disabled={isBusy}>Create Account</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}