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
      <div className="welcome-panel catchy">
        <div className="welcome-glow" aria-hidden="true" />
        <p className="brand-mark hero-brand welcome-brand">
          <span className="brand-icon brand-icon-lg">
            <IconChat size={26} />
          </span>
          Discussions App
        </p>
        <p className="welcome-tagline italic-appeal">
          Team conversations in one place
        </p>
        <div className="portal-actions single-col">
          {needsAdminSignup ? (
            <Link className="portal-card primary welcome-cta" to="/admin/signup">
              <span className="portal-title">Get started</span>
            </Link>
          ) : (
            <Link className="portal-card primary welcome-cta" to="/login">
              <span className="portal-title">Sign in</span>
            </Link>
          )}
        </div>
        {!needsAdminSignup && (
          <p className="welcome-forgot">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>
        )}
      </div>
    </div>
  );
}
