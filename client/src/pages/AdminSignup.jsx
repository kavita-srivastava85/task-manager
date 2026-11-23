import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import PasswordField from '../PasswordField';
import { rememberLogin } from '../rememberedLogins';
import { IconChat, IconShield } from '../icons';

export default function AdminSignup() {
  const { user, loading, acceptSession } = useAuth();
  const [needsAdminSignup, setNeedsAdminSignup] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.authStatus();
        if (!cancelled) setNeedsAdminSignup(status.needsAdminSignup);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="auth-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (user?.role === 'admin') {
    return <Navigate to="/admin/employees" replace />;
  }
  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  if (needsAdminSignup === false) {
    return <Navigate to="/admin/login" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const result = await api.adminSignup({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      rememberLogin({
        email: result.user.email,
        displayName: result.user.displayName,
        role: 'admin',
      });
      acceptSession(result.token, result.user);
      window.location.assign('/admin/employees');
    } catch (err) {
      setError(err.message || 'Signup failed');
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
          <Link to="/admin">← Back</Link>
        </p>
        <h1 className="page-title">
          <span className="title-icon shield">
            <IconShield size={20} />
          </span>
          Admin sign up
        </h1>
        <form onSubmit={onSubmit} className="stack">
          <label>
            Name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
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
          <PasswordField
            label="Password"
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
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Sign up'}
          </button>
        </form>
        <p className="muted switch-link">
          <Link to="/admin/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
