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
            <dd>••••••••</dd>
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
