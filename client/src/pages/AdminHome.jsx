import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { IconChat } from '../icons';

/** Unlisted admin entry — not linked from the public welcome page. */
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

  if (needsAdminSignup) {
    return <Navigate to="/admin/signup" replace />;
  }

  return <Navigate to="/admin/login" replace />;
}
