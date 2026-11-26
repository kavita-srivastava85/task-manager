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
  const modeParam = params.get('mode') === 'admin' ? 'admin' : 'employee';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  if (!token) {
    return (
      <div className="auth-page compact">
        <div className="auth-panel">
          <p className="error">Missing reset link.</p>
          <p className="switch-link">
            <Link to={`/forgot-password?mode=${modeParam}`}>Forgot password</Link>
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
      // Prefer actual account role from API; fall back to URL mode.
      const role = result.role || modeParam;
      const loginPath = role === 'admin' ? '/admin/login' : '/login';
      setTimeout(() => navigate(loginPath, { replace: true }), 700);
    } catch (err) {
      setError(err.message || 'Could not reset password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page compact">
      <div className="auth-panel">
        <div className="auth-top-row">
          <Link to={`/forgot-password?mode=${modeParam}`} className="back-chip">
            ← Back
          </Link>
        </div>
        <p className="brand-mark hero-brand">
          <span className="brand-icon">
            <IconChat size={20} />
          </span>
          Discussions App
        </p>
        <p className="auth-subtitle">Choose a new password</p>
        <form onSubmit={onSubmit} className="stack tight">
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
          <button type="submit" className="btn-compact" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
