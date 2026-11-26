import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatWhen } from '../components';
import PasswordField from '../PasswordField';
import { IconChat } from '../icons';

export default function Account() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await api.getAccount();
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onChangePassword(e) {
    e.preventDefault();
    setPwdMsg('');
    setError('');
    if (newPassword !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setPwdBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setPwdMsg('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPwdBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading account…</p>;

  const profile = data?.user || user;

  return (
    <div className="page account-page">
      <section className="intro">
        <h1 className="page-title">
          <span className="title-icon users">
            <IconChat size={22} />
          </span>
          My account
        </h1>
      </section>

      <section className="account-card">
        <h2 className="section-title">Profile</h2>
        <dl className="cred-grid">
          <div>
            <dt>Name</dt>
            <dd>{profile?.displayName}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{profile?.email}</dd>
          </div>
          {profile?.role === 'admin' && (
            <div>
              <dt>Access</dt>
              <dd>Admin</dd>
            </div>
          )}
          <div>
            <dt>Member since</dt>
            <dd>{formatWhen(profile?.createdAt)}</dd>
          </div>
        </dl>
        <p className="muted account-stats">
          Started {data?.stats?.startedCount ?? 0} · Replied in{' '}
          {data?.stats?.repliedCount ?? 0} · Also joined{' '}
          {data?.stats?.participatedCount ?? 0}
        </p>
      </section>

      <section className="account-card">
        <h2 className="section-title">Change password</h2>
        <form onSubmit={onChangePassword} className="stack tight">
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
          <button type="submit" className="btn-compact" disabled={pwdBusy}>
            {pwdBusy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </section>

      <section className="account-card">
        <h2 className="section-title">Discussions I started</h2>
        {(data?.started || []).length === 0 && (
          <p className="muted">None yet.</p>
        )}
        <ul className="account-list">
          {(data?.started || []).map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`}>
                <strong>{post.title}</strong>
                <span className="muted">
                  {' '}
                  · {(post.status || 'open') === 'closed' ? 'Closed' : 'Open'} ·{' '}
                  {formatWhen(post.updatedAt || post.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="account-card">
        <h2 className="section-title">Discussions I replied to</h2>
        {(data?.participated || []).length === 0 && (
          <p className="muted">None yet.</p>
        )}
        <ul className="account-list">
          {(data?.participated || []).map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`}>
                <strong>{post.title}</strong>
                <span className="muted">
                  {' '}
                  · {post.author.displayName} ·{' '}
                  {formatWhen(post.updatedAt || post.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
