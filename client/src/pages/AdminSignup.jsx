import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import PasswordField from '../PasswordField';
import { rememberLogin } from '../rememberedLogins';
import { IconChat } from '../icons';

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

  if (loading || needsAdminSignup === null) {
    return (
      <div className="auth-page compact">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/discussions" replace />;
  }

  if (needsAdminSignup === false) {
    return <Navigate to="/login" replace />;
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
      window.location.assign('/discussions');
    } catch (err) {
      setError(err.message || 'Signup failed');
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
        <p className="auth-subtitle">Create the first admin account</p>
        <form onSubmit={onSubmit} className="stack tight">
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
          <button type="submit" className="btn-compact" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
