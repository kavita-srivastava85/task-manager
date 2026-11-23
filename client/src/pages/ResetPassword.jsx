import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import PasswordField from '../PasswordField';
import { IconChat } from '../icons';

export default function ResetPassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const mode = params.get('mode') === 'admin' ? 'admin' : 'employee';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'admin') {
    return <Navigate to="/admin/employees" replace />;
  }
  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <p className="error">Missing reset link.</p>
          <p className="switch-link">
            <Link to={`/forgot-password?mode=${mode}`}>Forgot password</Link>
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setOk('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const result = await api.resetPassword({ token, password });
      setOk('Password updated.');
      const loginPath =
        result.role === 'admin' ? '/admin/login' : '/employee/login';
      setTimeout(() => navigate(loginPath, { replace: true }), 700);
    } catch (err) {
      setError(err.message || 'Could not reset password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <p className="brand-mark">
          <span className="brand-icon">
            <IconChat size={18} />
          </span>
          Discussions App
        </p>
        <p className="back-row">
          <Link to={`/forgot-password?mode=${mode}`}>← Back</Link>
        </p>
        <h1>Reset password</h1>
        <form onSubmit={onSubmit} className="stack">
          <PasswordField
            label="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          {error && <p className="error">{error}</p>}
          {ok && <p className="ok">{ok}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
