import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import db from './db.js';
import {
  authRequired,
  adminRequired,
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
} from './auth.js';
import { parseMentions } from './mentions.js';
import {
  createNotification,
  notifyEveryone,
  mapNotification,
} from './notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const UPLOAD_DIR = path.resolve(
  __dirname,
  '..',
  process.env.UPLOAD_DIR || 'uploads',
);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

const app = express();
const corsOrigin =
  CLIENT_ORIGIN === '*'
    ? true
    : CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

function listUsersForMentions() {
  return db
    .prepare('SELECT id, email, display_name FROM users ORDER BY email')
    .all();
}

function attachmentsFor(postId = null, replyId = null) {
  if (postId != null) {
    return db
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType,
                size, stored_name AS storedName, created_at AS createdAt
         FROM attachments WHERE post_id = ?`,
      )
      .all(postId);
  }
  return db
    .prepare(
      `SELECT id, original_name AS originalName, mime_type AS mimeType,
              size, stored_name AS storedName, created_at AS createdAt
       FROM attachments WHERE reply_id = ?`,
    )
    .all(replyId);
}

function mentionsFor(postId = null, replyId = null) {
  return postId != null
    ? db
        .prepare(
          `SELECT m.id, u.id AS userId, u.email, u.display_name AS displayName
           FROM mentions m JOIN users u ON u.id = m.mentioned_user_id
           WHERE m.post_id = ?`,
        )
        .all(postId)
    : db
        .prepare(
          `SELECT m.id, u.id AS userId, u.email, u.display_name AS displayName
           FROM mentions m JOIN users u ON u.id = m.mentioned_user_id
           WHERE m.reply_id = ?`,
        )
        .all(replyId);
}

function saveMentions({ postId = null, replyId = null, body }) {
  const users = listUsersForMentions();
  const mentioned = parseMentions(body, users);
  const insert = db.prepare(
    `INSERT INTO mentions (post_id, reply_id, mentioned_user_id)
     VALUES (?, ?, ?)`,
  );
  for (const user of mentioned) {
    insert.run(postId, replyId, user.id);
  }
  return mentioned.map((u) => ({
    userId: u.id,
    email: u.email,
    displayName: u.display_name,
  }));
}

function saveAttachments({ postId = null, replyId = null, files = [] }) {
  const insert = db.prepare(
    `INSERT INTO attachments
      (post_id, reply_id, stored_name, original_name, mime_type, size)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const saved = [];
  for (const file of files) {
    const info = insert.run(
      postId,
      replyId,
      file.filename,
      file.originalname,
      file.mimetype,
      file.size,
    );
    saved.push({
      id: info.lastInsertRowid,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storedName: file.filename,
    });
  }
  return saved;
}

function reactionsFor(postId = null, replyId = null, viewerId = null) {
  const rows =
    postId != null
      ? db
          .prepare(
            `SELECT kind, COUNT(*) AS count,
                    SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
             FROM reactions WHERE post_id = ? AND kind = 'heart'
             GROUP BY kind`,
          )
          .all(viewerId ?? -1, postId)
      : db
          .prepare(
            `SELECT kind, COUNT(*) AS count,
                    SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
             FROM reactions WHERE reply_id = ? AND kind = 'heart'
             GROUP BY kind`,
          )
          .all(viewerId ?? -1, replyId);

  const base = {
    heart: { count: 0, reacted: false },
  };
  for (const row of rows) {
    if (row.kind !== 'heart') continue;
    base.heart = {
      count: Number(row.count || 0),
      reacted: Number(row.mine || 0) > 0,
    };
  }
  return base;
}

function mapReply(r, acceptedReplyId, viewerId) {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    parentReplyId: r.parent_reply_id ?? null,
    isAccepted: acceptedReplyId === r.id,
    author: {
      id: r.author_id,
      email: r.author_email,
      displayName: r.author_display_name,
      role: r.author_role,
    },
    attachments: attachmentsFor(null, r.id),
    mentions: mentionsFor(null, r.id),
    reactions: reactionsFor(null, r.id, viewerId),
  };
}

function mapPost(row, viewerId = null) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status || 'open',
    acceptedReplyId: row.accepted_reply_id ?? null,
    author: {
      id: row.author_id,
      email: row.author_email,
      displayName: row.author_display_name,
      role: row.author_role,
    },
    replyCount: row.reply_count ?? 0,
    attachments: attachmentsFor(row.id, null),
    mentions: mentionsFor(row.id, null),
    reactions: reactionsFor(row.id, null, viewerId),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'task-manager' });
});

app.get('/api/auth/status', (_req, res) => {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
    .get();
  res.json({
    hasAdmin: Number(row?.count || 0) > 0,
    needsAdminSignup: Number(row?.count || 0) === 0,
  });
});

/** First-time admin creates their own login ID (sign up). */
app.post('/api/auth/admin/signup', (req, res) => {
  const existingAdmins = db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
    .get();
  if (Number(existingAdmins?.count || 0) > 0) {
    return res.status(403).json({
      error: 'An admin account already exists. Please sign in to the admin console.',
    });
  }

  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || '');
  const displayName = String(
    req.body?.displayName || email.split('@')[0] || 'admin',
  ).trim();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES (?, ?, 'admin', ?)`,
      )
      .run(email, hashPassword(password), displayName);
    const user = db
      .prepare(
        'SELECT id, email, role, display_name, created_at FROM users WHERE id = ?',
      )
      .get(result.lastInsertRowid);
    res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
      message: 'Admin account created. You are signed in.',
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || '');
  const expectedRole = String(req.body?.role || '').trim().toLowerCase();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (expectedRole === 'admin' && user.role !== 'admin') {
    return res.status(403).json({
      error: 'This is the admin console. Employees must use Employee login.',
    });
  }
  if (expectedRole === 'employee' && user.role !== 'employee') {
    return res.status(403).json({
      error: 'This is the employee console. Admins must use Admin login.',
    });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(404).json({ error: 'No account found with that email' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(
    `UPDATE password_resets SET used_at = datetime('now')
     WHERE user_id = ? AND used_at IS NULL`,
  ).run(user.id);

  db.prepare(
    `INSERT INTO password_resets (user_id, token, expires_at)
     VALUES (?, ?, ?)`,
  ).run(user.id, token, expiresAt);

  // Local MVP: return token so the client can go straight to reset password.
  res.json({
    ok: true,
    resetToken: token,
    role: user.role,
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password required' });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: 'Password must be at least 6 characters' });
  }

  const row = db
    .prepare(
      `SELECT pr.*, u.role, u.email
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.token = ?`,
    )
    .get(token);

  if (!row || row.used_at) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Reset link has expired' });
  }

  const update = db.transaction(() => {
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
      hashPassword(password),
      row.user_id,
    );
    db.prepare(
      `UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`,
    ).run(row.id);
  });
  update();

  res.json({
    ok: true,
    role: row.role,
    email: row.email,
  });
});

app.get('/api/notifications', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.*,
              a.display_name AS actor_display_name,
              a.email AS actor_email
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
    )
    .all(req.user.id);
  const unreadCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM notifications
       WHERE user_id = ? AND read_at IS NULL`,
    )
    .get(req.user.id);
  res.json({
    notifications: rows.map(mapNotification),
    unreadCount: Number(unreadCount?.count || 0),
  });
});

app.post('/api/notifications/:id/read', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(`SELECT * FROM notifications WHERE id = ? AND user_id = ?`)
    .get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  db.prepare(
    `UPDATE notifications SET read_at = datetime('now')
     WHERE id = ? AND read_at IS NULL`,
  ).run(id);
  const updated = db
    .prepare(
      `SELECT n.*,
              a.display_name AS actor_display_name,
              a.email AS actor_email
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       WHERE n.id = ?`,
    )
    .get(id);
  res.json({ notification: mapNotification(updated) });
});

app.post('/api/notifications/read-all', authRequired, (req, res) => {
  db.prepare(
    `UPDATE notifications SET read_at = datetime('now')
     WHERE user_id = ? AND read_at IS NULL`,
  ).run(req.user.id);
  res.json({ ok: true });
});

app.get('/api/admin/employees', authRequired, adminRequired, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, email, role, display_name, created_at
       FROM users ORDER BY role DESC, email ASC`,
    )
    .all();
  res.json({ employees: rows.map(publicUser) });
});

app.post('/api/admin/employees', authRequired, adminRequired, (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || '');
  const displayName = String(
    req.body?.displayName || email.split('@')[0] || 'employee',
  ).trim();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES (?, ?, 'employee', ?)`,
      )
      .run(email, hashPassword(password), displayName);
    const user = db
      .prepare(
        'SELECT id, email, role, display_name, created_at FROM users WHERE id = ?',
      )
      .get(result.lastInsertRowid);
    res.status(201).json({ employee: publicUser(user) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    throw err;
  }
});

app.get('/api/users', authRequired, (_req, res) => {
  const users = db
    .prepare(
      `SELECT id, email, role, display_name, created_at FROM users ORDER BY email`,
    )
    .all();
  res.json({ users: users.map(publicUser) });
});

app.get('/api/posts', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p
       JOIN users u ON u.id = p.author_id
       ORDER BY p.updated_at DESC, p.created_at DESC`,
    )
    .all();
  res.json({ posts: rows.map((row) => mapPost(row, req.user.id)) });
});

function titleFromBody(body, maxWords = 5) {
  const words = String(body || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (!words.length) return 'Discussion';
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

app.post('/api/posts', authRequired, upload.array('files', 5), (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) {
    return res.status(400).json({ error: 'Message required' });
  }
  const title = titleFromBody(body);

  const create = db.transaction(() => {
    const result = db
      .prepare(`INSERT INTO posts (author_id, title, body) VALUES (?, ?, ?)`)
      .run(req.user.id, title, body);
    const postId = result.lastInsertRowid;
    saveMentions({ postId, body });
    saveAttachments({ postId, files: req.files || [] });
    notifyEveryone({
      postId,
      actorId: req.user.id,
    });
    return postId;
  });

  const postId = create();
  const row = db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              0 AS reply_count
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(postId);
  res.status(201).json({ post: mapPost(row, req.user.id) });
});

app.get('/api/posts/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'Post not found' });

  const replies = db
    .prepare(
      `SELECT r.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role
       FROM replies r
       JOIN users u ON u.id = r.author_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC`,
    )
    .all(id)
    .map((r) => mapReply(r, row.accepted_reply_id, req.user.id));

  res.json({ post: mapPost(row, req.user.id), replies });
});

app.post('/api/posts/:id/close', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.author_id !== req.user.id) {
    return res
      .status(403)
      .json({ error: 'Only the person who started the discussion can close it' });
  }
  db.prepare(
    `UPDATE posts SET status = 'closed', updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  const row = db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(id);
  res.json({ post: mapPost(row, req.user.id) });
});

function canModifyContent(reqUser, authorId) {
  // Only the person who wrote the message can edit/delete it
  return Number(reqUser.id) === Number(authorId);
}

app.patch('/api/posts/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canModifyContent(req.user, post.author_id)) {
    return res.status(403).json({ error: 'Not allowed to edit this message' });
  }
  if ((post.status || 'open') === 'closed') {
    return res.status(400).json({ error: 'This discussion is closed' });
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message required' });
  const title = titleFromBody(body);

  db.transaction(() => {
    db.prepare(
      `UPDATE posts SET body = ?, title = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(body, title, id);
    db.prepare(`DELETE FROM mentions WHERE post_id = ?`).run(id);
    saveMentions({ postId: id, body });
  })();

  const row = db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(id);
  res.json({ post: mapPost(row, req.user.id) });
});

app.delete('/api/posts/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canModifyContent(req.user, post.author_id)) {
    return res.status(403).json({ error: 'Not allowed to delete this message' });
  }
  db.prepare(`DELETE FROM posts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

app.patch('/api/posts/:postId/replies/:replyId', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const replyId = Number(req.params.replyId);
  const post = db.prepare('SELECT id, status FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if ((post.status || 'open') === 'closed') {
    return res.status(400).json({ error: 'This discussion is closed' });
  }
  const reply = db.prepare('SELECT * FROM replies WHERE id = ?').get(replyId);
  if (!reply || Number(reply.post_id) !== postId) {
    return res.status(404).json({ error: 'Reply not found' });
  }
  if (!canModifyContent(req.user, reply.author_id)) {
    return res.status(403).json({ error: 'Not allowed to edit this message' });
  }
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message required' });

  db.transaction(() => {
    db.prepare(`UPDATE replies SET body = ? WHERE id = ?`).run(body, replyId);
    db.prepare(`DELETE FROM mentions WHERE reply_id = ?`).run(replyId);
    saveMentions({ replyId, body });
    db.prepare(
      `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
    ).run(postId);
  })();

  const r = db
    .prepare(
      `SELECT r.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role
       FROM replies r
       JOIN users u ON u.id = r.author_id
       WHERE r.id = ?`,
    )
    .get(replyId);
  const accepted = db
    .prepare('SELECT accepted_reply_id FROM posts WHERE id = ?')
    .get(postId)?.accepted_reply_id;
  res.json({ reply: mapReply(r, accepted, req.user.id) });
});

app.delete('/api/posts/:postId/replies/:replyId', authRequired, (req, res) => {
  const postId = Number(req.params.postId);
  const replyId = Number(req.params.replyId);
  const reply = db.prepare('SELECT * FROM replies WHERE id = ?').get(replyId);
  if (!reply || Number(reply.post_id) !== postId) {
    return res.status(404).json({ error: 'Reply not found' });
  }
  if (!canModifyContent(req.user, reply.author_id)) {
    return res.status(403).json({ error: 'Not allowed to delete this message' });
  }
  db.transaction(() => {
    db.prepare(
      `UPDATE posts SET accepted_reply_id = NULL WHERE id = ? AND accepted_reply_id = ?`,
    ).run(postId, replyId);
    db.prepare(`DELETE FROM replies WHERE id = ?`).run(replyId);
    db.prepare(
      `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
    ).run(postId);
  })();
  res.json({ ok: true });
});

app.post('/api/reactions', authRequired, (req, res) => {
  const kind = String(req.body?.kind || '').trim();
  const postId = req.body?.postId != null ? Number(req.body.postId) : null;
  const replyId = req.body?.replyId != null ? Number(req.body.replyId) : null;

  if (kind !== 'heart') {
    return res.status(400).json({ error: 'Only heart reactions are supported' });
  }
  if (
    (postId == null && replyId == null) ||
    (postId != null && replyId != null)
  ) {
    return res.status(400).json({ error: 'Provide postId or replyId' });
  }

  if (postId != null) {
    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const existing = db
      .prepare(
        `SELECT id FROM reactions WHERE user_id = ? AND post_id = ? AND kind = ?`,
      )
      .get(req.user.id, postId, kind);
    if (existing) {
      db.prepare(`DELETE FROM reactions WHERE id = ?`).run(existing.id);
    } else {
      db.prepare(
        `INSERT INTO reactions (user_id, post_id, kind) VALUES (?, ?, ?)`,
      ).run(req.user.id, postId, kind);
    }
    return res.json({ reactions: reactionsFor(postId, null, req.user.id) });
  }

  const reply = db.prepare('SELECT id FROM replies WHERE id = ?').get(replyId);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });
  const existing = db
    .prepare(
      `SELECT id FROM reactions WHERE user_id = ? AND reply_id = ? AND kind = ?`,
    )
    .get(req.user.id, replyId, kind);
  if (existing) {
    db.prepare(`DELETE FROM reactions WHERE id = ?`).run(existing.id);
  } else {
    db.prepare(
      `INSERT INTO reactions (user_id, reply_id, kind) VALUES (?, ?, ?)`,
    ).run(req.user.id, replyId, kind);
  }
  res.json({ reactions: reactionsFor(null, replyId, req.user.id) });
});

app.post(
  '/api/posts/:id/replies',
  authRequired,
  upload.array('files', 5),
  (req, res) => {
    const postId = Number(req.params.id);
    const post = db
      .prepare('SELECT id, title, author_id, status FROM posts WHERE id = ?')
      .get(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if ((post.status || 'open') === 'closed') {
      return res.status(400).json({ error: 'This discussion is closed' });
    }

    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Body required' });

    let parentReplyId =
      req.body?.parentReplyId != null && String(req.body.parentReplyId) !== ''
        ? Number(req.body.parentReplyId)
        : null;
    if (parentReplyId != null) {
      const parent = db
        .prepare('SELECT id, post_id FROM replies WHERE id = ?')
        .get(parentReplyId);
      if (!parent || Number(parent.post_id) !== postId) {
        return res.status(400).json({ error: 'Invalid parent reply' });
      }
    } else {
      parentReplyId = null;
    }

    const create = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO replies (post_id, author_id, body, parent_reply_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(postId, req.user.id, body, parentReplyId);
      const replyId = result.lastInsertRowid;
      db.prepare(
        `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
      ).run(postId);
      saveMentions({ replyId, body });
      saveAttachments({ replyId, files: req.files || [] });
      notifyEveryone({
        postId,
        replyId,
        actorId: req.user.id,
      });
      return replyId;
    });

    const replyId = create();
    const r = db
      .prepare(
        `SELECT r.*,
                u.email AS author_email,
                u.display_name AS author_display_name,
                u.role AS author_role
         FROM replies r
         JOIN users u ON u.id = r.author_id
         WHERE r.id = ?`,
      )
      .get(replyId);

    res.status(201).json({
      reply: mapReply(r, null, req.user.id),
    });
  },
);

app.post(
  '/api/posts/:postId/replies/:replyId/accept',
  authRequired,
  (req, res) => {
    const postId = Number(req.params.postId);
    const replyId = Number(req.params.replyId);
    const post = db
      .prepare('SELECT id, title, author_id, accepted_reply_id FROM posts WHERE id = ?')
      .get(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const canAccept =
      req.user.role === 'admin' || req.user.id === post.author_id;
    if (!canAccept) {
      return res
        .status(403)
        .json({ error: 'Only the thread author or an admin can accept a solution' });
    }

    const reply = db
      .prepare('SELECT id, author_id, post_id FROM replies WHERE id = ?')
      .get(replyId);
    if (!reply || reply.post_id !== postId) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    db.prepare(
      `UPDATE posts SET accepted_reply_id = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(replyId, postId);

    createNotification({
      userId: reply.author_id,
      type: 'accepted_solution',
      postId,
      replyId,
      actorId: req.user.id,
      message: 'Your reply was marked as the accepted solution',
    });

    res.json({
      ok: true,
      postId,
      acceptedReplyId: replyId,
    });
  },
);

app.get('/api/attachments/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const att = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });
  const filePath = path.join(UPLOAD_DIR, att.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing on disk' });
  }
  res.download(filePath, att.original_name);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Task Manager API listening on http://localhost:${PORT}`);
});
