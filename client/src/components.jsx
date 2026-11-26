import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { getToken, api } from './api';
import { IconChat, IconLogout, IconPaperclip, IconShield, IconUsers } from './icons';
import NotificationBell from './NotificationBell';
import PasswordField from './PasswordField';

export function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MentionBody({ text, mentions = [] }) {
  if (!text) return null;
  const tokens = mentions
    .flatMap((m) => [m.email, m.email?.split('@')[0], m.displayName])
    .filter(Boolean);

  if (!tokens.length) return <p className="body-text">{text}</p>;

  const unique = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  const re = new RegExp(
    `(@(?:${unique.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`,
    'gi',
  );
  const parts = text.split(re);

  return (
    <p className="body-text">
      {parts.map((part, i) =>
        part.startsWith('@') &&
        unique.some((t) => part.slice(1).toLowerCase() === t.toLowerCase()) ? (
          <span key={i} className="mention">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

async function fetchAttachmentBlob(a, { inline }) {
  const res = await fetch(api.attachmentUrl(a.id, { inline }), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Could not open file');
  return res.blob();
}

export function AttachmentList({ attachments = [] }) {
  if (!attachments.length) return null;

  async function openAttachment(a) {
    const blob = await fetchAttachmentBlob(a, { inline: true });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }

  async function downloadAttachment(a) {
    const blob = await fetchAttachmentBlob(a, { inline: false });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = a.originalName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <ul className="attachments">
      {attachments.map((a) => (
        <li key={a.id}>
          <span className="attach-icon">
            <IconPaperclip />
          </span>
          <button
            type="button"
            className="attach-open-btn"
            onClick={() => {
              void openAttachment(a).catch(() => {});
            }}
          >
            {a.originalName}
          </button>
          <span className="muted">
            ({Math.max(1, Math.round(a.size / 1024))} KB)
          </span>
          <button
            type="button"
            className="linkish attach-download-btn"
            onClick={() => {
              void downloadAttachment(a).catch(() => {});
            }}
          >
            Download
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MentionChips({ mentions = [] }) {
  if (!mentions.length) return null;
  return (
    <p className="mention-meta">
      Mentioned: {mentions.map((m) => m.displayName || m.email).join(', ')}
    </p>
  );
}

function ChangePasswordMini() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setOk('');
    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setOk('Updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pwd-mini">
      <button
        type="button"
        className="pwd-mini-toggle"
        onClick={() => {
          setOpen((v) => !v);
          setError('');
          setOk('');
        }}
      >
        Change password
      </button>
      {open && (
        <form className="pwd-mini-panel stack tight" onSubmit={onSubmit}>
          <PasswordField
            label="Current"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <PasswordField
            label="New"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />
          {error && <p className="error">{error}</p>}
          {ok && <p className="ok">{ok}</p>}
          <button type="submit" className="btn-compact" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
    </div>
  );
}

export function Shell({ user, onLogout, children }) {
  const isAdmin = user?.role === 'admin';
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand brand-static">
          <span className="brand-icon">
            <IconChat size={18} />
          </span>
          Discussions App
        </span>
        <nav className="topbar-nav-right">
          {isAdmin && (
            <>
              <NavLink
                to="/admin/employees"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                <IconShield size={16} />
                Admin
              </NavLink>
              <NavLink
                to="/discussions"
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
              >
                <IconUsers size={16} />
                Employee
              </NavLink>
            </>
          )}
        </nav>
        <div className="user-slot">
          <NotificationBell />
          <span className="muted user-name">{user?.displayName}</span>
          <ChangePasswordMini />
          <button type="button" className="linkish logout-btn" onClick={onLogout}>
            <IconLogout />
            Log out
          </button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
