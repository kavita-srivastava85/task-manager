import db from './db.js';
import { hashPassword } from './auth.js';

const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'admin123';

if (email && password) {
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!existing) {
    const displayName = email.split('@')[0] || 'admin';
    await db.prepare(
      `INSERT INTO users (email, password_hash, role, display_name)
       VALUES (?, ?, 'admin', ?)`,
    ).run(email, hashPassword(password), displayName);
    console.log(`Seeded admin: ${email}`);
  }
}
