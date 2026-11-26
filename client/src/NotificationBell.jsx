import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { IconBell } from './icons';
import { formatWhen } from './components';

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapRef = useRef(null);

  async function load() {
    try {
      const data = await api.listNotifications();
      setItems(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // ignore transient errors while logged out/transitioning
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function onOpenItem(item) {
    const postId = Number(item.postId);
    if (!postId) return;

    setOpen(false);
    try {
      if (!item.readAt) {
        await api.markNotificationRead(item.id);
        setItems((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // still open the discussion
    }

    navigate(`/posts/${postId}`);
  }

  async function markAll() {
    await api.markAllNotificationsRead();
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })),
    );
    setUnreadCount(0);
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell"
        aria-label={
          unreadCount > 0
            ? `${unreadCount} notifications`
            : 'Notifications'
        }
        onClick={() => {
          setOpen((v) => !v);
          load();
        }}
      >
        <IconBell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>{unreadCount > 0 ? unreadCount : 'Inbox'}</strong>
            {unreadCount > 0 && (
              <button type="button" className="linkish" onClick={markAll}>
                Clear
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted notif-empty">No notifications</p>
          ) : (
            <ul className="notif-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`notif-item${item.readAt ? '' : ' unread'}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onOpenItem(item);
                    }}
                  >
                    <span className="notif-msg">
                      {item.actor?.displayName || 'Someone'}
                      {item.type === 'mention'
                        ? ' tagged you'
                        : item.type === 'accepted_solution'
                          ? ' accepted your reply'
                          : ''}
                    </span>
                    <span className="muted notif-time">
                      {formatWhen(item.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
