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

  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.forgotPassword(email.trim());
      const role =
        result.role === 'admin' ? 'admin' : mode === 'admin' ? 'admin' : 'employee';
      navigate(
        `/reset-password?token=${encodeURIComponent(result.resetToken)}&mode=${role}`,
        { replace: true },
      );
    } catch (err) {
      setError(err.message || 'Could not start password reset');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page compact">
      <div className="auth-panel">
        <div className="auth-top-row">
          <Link
            to={mode === 'admin' ? '/admin/login' : '/login'}
            className="back-chip"
          >
            ← Back
          </Link>
        </div>
        <p className="brand-mark hero-brand">
          <span className="brand-icon">
            <IconChat size={20} />
          </span>
          Discussions App
        </p>
        <p className="auth-subtitle">Reset your password</p>
        <form onSubmit={onSubmit} className="stack tight">
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
          <button type="submit" className="btn-compact" disabled={busy}>
            {busy ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
