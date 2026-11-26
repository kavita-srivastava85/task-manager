import 'dotenv/config';
import db from './db.js';
import { hashPassword } from './auth.js';

const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'admin123';

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  process.exit(1);
}

const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.log(`Admin already exists: ${email}`);
  process.exit(0);
}

const displayName = email.split('@')[0] || 'admin';
const result = await db
  .prepare(
    `INSERT INTO users (email, password_hash, role, display_name)
     VALUES (?, ?, 'admin', ?)`,
  )
  .run(email, hashPassword(password), displayName);

console.log(`Seeded admin user id=${result.lastInsertRowid} email=${email}`);
