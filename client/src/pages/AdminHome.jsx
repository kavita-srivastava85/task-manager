import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { IconChat, IconShield } from '../icons';

export default function AdminHome() {
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
          <Link to="/">← Back</Link>
        </p>
        <h1 className="page-title">
          <span className="title-icon shield">
            <IconShield size={20} />
          </span>
          Admin
        </h1>
        <div className="portal-actions single-col">
          {needsAdminSignup !== false && (
            <Link className="portal-card primary" to="/admin/signup">
              <span className="portal-title">Sign up</span>
            </Link>
          )}
          <Link
            className={`portal-card${needsAdminSignup ? '' : ' primary'}`}
            to="/admin/login"
          >
            <span className="portal-title">Sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
