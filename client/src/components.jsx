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
  return (
    <ul className="attachments">
      {attachments.map((a) => (
        <li key={a.id}>
          <span className="attach-icon">
            <IconPaperclip />
          </span>
          <a
            href={api.attachmentUrl(a.id)}
            onClick={async (e) => {
              e.preventDefault();
              const res = await fetch(api.attachmentUrl(a.id), {
                headers: { Authorization: `Bearer ${getToken()}` },
              });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = a.originalName;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            {a.originalName}
          </a>
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
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/discussions" className="brand">
          <span className="brand-icon">
            <IconChat size={18} />
          </span>
          Discussions App
        </Link>
        <nav>
          <Link to="/discussions" className="nav-link">
            <IconChat size={16} />
            Discussions
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin/employees" className="nav-link">
              <IconUsers size={16} />
              Employees
            </Link>
          )}
        </nav>
        <div className="user-slot">
          <NotificationBell />
          <span className="muted">
            {user?.displayName} · {user?.role}
          </span>
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
