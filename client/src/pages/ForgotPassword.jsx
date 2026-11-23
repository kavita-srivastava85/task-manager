import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { IconChat } from '../icons';

export default function ForgotPassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'admin' ? 'admin' : 'employee';
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role === 'admin') {
    return <Navigate to="/admin/employees" replace />;
  }
  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.forgotPassword(email.trim());
      navigate(
        `/reset-password?token=${encodeURIComponent(result.resetToken)}&mode=${result.role === 'admin' ? 'admin' : mode}`,
        { replace: true },
      );
    } catch (err) {
      setError(err.message || 'Could not start password reset');
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
          <Link to={mode === 'admin' ? '/admin/login' : '/employee/login'}>
            ← Back
          </Link>
        </p>
        <h1>Forgot password</h1>
        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
