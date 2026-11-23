import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { IconChat, IconShield, IconUsers } from '../icons';

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
    <div className="welcome-page">
      <div className="welcome-panel">
        <p className="brand-mark">
          <span className="brand-icon">
            <IconChat size={20} />
          </span>
          Discussions App
        </p>
        <div className="portal-actions">
          <Link
            className="portal-card primary"
            to={needsAdminSignup ? '/admin/signup' : '/admin'}
          >
            <span className="portal-icon">
              <IconShield size={22} />
            </span>
            <span className="portal-title">Admin</span>
          </Link>
          <Link
            className={`portal-card${needsAdminSignup ? ' disabled-look' : ''}`}
            to="/employee/login"
            onClick={(e) => {
              if (needsAdminSignup) e.preventDefault();
            }}
          >
            <span className="portal-icon">
              <IconUsers size={22} />
            </span>
            <span className="portal-title">Employee</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
