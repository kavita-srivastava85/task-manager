import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import db from './db.js';
import './ensureAccounts.js';
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
  notifyMentions,
  mapNotification,
} from './notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
const uploadSetting = process.env.UPLOAD_DIR || 'uploads';
const UPLOAD_DIR = path.isAbsolute(uploadSetting)
  ? uploadSetting
  : process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR, uploadSetting)
    : path.resolve(__dirname, '..', uploadSetting);

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
// Express 4 does not catch rejected promises from async handlers.
for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (route, ...handlers) =>
    original(
      route,
      ...handlers.map((handler) => {
        if (typeof handler !== 'function' || handler.length >= 4) return handler;
        return (req, res, next) => {
          const result = handler(req, res, next);
          if (result && typeof result.then === 'function') result.catch(next);
        };
      }),
    );
}
const corsOrigin =
  CLIENT_ORIGIN === '*'
    ? true
    : CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

async function listUsersForMentions() {
  return await db
    .prepare('SELECT id, email, display_name FROM users ORDER BY email')
    .all();
}

async function attachmentsFor(postId = null, replyId = null) {
  if (postId != null) {
    return await db
      .prepare(
        `SELECT id, original_name AS originalName, mime_type AS mimeType,
                size, stored_name AS storedName, created_at AS createdAt
         FROM attachments WHERE post_id = ?`,
      )
      .all(postId);
  }
  return await db
    .prepare(
      `SELECT id, original_name AS originalName, mime_type AS mimeType,
              size, stored_name AS storedName, created_at AS createdAt
       FROM attachments WHERE reply_id = ?`,
    )
    .all(replyId);
}

async function mentionsFor(postId = null, replyId = null) {
  const rows =
    postId != null
      ? await db
          .prepare(
            `SELECT m.id, u.id AS userId, u.email, u.display_name AS displayName,
                    u.avatar_path AS avatarPath
             FROM mentions m JOIN users u ON u.id = m.mentioned_user_id
             WHERE m.post_id = ?`,
          )
          .all(postId)
      : await db
          .prepare(
            `SELECT m.id, u.id AS userId, u.email, u.display_name AS displayName,
                    u.avatar_path AS avatarPath
             FROM mentions m JOIN users u ON u.id = m.mentioned_user_id
             WHERE m.reply_id = ?`,
          )
          .all(replyId);
  return rows.map((m) => ({
    id: m.userId,
    userId: m.userId,
    email: m.email,
    displayName: m.displayName,
    avatarUrl: m.avatarPath ? `/api/users/${m.userId}/avatar` : null,
  }));
}

async function saveMentions({ postId = null, replyId = null, body }) {
  const users = await listUsersForMentions();
  const mentioned = parseMentions(body, users);
  const insert = db.prepare(
    `INSERT INTO mentions (post_id, reply_id, mentioned_user_id)
     VALUES (?, ?, ?)`,
  );
  for (const user of mentioned) {
    await insert.run(postId, replyId, user.id);
  }
  return mentioned.map((u) => ({
    userId: u.id,
    email: u.email,
    displayName: u.display_name,
  }));
}

async function saveAttachments({ postId = null, replyId = null, files = [] }) {
  const insert = db.prepare(
    `INSERT INTO attachments
      (post_id, reply_id, stored_name, original_name, mime_type, size, content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const saved = [];
  for (const file of files) {
    const info = await insert.run(
      postId,
      replyId,
      file.filename,
      file.originalname,
      file.mimetype,
      file.size,
      fs.readFileSync(file.path),
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

async function reactionsFor(postId = null, replyId = null, viewerId = null) {
  const rows =
    postId != null
      ? await db
          .prepare(
            `SELECT kind, COUNT(*) AS count,
                    SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mine
             FROM reactions WHERE post_id = ? AND kind = 'heart'
             GROUP BY kind`,
          )
          .all(viewerId ?? -1, postId)
      : await db
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

function mapAuthor(row) {
  const id = row.author_id ?? row.id;
  const avatarPath = row.author_avatar_path ?? row.avatar_path;
  return {
    id,
    email: row.author_email ?? row.email,
    displayName: row.author_display_name ?? row.display_name,
    role: row.author_role ?? row.role,
    avatarUrl: avatarPath ? `/api/users/${id}/avatar` : null,
  };
}

async function mapReply(r, _acceptedReplyId, viewerId) {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    parentReplyId: r.parent_reply_id ?? null,
    isAccepted: Number(r.is_accepted || 0) === 1,
    author: mapAuthor(r),
    attachments: await attachmentsFor(null, r.id),
    mentions: await mentionsFor(null, r.id),
    reactions: await reactionsFor(null, r.id, viewerId),
  };
}

async function mapPost(row, viewerId = null) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status || 'open',
    acceptedReplyId: row.accepted_reply_id ?? null,
    author: mapAuthor(row),
    replyCount: row.reply_count ?? 0,
    attachments: await attachmentsFor(row.id, null),
    mentions: await mentionsFor(row.id, null),
    reactions: await reactionsFor(row.id, null, viewerId),
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'discussions-app', storage: db.driver });
});

app.get('/api/auth/status', async (_req, res) => {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
    .get();
  res.json({
    hasAdmin: Number(row?.count || 0) > 0,
    needsAdminSignup: Number(row?.count || 0) === 0,
  });
});

/** First-time admin creates their own login ID (sign up). */
app.post('/api/auth/admin/signup', async (req, res) => {
  const existingAdmins = await db
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
    const result = await db
      .prepare(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES (?, ?, 'admin', ?)`,
      )
      .run(email, hashPassword(password), displayName);
    const user = await db
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

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || '');
  const expectedRole = String(req.body?.role || '').trim().toLowerCase();

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const user = await db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(404).json({ error: 'No account found with that email' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await db.prepare(
    `UPDATE password_resets SET used_at = datetime('now')
     WHERE user_id = ? AND used_at IS NULL`,
  ).run(user.id);

  await db.prepare(
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

app.post('/api/auth/reset-password', async (req, res) => {
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

  const row = await db
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

  const update = db.transaction(async () => {
    await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
      hashPassword(password),
      row.user_id,
    );
    await db.prepare(
      `UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`,
    ).run(row.id);
  });
  await update();

  res.json({
    ok: true,
    role: row.role,
    email: row.email,
  });
});

app.get('/api/notifications', authRequired, async (req, res) => {
  const rows = await db
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
  const unreadCount = await db
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

app.post('/api/notifications/:id/read', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const row = await db
    .prepare(`SELECT * FROM notifications WHERE id = ? AND user_id = ?`)
    .get(id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  await db.prepare(
    `UPDATE notifications SET read_at = datetime('now')
     WHERE id = ? AND read_at IS NULL`,
  ).run(id);
  const updated = await db
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

app.post('/api/notifications/read-all', authRequired, async (req, res) => {
  await db.prepare(
    `UPDATE notifications SET read_at = datetime('now')
     WHERE user_id = ? AND read_at IS NULL`,
  ).run(req.user.id);
  res.json({ ok: true });
});

app.get('/api/admin/employees', authRequired, adminRequired, async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT id, email, role, display_name, created_at, avatar_path
       FROM users ORDER BY role DESC, email ASC`,
    )
    .all();
  res.json({ employees: rows.map(publicUser) });
});

app.post('/api/admin/employees', authRequired, adminRequired, async (req, res) => {
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
    const result = await db
      .prepare(
        `INSERT INTO users (email, password_hash, role, display_name)
         VALUES (?, ?, 'employee', ?)`,
      )
      .run(email, hashPassword(password), displayName);
    const user = await db
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

async function deleteEmployeeById(employeeId) {
  const user = await db
    .prepare('SELECT id, role FROM users WHERE id = ?')
    .get(employeeId);
  if (!user) return { error: 'Account not found', status: 404 };
  if (user.role !== 'employee') {
    return { error: 'Only employee accounts can be deleted', status: 400 };
  }

  await db.transaction(async () => {
    // Clear reply acceptance links before cascading deletes.
    await db.prepare(
      `UPDATE posts SET accepted_reply_id = NULL
       WHERE accepted_reply_id IN (SELECT id FROM replies WHERE author_id = ?)`,
    ).run(employeeId);
    await db.prepare(
      `UPDATE posts SET accepted_reply_id = NULL WHERE author_id = ?`,
    ).run(employeeId);
    await db.prepare('DELETE FROM users WHERE id = ?').run(employeeId);
  })();

  return { ok: true };
}

app.delete(
  '/api/admin/employees/:id',
  authRequired,
  adminRequired,
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid account id' });
    }
    const result = await deleteEmployeeById(id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ ok: true, deletedId: id });
  },
);

app.delete('/api/admin/employees', authRequired, adminRequired, async (_req, res) => {
  const employees = await db
    .prepare(`SELECT id FROM users WHERE role = 'employee'`)
    .all();
  const deletedIds = [];
  await db.transaction(async () => {
    for (const row of employees) {
      const result = await deleteEmployeeById(row.id);
      if (!result.error) deletedIds.push(row.id);
    }
  })();
  res.json({ ok: true, deletedCount: deletedIds.length, deletedIds });
});

app.get('/api/users', authRequired, async (_req, res) => {
  const users = await db
    .prepare(
      `SELECT id, email, role, display_name, created_at, avatar_path FROM users ORDER BY email`,
    )
    .all();
  res.json({ users: users.map(publicUser) });
});

app.get('/api/posts', authRequired, async (req, res) => {
  const q = String(req.query?.q || '')
    .trim()
    .toLowerCase();
  const mine = String(req.query?.mine || '') === '1';
  const uid = req.user.id;

  let rows = await db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              u.avatar_path AS author_avatar_path,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p
       JOIN users u ON u.id = p.author_id
       ORDER BY p.updated_at DESC, p.created_at DESC`,
    )
    .all();

  if (mine || q) {
    const filtered = [];
    for (const row of rows) {
      const isAuthor = Number(row.author_id) === Number(uid);
      const participated =
        isAuthor ||
        Boolean(
          await db
            .prepare(
              `SELECT 1 AS ok FROM replies WHERE post_id = ? AND author_id = ? LIMIT 1`,
            )
            .get(row.id, uid),
        );
      if ((mine || q) && !participated) continue;
      if (!q) {
        filtered.push(row);
        continue;
      }
      const hay = `${row.title || ''} ${row.body || ''} ${row.author_display_name || ''}`.toLowerCase();
      if (hay.includes(q)) filtered.push(row);
    }
    rows = filtered;
  }

  res.json({ posts: await Promise.all(rows.map(async (row) => await mapPost(row, req.user.id))) });
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

app.post('/api/posts', authRequired, upload.array('files', 5), async (req, res) => {
  const body = String(req.body?.body || '').trim();
  if (!body) {
    return res.status(400).json({ error: 'Message required' });
  }
  const topic = String(req.body?.title || req.body?.topic || '')
    .trim()
    .slice(0, 120);
  const title = topic || titleFromBody(body);

  const create = db.transaction(async () => {
    const result = await db
      .prepare(`INSERT INTO posts (author_id, title, body) VALUES (?, ?, ?)`)
      .run(req.user.id, title, body);
    const postId = result.lastInsertRowid;
    const mentioned = await saveMentions({ postId, body });
    await saveAttachments({ postId, files: req.files || [] });
    await notifyMentions({
      mentionedUsers: mentioned,
      postId,
      actorId: req.user.id,
    });
    return postId;
  });

  const postId = await create();
  const row = await db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              u.avatar_path AS author_avatar_path,
              0 AS reply_count
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(postId);
  res.status(201).json({ post: await mapPost(row, req.user.id) });
});

app.get('/api/posts/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const row = await db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              u.avatar_path AS author_avatar_path,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'Post not found' });

  const replies = await Promise.all((await db
    .prepare(
      `SELECT r.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              u.avatar_path AS author_avatar_path
       FROM replies r
       JOIN users u ON u.id = r.author_id
       WHERE r.post_id = ?
       ORDER BY r.created_at ASC`,
    )
    .all(id))
    .map(async (r) => await mapReply(r, row.accepted_reply_id, req.user.id)));

  res.json({ post: await mapPost(row, req.user.id), replies });
});

async function loadPostRow(id) {
  return await db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              u.avatar_path AS author_avatar_path,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p JOIN users u ON u.id = p.author_id
       WHERE p.id = ?`,
    )
    .get(id);
}

function canCloseOrReopen(reqUser, post) {
  return (
    reqUser.role === 'admin' || Number(reqUser.id) === Number(post.author_id)
  );
}

app.post('/api/posts/:id/close', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canCloseOrReopen(req.user, post)) {
    return res.status(403).json({
      error: 'Only the starter or an admin can close this discussion',
    });
  }
  await db.prepare(
    `UPDATE posts SET status = 'closed', updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  res.json({ post: await mapPost(await loadPostRow(id), req.user.id) });
});

app.post('/api/posts/:id/reopen', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!canCloseOrReopen(req.user, post)) {
    return res.status(403).json({
      error: 'Only the starter or an admin can reopen this discussion',
    });
  }
  await db.prepare(
    `UPDATE posts SET status = 'open', updated_at = datetime('now') WHERE id = ?`,
  ).run(id);
  res.json({ post: await mapPost(await loadPostRow(id), req.user.id) });
});

function canModifyContent(reqUser, authorId) {
  // Author or admin can edit/delete messages
  return (
    reqUser.role === 'admin' || Number(reqUser.id) === Number(authorId)
  );
}

function parseRemoveAttachmentIds(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((n) => Number.isFinite(n));
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) {
      return parsed.map(Number).filter((n) => Number.isFinite(n));
    }
  } catch {
    // comma-separated fallback
  }
  return String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

async function removeAttachmentsByIds(ids, { postId = null, replyId = null }) {
  for (const attId of ids) {
    const att = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(attId);
    if (!att) continue;
    if (postId != null && Number(att.post_id) !== Number(postId)) continue;
    if (replyId != null && Number(att.reply_id) !== Number(replyId)) continue;
    const filePath = path.join(UPLOAD_DIR, att.stored_name);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore disk cleanup errors
    }
    await db.prepare('DELETE FROM attachments WHERE id = ?').run(attId);
  }
}

app.patch(
  '/api/posts/:id',
  authRequired,
  upload.array('files', 5),
  async (req, res) => {
    const id = Number(req.params.id);
    const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!canModifyContent(req.user, post.author_id)) {
      return res.status(403).json({ error: 'Not allowed to edit this message' });
    }
    if ((post.status || 'open') === 'closed') {
      return res.status(400).json({ error: 'This discussion is closed' });
    }
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message required' });
    const topic = String(req.body?.title || req.body?.topic || '').trim();
    const title = topic || titleFromBody(body);
    const removeIds = parseRemoveAttachmentIds(req.body?.removeAttachmentIds);

    await db.transaction(async () => {
      await db.prepare(
        `UPDATE posts SET body = ?, title = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(body, title, id);
      await db.prepare(`DELETE FROM mentions WHERE post_id = ?`).run(id);
      await saveMentions({ postId: id, body });
      await removeAttachmentsByIds(removeIds, { postId: id });
      await saveAttachments({ postId: id, files: req.files || [] });
    })();

    res.json({ post: await mapPost(await loadPostRow(id), req.user.id) });
  },
);

app.delete('/api/posts/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const post = await db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  // Author can delete their own discussion; admin can delete any
  if (!canModifyContent(req.user, post.author_id)) {
    return res
      .status(403)
      .json({ error: 'Not allowed to delete this discussion' });
  }
  const atts = await db
    .prepare(`SELECT stored_name FROM attachments WHERE post_id = ?`)
    .all(id);
  const replyAtts = await db
    .prepare(
      `SELECT a.stored_name FROM attachments a
       JOIN replies r ON r.id = a.reply_id
       WHERE r.post_id = ?`,
    )
    .all(id);
  for (const att of [...atts, ...replyAtts]) {
    const filePath = path.join(UPLOAD_DIR, att.stored_name);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
  await db.prepare(`DELETE FROM posts WHERE id = ?`).run(id);
  res.json({ ok: true });
});

app.patch(
  '/api/posts/:postId/replies/:replyId',
  authRequired,
  upload.array('files', 5),
  async (req, res) => {
    const postId = Number(req.params.postId);
    const replyId = Number(req.params.replyId);
    const post = await db
      .prepare('SELECT id, status FROM posts WHERE id = ?')
      .get(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if ((post.status || 'open') === 'closed') {
      return res.status(400).json({ error: 'This discussion is closed' });
    }
    const reply = await db.prepare('SELECT * FROM replies WHERE id = ?').get(replyId);
    if (!reply || Number(reply.post_id) !== postId) {
      return res.status(404).json({ error: 'Reply not found' });
    }
    if (!canModifyContent(req.user, reply.author_id)) {
      return res.status(403).json({ error: 'Not allowed to edit this message' });
    }
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Message required' });
    const removeIds = parseRemoveAttachmentIds(req.body?.removeAttachmentIds);

    await db.transaction(async () => {
      await db.prepare(`UPDATE replies SET body = ? WHERE id = ?`).run(body, replyId);
      await db.prepare(`DELETE FROM mentions WHERE reply_id = ?`).run(replyId);
      await saveMentions({ replyId, body });
      await removeAttachmentsByIds(removeIds, { replyId });
      await saveAttachments({ replyId, files: req.files || [] });
      await db.prepare(
        `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
      ).run(postId);
    })();

    const r = await db
      .prepare(
        `SELECT r.*,
                u.email AS author_email,
                u.display_name AS author_display_name,
                u.role AS author_role,
                u.avatar_path AS author_avatar_path
         FROM replies r
         JOIN users u ON u.id = r.author_id
         WHERE r.id = ?`,
      )
      .get(replyId);
    const accepted = (await db
      .prepare('SELECT accepted_reply_id FROM posts WHERE id = ?')
      .get(postId))?.accepted_reply_id;
    res.json({ reply: await mapReply(r, accepted, req.user.id) });
  },
);

app.delete('/api/posts/:postId/replies/:replyId', authRequired, async (req, res) => {
  const postId = Number(req.params.postId);
  const replyId = Number(req.params.replyId);
  const reply = await db.prepare('SELECT * FROM replies WHERE id = ?').get(replyId);
  if (!reply || Number(reply.post_id) !== postId) {
    return res.status(404).json({ error: 'Reply not found' });
  }
  if (!canModifyContent(req.user, reply.author_id)) {
    return res.status(403).json({ error: 'Not allowed to delete this message' });
  }
  await db.transaction(async () => {
    await db.prepare(
      `UPDATE posts SET accepted_reply_id = NULL WHERE id = ? AND accepted_reply_id = ?`,
    ).run(postId, replyId);
    await db.prepare(`DELETE FROM replies WHERE id = ?`).run(replyId);
    await db.prepare(
      `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
    ).run(postId);
  })();
  res.json({ ok: true });
});

app.post('/api/reactions', authRequired, async (req, res) => {
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
    const post = await db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const existing = await db
      .prepare(
        `SELECT id FROM reactions WHERE user_id = ? AND post_id = ? AND kind = ?`,
      )
      .get(req.user.id, postId, kind);
    if (existing) {
      await db.prepare(`DELETE FROM reactions WHERE id = ?`).run(existing.id);
    } else {
      await db.prepare(
        `INSERT INTO reactions (user_id, post_id, kind) VALUES (?, ?, ?)`,
      ).run(req.user.id, postId, kind);
    }
    return res.json({ reactions: await reactionsFor(postId, null, req.user.id) });
  }

  const reply = await db.prepare('SELECT id FROM replies WHERE id = ?').get(replyId);
  if (!reply) return res.status(404).json({ error: 'Reply not found' });
  const existing = await db
    .prepare(
      `SELECT id FROM reactions WHERE user_id = ? AND reply_id = ? AND kind = ?`,
    )
    .get(req.user.id, replyId, kind);
  if (existing) {
    await db.prepare(`DELETE FROM reactions WHERE id = ?`).run(existing.id);
  } else {
    await db.prepare(
      `INSERT INTO reactions (user_id, reply_id, kind) VALUES (?, ?, ?)`,
    ).run(req.user.id, replyId, kind);
  }
  res.json({ reactions: await reactionsFor(null, replyId, req.user.id) });
});

app.post(
  '/api/posts/:id/replies',
  authRequired,
  upload.array('files', 5),
  async (req, res) => {
    const postId = Number(req.params.id);
    const post = await db
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
      const parent = await db
        .prepare('SELECT id, post_id FROM replies WHERE id = ?')
        .get(parentReplyId);
      if (!parent || Number(parent.post_id) !== postId) {
        return res.status(400).json({ error: 'Invalid parent reply' });
      }
    } else {
      parentReplyId = null;
    }

    const create = db.transaction(async () => {
      const result = await db
        .prepare(
          `INSERT INTO replies (post_id, author_id, body, parent_reply_id)
           VALUES (?, ?, ?, ?)`,
        )
        .run(postId, req.user.id, body, parentReplyId);
      const replyId = result.lastInsertRowid;
      await db.prepare(
        `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
      ).run(postId);
      const mentioned = await saveMentions({ replyId, body });
      await saveAttachments({ replyId, files: req.files || [] });
      await notifyMentions({
        mentionedUsers: mentioned,
        postId,
        replyId,
        actorId: req.user.id,
      });
      return replyId;
    });

    const replyId = await create();
    const r = await db
      .prepare(
        `SELECT r.*,
                u.email AS author_email,
                u.display_name AS author_display_name,
                u.role AS author_role,
                u.avatar_path AS author_avatar_path
         FROM replies r
         JOIN users u ON u.id = r.author_id
         WHERE r.id = ?`,
      )
      .get(replyId);

    res.status(201).json({
      reply: await mapReply(r, null, req.user.id),
    });
  },
);

app.post(
  '/api/posts/:postId/replies/:replyId/accept',
  authRequired,
  async (req, res) => {
    const postId = Number(req.params.postId);
    const replyId = Number(req.params.replyId);
    const post = await db
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

    const reply = await db
      .prepare(
        'SELECT id, author_id, post_id, is_accepted FROM replies WHERE id = ?',
      )
      .get(replyId);
    if (!reply || reply.post_id !== postId) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    const nextAccepted = Number(reply.is_accepted || 0) === 1 ? 0 : 1;
    await db.transaction(async () => {
      await db.prepare(`UPDATE replies SET is_accepted = ? WHERE id = ?`).run(
        nextAccepted,
        replyId,
      );
      // Keep legacy column pointing at latest accepted reply (nullable if none)
      if (nextAccepted === 1) {
        await db.prepare(
          `UPDATE posts SET accepted_reply_id = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(replyId, postId);
      } else if (Number(post.accepted_reply_id) === Number(replyId)) {
        const other = await db
          .prepare(
            `SELECT id FROM replies WHERE post_id = ? AND is_accepted = 1 ORDER BY id DESC LIMIT 1`,
          )
          .get(postId);
        await db.prepare(
          `UPDATE posts SET accepted_reply_id = ?, updated_at = datetime('now') WHERE id = ?`,
        ).run(other?.id ?? null, postId);
      } else {
        await db.prepare(
          `UPDATE posts SET updated_at = datetime('now') WHERE id = ?`,
        ).run(postId);
      }
    })();

    if (nextAccepted === 1) {
      await createNotification({
        userId: reply.author_id,
        type: 'accepted_solution',
        postId,
        replyId,
        actorId: req.user.id,
        message: 'Accepted',
      });
    }

    res.json({
      ok: true,
      postId,
      replyId,
      isAccepted: nextAccepted === 1,
    });
  },
);

const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `user-${req.user.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    cb(null, true);
  },
});

app.get('/api/users/:id/profile', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const row = await db
    .prepare(
      `SELECT id, email, role, display_name, created_at, avatar_path
       FROM users WHERE id = ?`,
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'User not found' });
  const startedCount = (await db
    .prepare(`SELECT COUNT(*) AS c FROM posts WHERE author_id = ?`)
    .get(id)).c;
  const replyCount = (await db
    .prepare(`SELECT COUNT(*) AS c FROM replies WHERE author_id = ?`)
    .get(id)).c;
  res.json({
    user: publicUser(row),
    isSelf: Number(req.user.id) === Number(id),
    stats: {
      startedCount: Number(startedCount || 0),
      replyCount: Number(replyCount || 0),
    },
  });
});

app.get('/api/users/:id/avatar', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const row = await db
    .prepare(`SELECT avatar_path, avatar_data FROM users WHERE id = ?`)
    .get(id);
  if (!row?.avatar_path && !row?.avatar_data) {
    return res.status(404).json({ error: 'No photo' });
  }
  const filePath = row?.avatar_path
    ? path.isAbsolute(row.avatar_path)
      ? row.avatar_path
      : path.join(AVATAR_DIR, path.basename(row.avatar_path))
    : null;
  if (filePath && fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  if (row?.avatar_data) {
    const ext = path.extname(row.avatar_path || '') || '.jpg';
    res.type(ext);
    return res.send(row.avatar_data);
  }
  return res.status(404).json({ error: 'Photo missing' });
});

app.post(
  '/api/account/avatar',
  authRequired,
  avatarUpload.single('avatar'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Photo required' });
    }
    const prev = await db
      .prepare(`SELECT avatar_path FROM users WHERE id = ?`)
      .get(req.user.id);
    await db.prepare(
      `UPDATE users SET avatar_path = ?, avatar_data = ? WHERE id = ?`,
    ).run(req.file.filename, fs.readFileSync(req.file.path), req.user.id);
    if (prev?.avatar_path) {
      const oldPath = path.join(AVATAR_DIR, path.basename(prev.avatar_path));
      try {
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch {
        // ignore
      }
    }
    const user = await db
      .prepare(
        `SELECT id, email, role, display_name, created_at, avatar_path
         FROM users WHERE id = ?`,
      )
      .get(req.user.id);
    res.json({ user: publicUser(user) });
  },
);

app.get('/api/attachments/:id', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const att = await db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });
  const filePath = path.join(UPLOAD_DIR, att.stored_name);
  if (!fs.existsSync(filePath)) {
    if (!att.content) {
      return res.status(404).json({ error: 'File missing on disk' });
    }
    const inlineMissing = String(req.query?.inline || '') === '1';
    if (att.mime_type) res.type(att.mime_type);
    res.setHeader(
      'Content-Disposition',
      `${inlineMissing ? 'inline' : 'attachment'}; filename="${String(att.original_name).replace(/"/g, '')}"`,
    );
    return res.send(att.content);
  }
  const inline = String(req.query?.inline || '') === '1';
  if (inline) {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${att.original_name.replace(/"/g, '')}"`,
    );
    if (att.mime_type) res.type(att.mime_type);
    return res.sendFile(filePath);
  }
  res.download(filePath, att.original_name);
});

app.get('/api/account', authRequired, async (req, res) => {
  const uid = req.user.id;
  const started = await Promise.all((await db
    .prepare(
      `SELECT p.*,
              u.email AS author_email,
              u.display_name AS author_display_name,
              u.role AS author_role,
              u.avatar_path AS author_avatar_path,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
       FROM posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.author_id = ?
       ORDER BY p.updated_at DESC`,
    )
    .all(uid))
    .map(async (row) => await mapPost(row, uid)));

  const repliedIds = (await db
    .prepare(
      `SELECT DISTINCT post_id FROM replies WHERE author_id = ? ORDER BY post_id DESC`,
    )
    .all(uid))
    .map((r) => r.post_id);

  const participated = [];
  for (const postId of repliedIds) {
    const row = await loadPostRow(postId);
    if (!row) continue;
    if (Number(row.author_id) === Number(uid)) continue;
    participated.push(await mapPost(row, uid));
  }

  res.json({
    user: publicUser(
      await db
        .prepare(
          'SELECT id, email, role, display_name, created_at FROM users WHERE id = ?',
        )
        .get(uid),
    ),
    started,
    participated,
    stats: {
      startedCount: started.length,
      repliedCount: repliedIds.length,
      participatedCount: participated.length,
    },
  });
});

app.post('/api/account/password', authRequired, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: 'Current and new password required' });
  }
  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: 'Password must be at least 6 characters' });
  }
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
    hashPassword(newPassword),
    req.user.id,
  );
  res.json({ ok: true });
});

app.patch(
  '/api/admin/employees/:id/role',
  authRequired,
  adminRequired,
  async (req, res) => {
    const id = Number(req.params.id);
    const role = String(req.body?.role || '').trim().toLowerCase();
    if (!['admin', 'employee'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or employee' });
    }
    const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) return res.status(404).json({ error: 'Account not found' });
    if (Number(target.id) === Number(req.user.id) && role !== 'admin') {
      return res
        .status(400)
        .json({ error: 'You cannot remove your own admin access' });
    }
    if (target.role === 'admin' && role === 'employee') {
      const adminCount = (await db
        .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`)
        .get()).c;
      if (Number(adminCount) <= 1) {
        return res
          .status(400)
          .json({ error: 'At least one admin must remain' });
      }
    }
    await db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
    const user = await db
      .prepare(
        'SELECT id, email, role, display_name, created_at FROM users WHERE id = ?',
      )
      .get(id);
    res.json({ employee: publicUser(user) });
  },
);

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
  console.log(`Discussions App API listening on http://localhost:${PORT}`);
  console.log(`Database storage: ${db.driver}`);
});
