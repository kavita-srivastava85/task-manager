import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'task-manager.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (post_id IS NOT NULL AND reply_id IS NULL) OR
      (post_id IS NULL AND reply_id IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (post_id IS NOT NULL AND reply_id IS NULL) OR
      (post_id IS NULL AND reply_id IS NOT NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('mention', 'reply', 'accepted_solution')),
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies(post_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_post_id ON attachments(post_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_reply_id ON attachments(reply_id);
  CREATE INDEX IF NOT EXISTS idx_mentions_post_id ON mentions(post_id);
  CREATE INDEX IF NOT EXISTS idx_mentions_reply_id ON mentions(reply_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('thumbs_up', 'heart')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
      (post_id IS NOT NULL AND reply_id IS NULL) OR
      (post_id IS NULL AND reply_id IS NOT NULL)
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_post_unique
    ON reactions(user_id, post_id, kind) WHERE post_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_reply_unique
    ON reactions(user_id, reply_id, kind) WHERE reply_id IS NOT NULL;
`);

const postCols = db.prepare(`PRAGMA table_info(posts)`).all().map((c) => c.name);
if (!postCols.includes('accepted_reply_id')) {
  db.exec(
    `ALTER TABLE posts ADD COLUMN accepted_reply_id INTEGER REFERENCES replies(id)`,
  );
}
if (!postCols.includes('status')) {
  db.exec(
    `ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'open'`,
  );
}

const replyCols = db.prepare(`PRAGMA table_info(replies)`).all().map((c) => c.name);
if (!replyCols.includes('parent_reply_id')) {
  db.exec(
    `ALTER TABLE replies ADD COLUMN parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE`,
  );
}
if (!replyCols.includes('is_accepted')) {
  db.exec(`ALTER TABLE replies ADD COLUMN is_accepted INTEGER NOT NULL DEFAULT 0`);
  // Migrate legacy single accepted_reply_id into multi-accept flags
  try {
    db.exec(
      `UPDATE replies SET is_accepted = 1
       WHERE id IN (SELECT accepted_reply_id FROM posts WHERE accepted_reply_id IS NOT NULL)`,
    );
  } catch {
    // ignore
  }
}
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id)`,
);

const userCols = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (!userCols.includes('avatar_path')) {
  db.exec(`ALTER TABLE users ADD COLUMN avatar_path TEXT`);
}

export default db;
