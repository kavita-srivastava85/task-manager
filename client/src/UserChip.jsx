import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getToken } from './api';

export default function UserChip({ user, className = '' }) {
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let revoked = null;
    let cancelled = false;
    if (!user?.avatarUrl) {
      setPhotoUrl(null);
      return undefined;
    }
    (async () => {
      try {
        const res = await fetch(user.avatarUrl, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setPhotoUrl(url);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [user?.avatarUrl, user?.id]);

  if (!user?.id) {
    return <span className={className}>{user?.displayName || 'Someone'}</span>;
  }

  return (
    <Link
      to={`/profile/${user.id}`}
      className={`user-chip ${className}`.trim()}
      title={user.displayName}
    >
      <span className="user-avatar" aria-hidden="true">
        {photoUrl ? (
          <img src={photoUrl} alt="" />
        ) : (
          <span className="user-avatar-fallback">
            {(user.displayName || '?').slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="user-chip-name">{user.displayName}</span>
    </Link>
  );
}
