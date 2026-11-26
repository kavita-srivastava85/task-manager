import db from './db.js';
import { hashPassword } from './auth.js';

/** Shared login password for first-boot seed only (override with DEFAULT_USER_PASSWORD). */
const sharedPassword = process.env.DEFAULT_USER_PASSWORD || 'Laptop@123';

/**
 * Seed known accounts only on an empty database.
 * A fresh SQLite file (Render's temporary disk) and a new Postgres database both qualify.
 * Does not recreate accounts the admin deleted, and does not overwrite passwords.
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

const userCount = (await db.prepare(`SELECT COUNT(*) AS c FROM users`).get()).c;
if (userCount > 0) {
  console.log('Accounts already present; skipping first-boot seed.');
} else {
  const passwordHash = hashPassword(sharedPassword);
  const insert = db.prepare(
    `INSERT INTO users (email, password_hash, role, display_name)
     VALUES (?, ?, ?, ?)`,
  );

  await db.transaction(async () => {
    for (const account of accounts) {
      const email = account.email.trim().toLowerCase();
      await insert.run(email, passwordHash, account.role, account.displayName);
    }
  })();

  console.log(
    `Seeded ${accounts.length} accounts on empty database (password from DEFAULT_USER_PASSWORD).`,
  );
}
