import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import {
  formatWhen,
  MentionBody,
  MentionChips,
  AttachmentList,
} from '../components';
import { IconCheck, IconPaperclip, IconReply, IconSend } from '../icons';
import MentionTextarea from '../MentionTextarea';
import ReactionBar from '../ReactionBar';

function firstFiveWords(text) {
  const words = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return {
    short: words.slice(0, 5).join(' '),
    full: words.join(' '),
    truncated: words.length > 5,
  };
}

function buildReplyTree(flat) {
  const byId = new Map();
  const roots = [];
  for (const r of flat) {
    byId.set(r.id, { ...r, children: [] });
  }
  for (const r of flat) {
    const node = byId.get(r.id);
    const parentId = r.parentReplyId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function ReplyNode({
  reply,
  depth,
  canAccept,
  isClosed,
  users,
  onAccept,
  onNestedReply,
}) {
  const [showNested, setShowNested] = useState(false);
  const [nestedBody, setNestedBody] = useState('');
  const [nestedFiles, setNestedFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitNested(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onNestedReply({
        parentReplyId: reply.id,
        body: nestedBody.trim(),
        files: nestedFiles,
      });
      setNestedBody('');
      setNestedFiles(null);
      setShowNested(false);
      e.target.reset?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`reply-node${reply.isAccepted ? ' accepted-reply' : ''}`}>
      <div className="reply-card" style={{ marginLeft: depth ? `${Math.min(depth, 5) * 1.1}rem` : 0 }}>
        <div className="reply-top">
          <p className="meta">
            {reply.author.displayName} · {formatWhen(reply.createdAt)}
            {reply.isAccepted && (
              <span className="accepted-badge">
                <IconCheck /> Accepted solution
              </span>
            )}
          </p>
          <div className="reply-actions">
            {canAccept && !reply.isAccepted && !isClosed && (
              <button
                type="button"
                className="accept-btn"
                onClick={() => onAccept(reply.id)}
              >
                <IconCheck /> Accept
              </button>
            )}
            {!isClosed && (
              <button
                type="button"
                className="nested-reply-btn"
                onClick={() => setShowNested((v) => !v)}
              >
                <IconReply size={14} /> Reply
              </button>
            )}
          </div>
        </div>
        <MentionBody text={reply.body} mentions={reply.mentions} />
        <AttachmentList attachments={reply.attachments} />
        <MentionChips mentions={reply.mentions} />
        <ReactionBar replyId={reply.id} initial={reply.reactions} />

        {showNested && !isClosed && (
          <form onSubmit={submitNested} className="nested-composer">
            <MentionTextarea
              value={nestedBody}
              onChange={setNestedBody}
              users={users}
              required
              rows={3}
              placeholder={`Reply to ${reply.author.displayName}…`}
            />
            <label className="file-label">
              <span className="file-label-text">
                <IconPaperclip /> Attachments
              </span>
              <input
                type="file"
                multiple
                onChange={(e) => setNestedFiles(e.target.files)}
              />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="nested-actions">
              <button
                type="submit"
                className="nested-send-btn btn-with-icon"
                disabled={busy || !nestedBody.trim()}
              >
                <IconSend size={16} />
                {busy ? 'Sending…' : 'Send reply'}
              </button>
              <button
                type="button"
                className="linkish"
                onClick={() => setShowNested(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {reply.children?.length > 0 && (
        <ul className="reply-list nested">
          {reply.children.map((child) => (
            <ReplyNode
              key={child.id}
              reply={child}
              depth={depth + 1}
              canAccept={canAccept}
              isClosed={isClosed}
              users={users}
              onAccept={onAccept}
              onNestedReply={onNestedReply}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Thread() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [replies, setReplies] = useState([]);
  const [users, setUsers] = useState([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [headingOpen, setHeadingOpen] = useState(false);

  async function load() {
    const [{ post: next, replies: replyRows }, { users: directory }] =
      await Promise.all([api.getPost(id), api.listUsers()]);
    setPost(next);
    setReplies(replyRows);
    setUsers(directory);
  }

  useEffect(() => {
    let cancelled = false;
    setHeadingOpen(false);
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
  }, [id]);

  const tree = useMemo(() => buildReplyTree(replies), [replies]);
  const heading = useMemo(
    () => firstFiveWords(post?.body || post?.title || ''),
    [post],
  );

  async function submitReply({ parentReplyId = null, body: text, files: fileList }) {
    const fd = new FormData();
    fd.append('body', text);
    if (parentReplyId != null) fd.append('parentReplyId', String(parentReplyId));
    if (fileList) {
      for (const f of fileList) fd.append('files', f);
    }
    await api.createReply(id, fd);
    await load();
  }

  async function onReply(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitReply({ body: body.trim(), files });
      setBody('');
      setFiles(null);
      e.target.reset?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptSolution(replyId) {
    try {
      await api.acceptReply(id, replyId);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function closeChat() {
    try {
      await api.closePost(id);
      navigate('/discussions', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p className="muted">Loading thread…</p>;
  if (!post) return <p className="error">{error || 'Post not found'}</p>;

  const isAuthor = Number(user?.id) === Number(post.author.id);
  const canAccept = user?.role === 'admin' || isAuthor;
  const isClosed = post.status === 'closed';

  return (
    <div className="page thread-page">
      <div className="thread-nav">
        <Link to="/discussions" className="back">
          ← Discussions
        </Link>
        {isAuthor && !isClosed && (
          <button type="button" className="close-chat-btn" onClick={closeChat}>
            Close discussion
          </button>
        )}
        {isClosed && <span className="closed-pill">Closed</span>}
      </div>

      <article className="thread-head">
        {heading.truncated && !headingOpen ? (
          <button
            type="button"
            className="thread-heading expandable"
            onClick={() => setHeadingOpen(true)}
            aria-expanded={false}
          >
            <span className="thread-heading-text">{heading.short}…</span>
            <span className="thread-heading-hint">Show more</span>
          </button>
        ) : (
          <div className="thread-heading open">
            <div className="thread-heading-text thread-heading-body">
              <MentionBody text={post.body} mentions={post.mentions} />
            </div>
            {heading.truncated && (
              <button
                type="button"
                className="linkish thread-heading-hint"
                onClick={() => setHeadingOpen(false)}
              >
                Show less
              </button>
            )}
          </div>
        )}
        <p className="meta">
          {post.author.displayName} · {formatWhen(post.createdAt)}
        </p>
        <AttachmentList attachments={post.attachments} />
        <MentionChips mentions={post.mentions} />
        <ReactionBar postId={post.id} initial={post.reactions} />
      </article>

      <section className="replies reply-chain">
        <h2 className="section-title">
          <span className="title-icon reply">
            <IconReply size={18} />
          </span>
          Replies ({replies.length})
        </h2>
        {replies.length === 0 && <p className="muted">No replies yet.</p>}
        <ul className="reply-list">
          {tree.map((r) => (
            <ReplyNode
              key={r.id}
              reply={r}
              depth={0}
              canAccept={canAccept}
              isClosed={isClosed}
              users={users}
              onAccept={acceptSolution}
              onNestedReply={submitReply}
            />
          ))}
        </ul>
      </section>

      {!isClosed && (
        <section className="composer reply-composer thread-reply-bottom" id="reply">
          <h2 className="section-title">
            <span className="title-icon reply">
              <IconReply size={18} />
            </span>
            Reply
          </h2>
          <form onSubmit={onReply} className="stack">
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
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
