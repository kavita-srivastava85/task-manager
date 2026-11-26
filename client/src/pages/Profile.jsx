import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../AuthContext';
import { formatWhen } from '../components';
import PasswordField from '../PasswordField';
import { IconCamera, IconUsers } from '../icons';

export default function Profile() {
  const { id } = useParams();
  const { user: me, acceptSession } = useAuth();
  const [data, setData] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdVisible, setPwdVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const next = await api.getProfile(id);
    setData(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await load();
        if (cancelled) return;
        if (next.user?.avatarUrl) {
          const res = await fetch(next.user.avatarUrl, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (res.ok) {
            const blob = await res.blob();
            if (!cancelled) setPhotoUrl(URL.createObjectURL(blob));
          }
        } else {
          setPhotoUrl(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const profile = data?.user;
  const isSelf = data?.isSelf || Number(me?.id) === Number(id);

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const { user } = await api.uploadAvatar(fd);
      // refresh session user if self
      if (isSelf && me) {
        acceptSession(getToken(), { ...me, ...user });
      }
      await load();
      if (user.avatarUrl) {
        const res = await fetch(user.avatarUrl, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (res.ok) {
          const blob = await res.blob();
          setPhotoUrl(URL.createObjectURL(blob));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function onChangePassword(e) {
    e.preventDefault();
    setPwdMsg('');
    setError('');
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setPwdMsg('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading profile…</p>;
  if (!profile) return <p className="error">{error || 'Profile not found'}</p>;

  return (
    <div className="page profile-page">
      <p className="back-row">
        <Link to="/discussions">← Back</Link>
      </p>

      <section className="profile-hero">
        <div className="profile-photo-wrap">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="profile-photo" />
          ) : (
            <div className="profile-photo fallback">
              {(profile.displayName || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          {isSelf && (
            <label className="photo-upload-btn">
              <IconCamera size={14} />
              <span>Photo</span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={onPhoto}
                disabled={busy}
              />
            </label>
          )}
        </div>
        <div>
          <h1 className="page-title">
            <span className="title-icon users">
              <IconUsers size={22} />
            </span>
            {profile.displayName}
          </h1>
          {profile.role === 'admin' && (
            <p className="muted">Admin</p>
          )}
        </div>
      </section>

      <section className="account-card">
        <h2 className="section-title">Details</h2>
        <dl className="cred-grid">
          <div>
            <dt>Name</dt>
            <dd>{profile.displayName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile.email}</dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd className="password-dd">
              <span className="password-mask">
                {pwdVisible && isSelf
                  ? currentPassword || newPassword || '••••••••'
                  : '••••••••'}
              </span>
              {isSelf && (
                <button
                  type="button"
                  className="eye-btn profile-eye"
                  onClick={() => {
                    setPwdVisible((v) => !v);
                    setPwdOpen(true);
                  }}
                  aria-label={pwdVisible ? 'Hide password' : 'Show password'}
                  title={pwdVisible ? 'Hide password' : 'Show password'}
                >
                  {pwdVisible ? (
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 6c-5 0-9.3 3.1-11 7.5 1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 9.1 17 6 12 6zm0 12.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"
                      />
                      <path
                        fill="currentColor"
                        d="M3.2 3.2 20.8 20.8l-1.4 1.4L1.8 4.6z"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 5c-5 0-9.3 3.1-11 7.5C2.7 16.9 7 20 12 20s9.3-3.1 11-7.5C21.3 8.1 17 5 12 5zm0 12.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"
                      />
                    </svg>
                  )}
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt>Account created</dt>
            <dd>{formatWhen(profile.createdAt)}</dd>
          </div>
        </dl>
        <p className="muted account-stats">
          Started {data?.stats?.startedCount ?? 0} · Replies{' '}
          {data?.stats?.replyCount ?? 0}
        </p>
      </section>

      {isSelf && (
        <section className="account-card">
          <button
            type="button"
            className="pwd-mini-toggle"
            onClick={() => setPwdOpen((v) => !v)}
          >
            Change password
          </button>
          {pwdOpen && (
            <form onSubmit={onChangePassword} className="stack tight" style={{ marginTop: '0.75rem' }}>
              <p className="muted profile-pwd-hint">
                Saved passwords cannot be retrieved. Type below and use the eye
                icons to show or hide what you enter.
              </p>
              <PasswordField
                label="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <PasswordField
                label="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              {error && <p className="error">{error}</p>}
              {pwdMsg && <p className="ok">{pwdMsg}</p>}
              <button type="submit" className="btn-compact" disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}
          {!pwdOpen && error && <p className="error">{error}</p>}
        </section>
      )}
    </div>
  );
}
