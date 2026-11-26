import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { fileURLToPath } from 'url';
import pg from 'pg';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = (process.env.DATABASE_URL || '').trim();
const usePg = /^postgres(ql)?:\/\//i.test(databaseUrl);
const als = new AsyncLocalStorage();

let chain = Promise.resolve();
let sqlite = null;
let pool = null;

if (usePg) {
  // COUNT(*) and SUM() come back as int8. Parse them as numbers.
  pg.types.setTypeParser(20, (val) => (val == null ? null : Number(val)));
  pg.types.setTypeParser(1700, (val) => (val == null ? null : Number(val)));
  const config = { connectionString: databaseUrl, max: 3 };
  if (/sslmode=require/i.test(databaseUrl) || /\.render\.com/i.test(databaseUrl)) {
    config.ssl = { rejectUnauthorized: false };
  }
  pool = new pg.Pool(config);
} else {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'task-manager.db');
  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  console.log(`SQLite database file: ${dbPath}`);
  if (process.env.RENDER && !process.env.DATA_DIR) {
    console.warn(
      'This Render service is storing discussions in a local SQLite file. That file is deleted on every redeploy and whenever a free instance sleeps. Set DATABASE_URL to a Postgres Internal Database URL to keep the data.',
    );
  }
}

function enqueue(task) {
  if (als.getStore()) return task();
  const run = chain.then(() => als.run({ depth: 0, client: null }, task));
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function toPostgres(sql) {
  const withTime = sql.replace(/datetime\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
  let n = 0;
  let result = '';
  for (let i = 0; i < withTime.length; i += 1) {
    const c = withTime[i];
    if (c === "'") {
      let j = i + 1;
      while (j < withTime.length) {
        if (withTime[j] === "'" && withTime[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (withTime[j] === "'") {
          j += 1;
          break;
        }
        j += 1;
      }
      result += withTime.slice(i, j);
      i = j - 1;
      continue;
    }
    if (c === '?') {
      n += 1;
      result += `$${n}`;
      continue;
    }
    result += c;
  }
  return result;
}

function normalize(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, inner] of Object.entries(value)) out[key] = normalize(inner);
    return out;
  }
  return value;
}

function wrapError(err) {
  if (!err) return err;
  if (err.code === '23505' && !String(err.message).includes('UNIQUE')) {
    const wrapped = new Error(
      `UNIQUE constraint failed: ${err.detail || err.message}`,
    );
    wrapped.code = err.code;
    return wrapped;
  }
  return err;
}

async function execRaw(sql) {
  if (!usePg) {
    sqlite.exec(sql);
    return;
  }
  const ctx = als.getStore();
  const runner = ctx?.client || pool;
  await runner.query(sql);
}

async function query(sql, params) {
  try {
    if (!usePg) {
      return sqlite.prepare(sql);
    }
    const ctx = als.getStore();
    const runner = ctx?.client || pool;
    return await runner.query(toPostgres(sql), params);
  } catch (err) {
    throw wrapError(err);
  }
}

function prepare(sql) {
  return {
    get: (...params) =>
      enqueue(async () => {
        if (!usePg) return sqlite.prepare(sql).get(...params);
        const res = await query(sql, params);
        return normalize(res.rows[0]);
      }),
    all: (...params) =>
      enqueue(async () => {
        if (!usePg) return sqlite.prepare(sql).all(...params);
        const res = await query(sql, params);
        return normalize(res.rows);
      }),
    run: (...params) =>
      enqueue(async () => {
        if (!usePg) {
          try {
            const info = sqlite.prepare(sql).run(...params);
            const id = info.lastInsertRowid;
            return {
              lastInsertRowid: typeof id === 'bigint' ? Number(id) : id,
              changes: info.changes,
            };
          } catch (err) {
            throw wrapError(err);
          }
        }
        let text = toPostgres(sql);
        if (/^\s*insert\b/i.test(text) && !/\breturning\b/i.test(text)) {
          text += ' RETURNING id';
        }
        const ctx = als.getStore();
        const runner = ctx?.client || pool;
        try {
          const res = await runner.query(text, params);
          const id = res.rows[0]?.id;
          return {
            lastInsertRowid: id == null ? 0 : Number(id),
            changes: res.rowCount ?? 0,
          };
        } catch (err) {
          throw wrapError(err);
        }
      }),
  };
}

function transaction(fn) {
  return () => enqueue(() => runBody(fn));
}

async function runBody(fn) {
  const ctx = als.getStore();
  ctx.depth += 1;
  const depth = ctx.depth;
  if (usePg && !ctx.client) ctx.client = await pool.connect();
  const begin = depth === 1 ? 'BEGIN' : `SAVEPOINT sp_${depth}`;
  const commit = depth === 1 ? 'COMMIT' : `RELEASE SAVEPOINT sp_${depth}`;
  const rollback = depth === 1 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT sp_${depth}`;
  try {
    await execRaw(begin);
    const result = await fn();
    await execRaw(commit);
    return result;
  } catch (err) {
    try {
      await execRaw(rollback);
    } catch {
      // The original error is the one that matters.
    }
    throw err;
  } finally {
    ctx.depth -= 1;
    if (ctx.depth === 0 && ctx.client) {
      ctx.client.release();
      ctx.client = null;
    }
  }
}

async function execScript(statements) {
  for (const statement of statements) {
    const sql = statement.trim();
    if (!sql) continue;
    if (usePg) await pool.query(sql);
    else sqlite.exec(sql);
  }
}

const sqliteSchema = `
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
`;

const postgresSchema = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    avatar_path TEXT,
    avatar_data BYTEA
  )`,
  `CREATE TABLE IF NOT EXISTS posts (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'open',
    accepted_reply_id INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS replies (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    is_accepted INTEGER NOT NULL DEFAULT 0
  )`,
  `DO $$ BEGIN
     ALTER TABLE posts
       ADD CONSTRAINT posts_accepted_reply_id_fkey
       FOREIGN KEY (accepted_reply_id) REFERENCES replies(id);
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content BYTEA,
    CHECK (
      (post_id IS NOT NULL AND reply_id IS NULL) OR
      (post_id IS NULL AND reply_id IS NOT NULL)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS mentions (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    mentioned_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (post_id IS NOT NULL AND reply_id IS NULL) OR
      (post_id IS NULL AND reply_id IS NOT NULL)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('mention', 'reply', 'accepted_solution')),
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_post_id ON attachments(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_reply_id ON attachments(reply_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mentions_post_id ON mentions(post_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mentions_reply_id ON mentions(reply_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)`,
  `CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('thumbs_up', 'heart')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (post_id IS NOT NULL AND reply_id IS NULL) OR
      (post_id IS NULL AND reply_id IS NOT NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_post_unique
     ON reactions(user_id, post_id, kind) WHERE post_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_reply_unique
     ON reactions(user_id, reply_id, kind) WHERE reply_id IS NOT NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data BYTEA`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS accepted_reply_id INTEGER`,
  `ALTER TABLE replies ADD COLUMN IF NOT EXISTS parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE`,
  `ALTER TABLE replies ADD COLUMN IF NOT EXISTS is_accepted INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE attachments ADD COLUMN IF NOT EXISTS content BYTEA`,
];

async function migrateSqlite() {
  sqlite.exec(sqliteSchema);
  const postCols = sqlite.prepare(`PRAGMA table_info(posts)`).all().map((c) => c.name);
  if (!postCols.includes('accepted_reply_id')) {
    sqlite.exec(
      `ALTER TABLE posts ADD COLUMN accepted_reply_id INTEGER REFERENCES replies(id)`,
    );
  }
  if (!postCols.includes('status')) {
    sqlite.exec(`ALTER TABLE posts ADD COLUMN status TEXT NOT NULL DEFAULT 'open'`);
  }

  const replyCols = sqlite.prepare(`PRAGMA table_info(replies)`).all().map((c) => c.name);
  if (!replyCols.includes('parent_reply_id')) {
    sqlite.exec(
      `ALTER TABLE replies ADD COLUMN parent_reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE`,
    );
  }
  if (!replyCols.includes('is_accepted')) {
    sqlite.exec(`ALTER TABLE replies ADD COLUMN is_accepted INTEGER NOT NULL DEFAULT 0`);
    try {
      sqlite.exec(
        `UPDATE replies SET is_accepted = 1
         WHERE id IN (SELECT accepted_reply_id FROM posts WHERE accepted_reply_id IS NOT NULL)`,
      );
    } catch {
      // ignore
    }
  }
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id)`);

  const userCols = sqlite.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
  if (!userCols.includes('avatar_path')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN avatar_path TEXT`);
  }
  if (!userCols.includes('avatar_data')) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN avatar_data BLOB`);
  }
  const attachmentCols = sqlite
    .prepare(`PRAGMA table_info(attachments)`)
    .all()
    .map((c) => c.name);
  if (!attachmentCols.includes('content')) {
    sqlite.exec(`ALTER TABLE attachments ADD COLUMN content BLOB`);
  }
}

async function init() {
  if (usePg) {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await pool.query('SELECT 1');
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.error(
          `Postgres connection attempt ${attempt} failed: ${err.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    if (lastError) {
      console.error(
        'Could not connect using DATABASE_URL. On Render, use the Internal Database URL of a Postgres database in the same region as this web service.',
      );
      throw lastError;
    }
    await execScript(postgresSchema);
    let host = 'postgres';
    try {
      const parsed = new URL(databaseUrl);
      host = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${parsed.pathname.replace(/^\//, '')}`;
    } catch {
      // Keep the generic label. Never print the connection string.
    }
    console.log(`Postgres database: ${host}`);
    return;
  }
  await migrateSqlite();
}

await init();

const db = {
  prepare,
  transaction,
  driver: usePg ? 'postgres' : 'sqlite',
};

export default db;
