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
import {
  IconCheck,
  IconEdit,
  IconPaperclip,
  IconReply,
  IconSend,
  IconTrash,
} from '../icons';
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

function previewText(text, max = 90) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
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

function AttachmentEditor({ attachments, removeIds, onToggleRemove, onFiles }) {
  return (
    <div className="edit-attachments">
      {attachments?.length > 0 && (
        <ul className="edit-attach-list">
          {attachments.map((a) => {
            const removing = removeIds.includes(a.id);
            return (
              <li key={a.id} className={removing ? 'removing' : ''}>
                <span>{a.originalName}</span>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onToggleRemove(a.id)}
                >
                  {removing ? 'Keep' : 'Remove'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <label className="file-label compact">
        <span className="file-label-text">
          <IconPaperclip /> Add attachments
        </span>
        <input
          type="file"
          multiple
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
    </div>
  );
}

function ReplyNode({
  reply,
  depth,
  canAccept,
  canManage,
  currentUserId,
  isAdmin,
  isClosed,
  users,
  onAccept,
  onNestedReply,
  onEditReply,
  onDeleteReply,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNested, setShowNested] = useState(false);
  const [nestedBody, setNestedBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(reply.body);
  const [removeIds, setRemoveIds] = useState([]);
  const [editFiles, setEditFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendNested(rawText) {
    const text = String(rawText ?? nestedBody).trim();
    if (!text || busy) return;
    setError('');
    setBusy(true);
    try {
      await onNestedReply({
        parentReplyId: reply.id,
        body: text,
      });
      setNestedBody('');
      setShowNested(false);
    } catch (err) {
      setError(err.message || 'Could not send reply');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    const text = editBody.trim();
    if (!text || busy) return;
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('body', text);
      if (removeIds.length) {
        fd.append('removeAttachmentIds', JSON.stringify(removeIds));
      }
      if (editFiles) {
        for (const f of editFiles) fd.append('files', f);
      }
      await onEditReply(reply.id, fd);
      setEditing(false);
      setRemoveIds([]);
      setEditFiles(null);
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this message?')) return;
    setError('');
    setBusy(true);
    try {
      await onDeleteReply(reply.id);
    } catch (err) {
      setError(err.message || 'Could not delete');
      setBusy(false);
    }
  }

  return (
    <li className={`reply-node${reply.isAccepted ? ' accepted-reply' : ''}`}>
      <div
        className={`reply-card${expanded || editing ? ' is-open' : ' is-collapsed'}`}
        style={{ marginLeft: depth ? `${Math.min(depth, 5) * 1.15}rem` : 0 }}
      >
        <button
          type="button"
          className="reply-collapse-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className="meta">
            {reply.author.displayName} · {formatWhen(reply.createdAt)}
            {reply.isAccepted && (
              <span className="accepted-badge">
                <IconCheck /> Accepted
              </span>
            )}
          </span>
          {!expanded && !editing && (
            <span className="reply-preview">{previewText(reply.body)}</span>
          )}
          <span className="muted reply-expand-hint">
            {expanded ? 'Show less' : 'Open reply'}
          </span>
        </button>

        {(expanded || editing) && (
          <>
            <div className="reply-top">
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
              </div>
            </div>

            {editing ? (
              <div className="edit-composer">
                <MentionTextarea
                  value={editBody}
                  onChange={setEditBody}
                  users={users}
                  rows={3}
                  autoFocus
                />
                <AttachmentEditor
                  attachments={reply.attachments}
                  removeIds={removeIds}
                  onToggleRemove={(id) =>
                    setRemoveIds((prev) =>
                      prev.includes(id)
                        ? prev.filter((x) => x !== id)
                        : [...prev, id],
                    )
                  }
                  onFiles={setEditFiles}
                />
                <div className="nested-actions">
                  <button
                    type="button"
                    className="nested-send-btn btn-with-icon"
                    disabled={busy || !editBody.trim()}
                    onClick={() => {
                      void saveEdit();
                    }}
                  >
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      setEditing(false);
                      setEditBody(reply.body);
                      setRemoveIds([]);
                      setEditFiles(null);
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <MentionBody text={reply.body} mentions={reply.mentions} />
                <AttachmentList attachments={reply.attachments} />
                <MentionChips mentions={reply.mentions} />
              </>
            )}

            <div className="reply-message-actions">
              <ReactionBar replyId={reply.id} initial={reply.reactions} />
              {!isClosed && (
                <button
                  type="button"
                  className="nested-reply-icon"
                  aria-label="Reply"
                  title="Reply"
                  onClick={() => {
                    setShowNested((v) => !v);
                    setError('');
                  }}
                >
                  <IconReply size={16} />
                  <span>Reply</span>
                </button>
              )}
              {canManage && !editing && (
                <>
                  {!isClosed && (
                    <button
                      type="button"
                      className="msg-action-btn"
                      onClick={() => {
                        setEditBody(reply.body);
                        setRemoveIds([]);
                        setEditFiles(null);
                        setEditing(true);
                        setExpanded(true);
                        setError('');
                      }}
                    >
                      <IconEdit size={14} /> Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="msg-action-btn danger"
                    onClick={() => {
                      void remove();
                    }}
                    disabled={busy}
                  >
                    <IconTrash size={14} /> Delete
                  </button>
                </>
              )}
            </div>

            {error && <p className="error">{error}</p>}

            {showNested && !isClosed && (
              <div className="nested-composer">
                <MentionTextarea
                  value={nestedBody}
                  onChange={setNestedBody}
                  users={users}
                  rows={2}
                  autoFocus
                  placeholder={`Reply to ${reply.author.displayName}…`}
                  onEnterSubmit={(text) => {
                    void sendNested(text);
                  }}
                />
                <div className="nested-actions">
                  <button
                    type="button"
                    className="nested-send-btn btn-with-icon"
                    disabled={busy || !nestedBody.trim()}
                    onClick={() => {
                      void sendNested(nestedBody);
                    }}
                  >
                    <IconSend size={16} />
                    {busy ? 'Sending…' : 'Send'}
                  </button>
                  <span className="muted nested-hint">Press Enter to send</span>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => {
                      setShowNested(false);
                      setNestedBody('');
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
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
              canManage={
                isAdmin || Number(child.author.id) === Number(currentUserId)
              }
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isClosed={isClosed}
              users={users}
              onAccept={onAccept}
              onNestedReply={onNestedReply}
              onEditReply={onEditReply}
              onDeleteReply={onDeleteReply}
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
  const [editingPost, setEditingPost] = useState(false);
  const [editTopic, setEditTopic] = useState('');
  const [editPostBody, setEditPostBody] = useState('');
  const [removePostAttIds, setRemovePostAttIds] = useState([]);
  const [editPostFiles, setEditPostFiles] = useState(null);

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
    setEditingPost(false);
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
    if (parentReplyId != null && parentReplyId !== '') {
      fd.append('parentReplyId', String(parentReplyId));
    }
    if (fileList) {
      for (const f of fileList) fd.append('files', f);
    }
    const created = await api.createReply(id, fd);
    await load();
    return created;
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
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function reopenChat() {
    try {
      await api.reopenPost(id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function savePostEdit() {
    const text = editPostBody.trim();
    if (!text) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      if (editTopic.trim()) fd.append('title', editTopic.trim());
      fd.append('body', text);
      if (removePostAttIds.length) {
        fd.append('removeAttachmentIds', JSON.stringify(removePostAttIds));
      }
      if (editPostFiles) {
        for (const f of editPostFiles) fd.append('files', f);
      }
      await api.updatePost(id, fd);
      setEditingPost(false);
      setRemovePostAttIds([]);
      setEditPostFiles(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePost() {
    if (!window.confirm('Delete this discussion?')) return;
    setBusy(true);
    try {
      await api.deletePost(id);
      navigate('/discussions', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function editReply(replyId, formData) {
    await api.updateReply(id, replyId, formData);
    await load();
  }

  async function deleteReply(replyId) {
    await api.deleteReply(id, replyId);
    await load();
  }

  if (loading) return <p className="muted">Loading thread…</p>;
  if (!post) return <p className="error">{error || 'Post not found'}</p>;

  const isAuthor = Number(user?.id) === Number(post.author.id);
  const isAdmin = user?.role === 'admin';
  const canManagePost = isAuthor || isAdmin;
  const canCloseReopen = isAuthor || isAdmin;
  const canAccept = isAdmin || isAuthor;
  const isClosed = post.status === 'closed';

  return (
    <div className="page thread-page">
      <div className="thread-nav">
        <Link to="/discussions" className="back">
          ← Back
        </Link>
        <div className="thread-nav-actions">
          {canCloseReopen && !isClosed && (
            <button type="button" className="close-chat-btn" onClick={closeChat}>
              Close discussion
            </button>
          )}
          {canCloseReopen && isClosed && (
            <button
              type="button"
              className="reopen-chat-btn"
              onClick={reopenChat}
            >
              Reopen discussion
            </button>
          )}
          {isClosed && <span className="closed-pill">Closed</span>}
        </div>
      </div>

      <article className="thread-head">
        {post.title && (
          <p className="thread-topic">
            <span className="muted">Topic</span> {post.title}
          </p>
        )}

        {editingPost ? (
          <div className="edit-composer">
            <label>
              Topic
              <input
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                maxLength={120}
              />
            </label>
            <MentionTextarea
              value={editPostBody}
              onChange={setEditPostBody}
              users={users}
              rows={4}
              autoFocus
            />
            <AttachmentEditor
              attachments={post.attachments}
              removeIds={removePostAttIds}
              onToggleRemove={(attId) =>
                setRemovePostAttIds((prev) =>
                  prev.includes(attId)
                    ? prev.filter((x) => x !== attId)
                    : [...prev, attId],
                )
              }
              onFiles={setEditPostFiles}
            />
            <div className="nested-actions">
              <button
                type="button"
                className="nested-send-btn btn-with-icon"
                disabled={busy || !editPostBody.trim()}
                onClick={() => {
                  void savePostEdit();
                }}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  setEditingPost(false);
                  setRemovePostAttIds([]);
                  setEditPostFiles(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : heading.truncated && !headingOpen ? (
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
        {!editingPost && <AttachmentList attachments={post.attachments} />}
        <MentionChips mentions={post.mentions} />
        <div className="reply-message-actions post-message-actions">
          <ReactionBar postId={post.id} initial={post.reactions} />
          {canManagePost && !editingPost && (
            <>
              {!isClosed && (
                <button
                  type="button"
                  className="msg-action-btn"
                  onClick={() => {
                    setEditTopic(post.title || '');
                    setEditPostBody(post.body);
                    setRemovePostAttIds([]);
                    setEditPostFiles(null);
                    setEditingPost(true);
                    setHeadingOpen(true);
                  }}
                >
                  <IconEdit size={14} /> Edit
                </button>
              )}
              <button
                type="button"
                className="msg-action-btn danger"
                onClick={() => {
                  void deletePost();
                }}
                disabled={busy}
              >
                <IconTrash size={14} /> Delete
              </button>
            </>
          )}
        </div>
        {error && <p className="error">{error}</p>}
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
              canManage={
                isAdmin || Number(r.author.id) === Number(user?.id)
              }
              currentUserId={user?.id}
              isAdmin={isAdmin}
              isClosed={isClosed}
              users={users}
              onAccept={acceptSolution}
              onNestedReply={submitReply}
              onEditReply={editReply}
              onDeleteReply={deleteReply}
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
            <button type="submit" className="btn-with-icon" disabled={busy}>
              <IconSend size={16} />
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </form>
        </section>
      )}
      {isClosed && (
        <p className="close-chat-banner">
          This discussion is closed.
          {canCloseReopen ? ' You can reopen it above.' : ''}
        </p>
      )}
    </div>
  );
}
