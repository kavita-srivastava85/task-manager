import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { IconChat } from '../icons';

export default function Welcome() {
  const { user, loading } = useAuth();
  const [needsAdminSignup, setNeedsAdminSignup] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.authStatus();
        if (!cancelled) setNeedsAdminSignup(status.needsAdminSignup);
      } catch {
        if (!cancelled) setNeedsAdminSignup(false);
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

  return (
    <div className="welcome-page compact">
      <div className="welcome-panel">
        <p className="brand-mark hero-brand">
          <span className="brand-icon">
            <IconChat size={22} />
          </span>
          Discussions App
        </p>
        <p className="welcome-tagline">Team conversations in one place.</p>
        <div className="portal-actions single-col">
          {needsAdminSignup ? (
            <Link className="portal-card primary" to="/admin/signup">
              <span className="portal-title">Get started</span>
            </Link>
          ) : (
            <Link className="portal-card primary" to="/login">
              <span className="portal-title">Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
