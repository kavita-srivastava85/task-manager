import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatWhen } from '../components';
import { IconChat, IconPaperclip, IconPlus, IconSearch, IconSend } from '../icons';
import MentionTextarea from '../MentionTextarea';

const PREVIEW_COUNT = 3;

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

function SideList({ items, emptyLabel, expanded }) {
  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  return (
    <>
      {items.length === 0 && <p className="muted side-empty">{emptyLabel}</p>}
      <ul className={`side-chat-list${expanded ? ' expanded' : ''}`}>
        {visible.map((post) => (
          <ChatRow key={post.id} post={post} />
        ))}
      </ul>
    </>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [topic, setTopic] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [mobileTab, setMobileTab] = useState('recent');
  const [search, setSearch] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [openExpanded, setOpenExpanded] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState(false);

  async function load(q = '') {
    const query = String(q || '').trim();
    const [{ posts: next }, { users: directory }] = await Promise.all([
      query ? api.listPosts({ q: query, mine: true }) : api.listPosts(),
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

  useEffect(() => {
    if (loading) return undefined;
    const q = search.trim();
    const timer = setTimeout(() => {
      setSearchBusy(true);
      load(q)
        .catch((err) => setError(err.message))
        .finally(() => setSearchBusy(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [search]);

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
  const isSearching = search.trim().length > 0;

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      if (topic.trim()) fd.append('title', topic.trim());
      fd.append('body', body.trim());
      if (files) {
        for (const f of files) fd.append('files', f);
      }
      const { post } = await api.createPost(fd);
      setTopic('');
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

  async function clearSearch() {
    setSearch('');
    setSearchBusy(true);
    try {
      await load('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearchBusy(false);
    }
  }

  return (
    <div className="chat-layout three-col">
      <div className="feed-search-bar compact">
        <label className="feed-search-wrap">
          <IconSearch size={14} />
          <input
            type="search"
            className="feed-search-input compact"
            placeholder="Search discussions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search discussions"
          />
        </label>
        {isSearching && (
          <button type="button" className="linkish" onClick={clearSearch}>
            Clear
          </button>
        )}
        {searchBusy && <span className="muted">…</span>}
      </div>

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
        {!loading && (
          <SideList
            items={allOpen}
            emptyLabel={isSearching ? 'No matches' : 'No open discussions'}
            expanded={openExpanded}
          />
        )}
        {!loading && allOpen.length > PREVIEW_COUNT && (
          <button
            type="button"
            className="linkish view-more-btn"
            onClick={() => setOpenExpanded((v) => !v)}
          >
            {openExpanded ? 'View less' : 'View more'}
          </button>
        )}

        <h2 className="side-heading closed">Closed</h2>
        {!loading && (
          <SideList
            items={allClosed}
            emptyLabel={isSearching ? 'No matches' : 'No closed discussions'}
            expanded={closedExpanded}
          />
        )}
        {!loading && allClosed.length > PREVIEW_COUNT && (
          <button
            type="button"
            className="linkish view-more-btn"
            onClick={() => setClosedExpanded((v) => !v)}
          >
            {closedExpanded ? 'View less' : 'View more'}
          </button>
        )}
      </aside>

      <section
        className={`chat-center mobile-panel${mobileTab === 'recent' ? ' mobile-show' : ''}`}
      >
        <button
          type="button"
          className="start-discussion-btn"
          onClick={() => setShowComposer((v) => !v)}
        >
          <span>Start a discussion</span>
          <IconPlus size={18} />
        </button>

        {showComposer && (
          <form onSubmit={onCreate} className="stack composer center-composer">
            <label>
              Topic
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Short topic"
                maxLength={120}
              />
            </label>
            <label>
              Discussion
              <MentionTextarea
                value={body}
                onChange={setBody}
                users={users}
                required
                rows={4}
                placeholder="Write the full discussion…"
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

        <h2 className="center-recent-title">
          {isSearching ? 'Search results' : 'Recent'}
        </h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && recentAll.length === 0 && (
          <p className="muted">
            {isSearching ? 'No matching discussions.' : 'No discussions yet.'}
          </p>
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
          <IconChat size={16} /> Mine
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
