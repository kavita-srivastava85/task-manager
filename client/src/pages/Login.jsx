import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import EmailSuggest from '../EmailSuggest';
import PasswordField from '../PasswordField';
import {
  getLastRemembered,
  rememberLogin,
} from '../rememberedLogins';
import { IconChat } from '../icons';

export default function Login({ mode = 'any' }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  // mode: 'any' | 'admin' | 'employee' — 'any' is the public sign-in (no role gate)
  const roleHint = mode === 'admin' || mode === 'employee' ? mode : undefined;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const last =
      getLastRemembered(roleHint || 'employee') ||
      getLastRemembered('admin') ||
      getLastRemembered('employee');
    if (last?.email) setEmail(last.email);
  }, [roleHint]);

  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const next = await login(email.trim(), password, {
        role: roleHint,
      });
      rememberLogin({
        email: next.email,
        displayName: next.displayName,
        role: next.role,
      });
      navigate('/discussions', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page compact">
      <div className="auth-panel">
        <div className="auth-top-row">
          <Link to="/" className="back-chip">
            ← Back
          </Link>
        </div>
        <p className="brand-mark hero-brand">
          <span className="brand-icon">
            <IconChat size={20} />
          </span>
          Discussions App
        </p>
        <p className="auth-subtitle">Sign in to continue</p>
        <form onSubmit={onSubmit} className="stack tight" autoComplete="on">
          <EmailSuggest
            label="Email"
            role={roleHint || 'employee'}
            value={email}
            onChange={setEmail}
            required
          />
          <PasswordField
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <p className="forgot-row">
            <Link
              to={`/forgot-password?mode=${roleHint === 'admin' ? 'admin' : 'employee'}`}
            >
              Forgot password?
            </Link>
          </p>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-compact" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
