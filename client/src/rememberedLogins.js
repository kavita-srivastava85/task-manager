const KEY = 'tm_remembered_logins';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
}

/** Save a successful login so email/name suggest next time. */
export function rememberLogin({ email, displayName, role }) {
  const cleanEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!cleanEmail) return;

  const next = readAll().filter(
    (item) => item.email.toLowerCase() !== cleanEmail || item.role !== role,
  );
  next.unshift({
    email: cleanEmail,
    displayName: displayName || cleanEmail.split('@')[0],
    role: role || 'employee',
    lastUsedAt: Date.now(),
  });
  writeAll(next);
}

export function getRememberedLogins(role) {
  const all = readAll();
  if (!role) return all;
  return all.filter((item) => item.role === role);
}

export function getLastRemembered(role) {
  const list = getRememberedLogins(role);
  return list[0] || null;
}

export function forgetRememberedLogin(email, role = 'employee') {
  const cleanEmail = String(email || '')
    .trim()
    .toLowerCase();
  if (!cleanEmail) return;
  const next = readAll().filter(
    (item) =>
      !(item.email.toLowerCase() === cleanEmail && item.role === role),
  );
  writeAll(next);
}
