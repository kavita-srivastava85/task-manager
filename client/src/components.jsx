import { Link } from 'react-router-dom';
import { getToken, api } from './api';
import { IconChat, IconLogout, IconPaperclip, IconUsers } from './icons';
import NotificationBell from './NotificationBell';

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

export function AttachmentList({ attachments = [] }) {
  if (!attachments.length) return null;

  async function openAttachment(a) {
    const res = await fetch(api.attachmentUrl(a.id, { inline: true }), {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Popup blocked — fall back to download
      const link = document.createElement('a');
      link.href = url;
      link.download = a.originalName;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
              void openAttachment(a);
            }}
          >
            {a.originalName}
          </button>
          <span className="muted">
            {' '}
            ({Math.max(1, Math.round(a.size / 1024))} KB)
          </span>
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
            <Link to="/admin/employees" className="nav-link">
              <IconUsers size={16} />
              Team
            </Link>
          )}
          <Link to="/account" className="nav-link">
            Account
          </Link>
        </nav>
        <div className="user-slot">
          <NotificationBell />
          <span className="muted user-name">{user?.displayName}</span>
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
