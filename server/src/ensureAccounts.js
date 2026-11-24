import db from './db.js';
import { hashPassword } from './auth.js';

/** Shared login password for seeded accounts (override with DEFAULT_USER_PASSWORD). */
const sharedPassword = process.env.DEFAULT_USER_PASSWORD || 'Laptop@123';

/**
 * Ensure admin + known employees exist with the shared password.
 * Runs on every boot so Render rebuilds (fresh SQLite) stay usable.
 */
const accounts = [
  {
    email: 'kavi.urpal@gmail.com',
    displayName: 'Kavita',
    role: 'admin',
  },
  {
    email: 'kavita.srivastava85@gmail.com',
    displayName: 'Swara Srivastava',
    role: 'employee',
  },
  {
    email: 'anshu@gmail.com',
    displayName: 'Anshu Srivastava',
    role: 'employee',
  },
  {
    email: 'admin@invoquesttechnologies.com',
    displayName: 'Durgesh Srivastava',
    role: 'employee',
  },
  {
    email: 'rutuja_patil@invoquesttechnologies.com',
    displayName: 'Rutuja Patil',
    role: 'employee',
  },
  {
    email: 'aarushi_goel@invoquesttechnologies.com',
    displayName: 'Aarushi Goel',
    role: 'employee',
  },
  {
    email: 'ankit_agrawal@invoquesttechnologies.com',
    displayName: 'Ankit Agrawal',
    role: 'employee',
  },
];

const passwordHash = hashPassword(sharedPassword);

const insert = db.prepare(
  `INSERT INTO users (email, password_hash, role, display_name)
   VALUES (?, ?, ?, ?)`,
);
const update = db.prepare(
  `UPDATE users SET password_hash = ?, role = ?, display_name = ? WHERE email = ?`,
);

const sync = db.transaction(() => {
  for (const account of accounts) {
    const email = account.email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      update.run(passwordHash, account.role, account.displayName, email);
    } else {
      insert.run(email, passwordHash, account.role, account.displayName);
    }
  }
});

sync();
console.log(
  `Ensured ${accounts.length} accounts with shared password (DEFAULT_USER_PASSWORD).`,
);
