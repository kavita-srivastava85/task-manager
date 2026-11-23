import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import EmailSuggest from '../EmailSuggest';
import PasswordField from '../PasswordField';
import {
  getLastRemembered,
  rememberLogin,
} from '../rememberedLogins';
import { IconChat, IconShield, IconUsers } from '../icons';

export default function Login({ mode = 'employee' }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const isAdminMode = mode === 'admin';
  const role = isAdminMode ? 'admin' : 'employee';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const last = getLastRemembered(role);
    if (last?.email) setEmail(last.email);
  }, [role]);

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
      const next = await login(email.trim(), password, { role });
      rememberLogin({
        email: next.email,
        displayName: next.displayName,
        role: next.role,
      });
      navigate(next.role === 'admin' ? '/admin/employees' : '/discussions', {
        replace: true,
      });
    } catch (err) {
      setError(err.message || 'Login failed');
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
          <Link to={isAdminMode ? '/admin' : '/'}>← Back</Link>
        </p>
        <h1 className="page-title">
          <span className={`title-icon ${isAdminMode ? 'shield' : 'users'}`}>
            {isAdminMode ? <IconShield size={20} /> : <IconUsers size={20} />}
          </span>
          {isAdminMode ? 'Admin sign in' : 'Employee sign in'}
        </h1>
        <form onSubmit={onSubmit} className="stack" autoComplete="on">
          <EmailSuggest
            label="Email"
            role={role}
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
            <Link to={`/forgot-password?mode=${role}`}>Forgot password?</Link>
          </p>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {isAdminMode && (
          <p className="muted switch-link">
            <Link to="/admin/signup">Sign up</Link>
          </p>
        )}
      </div>
    </div>
  );
}
