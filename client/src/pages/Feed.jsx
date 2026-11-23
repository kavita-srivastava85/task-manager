import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatWhen } from '../components';
import { IconChat, IconPaperclip, IconPlus, IconSend } from '../icons';
import MentionTextarea from '../MentionTextarea';

function ChatRow({ post }) {
  return (
    <li>
      <Link to={`/posts/${post.id}`} className="side-chat-link">
        <span className="side-chat-title">{post.title}</span>
        <span className="muted side-chat-meta">
          {post.author.displayName} · {formatWhen(post.updatedAt || post.createdAt)}
        </span>
      </Link>
    </li>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [mobileTab, setMobileTab] = useState('recent');

  async function load() {
    const [{ posts: next }, { users: directory }] = await Promise.all([
      api.listPosts(),
      api.listUsers(),
    ]);
    setPosts(next);
    setUsers(directory);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
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

  const allOpen = useMemo(
    () => posts.filter((p) => (p.status || 'open') === 'open'),
    [posts],
  );
  const allClosed = useMemo(
    () => posts.filter((p) => p.status === 'closed'),
    [posts],
  );
  const myChats = useMemo(
    () => posts.filter((p) => Number(p.author.id) === Number(user?.id)),
    [posts, user?.id],
  );
  const recentAll = useMemo(() => posts.slice(0, 4), [posts]);

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('body', body.trim());
      if (files) {
        for (const f of files) fd.append('files', f);
      }
      const { post } = await api.createPost(fd);
      setBody('');
      setFiles(null);
      e.target.reset?.();
      setShowComposer(false);
      await load();
      window.location.assign(`/posts/${post.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-layout three-col">
      <div className="mobile-feed-tabs" role="tablist" aria-label="Discussions">
        <button
          type="button"
          role="tab"
          className={mobileTab === 'all' ? 'active' : ''}
          aria-selected={mobileTab === 'all'}
          onClick={() => setMobileTab('all')}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          className={mobileTab === 'recent' ? 'active' : ''}
          aria-selected={mobileTab === 'recent'}
          onClick={() => setMobileTab('recent')}
        >
          Recent
        </button>
        <button
          type="button"
          role="tab"
          className={mobileTab === 'mine' ? 'active' : ''}
          aria-selected={mobileTab === 'mine'}
          onClick={() => setMobileTab('mine')}
        >
          Mine
        </button>
      </div>

      <aside
        className={`chat-side mobile-panel${mobileTab === 'all' ? ' mobile-show' : ''}`}
      >
        <h2 className="side-heading">
          <IconChat size={16} /> Open
        </h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && allOpen.length === 0 && (
          <p className="muted side-empty">No open discussions</p>
        )}
        <ul className="side-chat-list">
          {allOpen.map((post) => (
            <ChatRow key={post.id} post={post} />
          ))}
        </ul>

        <h2 className="side-heading closed">Closed</h2>
        {!loading && allClosed.length === 0 && (
          <p className="muted side-empty">No closed discussions</p>
        )}
        <ul className="side-chat-list">
          {allClosed.map((post) => (
            <ChatRow key={post.id} post={post} />
          ))}
        </ul>
      </aside>

      <section
        className={`chat-center mobile-panel${mobileTab === 'recent' ? ' mobile-show' : ''}`}
      >
        <button
          type="button"
          className="new-chat-plus"
          aria-label="New discussion"
          onClick={() => setShowComposer((v) => !v)}
        >
          <IconPlus size={28} />
        </button>

        {showComposer && (
          <form onSubmit={onCreate} className="stack composer center-composer">
            <h2 className="section-title">
              <span className="title-icon plus">
                <IconPlus size={18} />
              </span>
              New discussion
            </h2>
            <label>
              Message
              <MentionTextarea
                value={body}
                onChange={setBody}
                users={users}
                required
                rows={4}
              />
            </label>
            <label className="file-label">
              <span className="file-label-text">
                <IconPaperclip /> Attachments
              </span>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files)}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn-with-icon" disabled={busy}>
              <IconSend size={16} />
              {busy ? 'Posting…' : 'Create'}
            </button>
          </form>
        )}

        <h2 className="center-recent-title">Recent</h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && recentAll.length === 0 && (
          <p className="muted">No discussions yet.</p>
        )}
        <ul className="center-recent-list">
          {recentAll.map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`} className="recent-card">
                <strong>{post.title}</strong>
                <span className="muted">
                  {post.author.displayName} ·{' '}
                  {(post.status || 'open') === 'closed' ? 'Closed' : 'Open'} ·{' '}
                  {formatWhen(post.updatedAt || post.createdAt)}
                </span>
                <span className="snippet">{post.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <aside
        className={`chat-side chat-side-right mobile-panel${mobileTab === 'mine' ? ' mobile-show' : ''}`}
      >
        <h2 className="side-heading">
          <IconChat size={16} /> My discussions
        </h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && myChats.length === 0 && (
          <p className="muted side-empty">No discussions yet</p>
        )}
        <ul className="side-chat-list">
          {myChats.map((post) => (
            <li key={post.id}>
              <Link to={`/posts/${post.id}`} className="side-chat-link">
                <span className="side-chat-title">{post.title}</span>
                <span className="muted side-chat-meta">
                  {(post.status || 'open') === 'closed' ? 'Closed' : 'Open'} ·{' '}
                  {formatWhen(post.updatedAt || post.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
