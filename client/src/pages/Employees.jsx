import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatWhen } from '../components';
import PasswordField from '../PasswordField';
import {
  forgetRememberedLogin,
  rememberLogin,
} from '../rememberedLogins';
import { IconPlus, IconTrash, IconUsers } from '../icons';

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createdCred, setCreatedCred] = useState(null);
  const [copied, setCopied] = useState(false);
  const isAdmin = user?.role === 'admin';

  const employeeAccounts = employees.filter((e) => e.role === 'employee');
  const adminAccounts = employees.filter((e) => e.role === 'admin');

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { employees: next } = await api.listEmployees();
        if (!cancelled) setEmployees(next);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/discussions" replace />;

  async function refreshEmployees() {
    const { employees: next } = await api.listEmployees();
    setEmployees(next);
  }

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setCopied(false);
    setBusy(true);
    const payload = {
      email: email.trim(),
      password,
      displayName: displayName.trim() || undefined,
    };
    try {
      const { employee } = await api.createEmployee(payload);
      rememberLogin({
        email: employee.email,
        displayName: employee.displayName,
        role: 'employee',
      });
      setCreatedCred({
        displayName: employee.displayName,
        email: employee.email,
        password: payload.password,
      });
      setEmail('');
      setPassword('');
      setDisplayName('');
      await refreshEmployees();
    } catch (err) {
      setError(err.message);
      setCreatedCred(null);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteOne(emp) {
    const ok = window.confirm(
      `Delete account for ${emp.displayName} (${emp.email})?\n\nYou can create it again afterward with a new password.`,
    );
    if (!ok) return;
    setError('');
    setDeletingId(emp.id);
    try {
      await api.deleteEmployee(emp.id);
      forgetRememberedLogin(emp.email, 'employee');
      if (createdCred?.email === emp.email) setCreatedCred(null);
      await refreshEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function onDeleteAll() {
    if (employeeAccounts.length === 0) return;
    const ok = window.confirm(
      `Delete all ${employeeAccounts.length} employee accounts?\n\nYour admin login stays. You can create new employee accounts after this.`,
    );
    if (!ok) return;
    setError('');
    setBusy(true);
    try {
      await api.deleteAllEmployees();
      for (const emp of employeeAccounts) {
        forgetRememberedLogin(emp.email, 'employee');
      }
      setCreatedCred(null);
      await refreshEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onToggleRole(emp) {
    const nextRole = emp.role === 'admin' ? 'employee' : 'admin';
    const label =
      nextRole === 'admin'
        ? `Make ${emp.displayName} an admin?`
        : `Remove admin access from ${emp.displayName}?`;
    if (!window.confirm(label)) return;
    setError('');
    setBusy(true);
    try {
      await api.setEmployeeRole(emp.id, nextRole);
      await refreshEmployees();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyCredentials() {
    if (!createdCred) return;
    const text = `Discussions App login\nEmail: ${createdCred.email}\nPassword: ${createdCred.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="page">
      <section className="intro">
        <h1 className="page-title">
          <span className="title-icon users">
            <IconUsers size={22} />
          </span>
          Team
        </h1>
        <p className="muted">
          Create logins, promote or remove admins, and delete accounts so you
          can recreate them with a new password.
        </p>
      </section>

      <section className="composer">
        <h2 className="section-title">
          <span className="title-icon plus">
            <IconPlus size={18} />
          </span>
          Create login
        </h2>
        <form onSubmit={onCreate} className="stack">
          <label>
            Name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <PasswordField
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="off"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy || deletingId != null}>
            {busy ? 'Working…' : 'Create'}
          </button>
        </form>
      </section>

      {createdCred && (
        <section className="share-panel">
          <h2>{createdCred.displayName}</h2>
          <dl className="cred-grid">
            <div>
              <dt>Email</dt>
              <dd>{createdCred.email}</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>
                <code>{createdCred.password}</code>
              </dd>
            </div>
          </dl>
          <div className="share-actions">
            <button type="button" onClick={copyCredentials}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="accounts-header">
          <h2 className="section-title">
            <span className="title-icon users">
              <IconUsers size={18} />
            </span>
            Accounts
          </h2>
          {employeeAccounts.length > 0 && (
            <button
              type="button"
              className="btn-danger-outline"
              disabled={busy || deletingId != null}
              onClick={onDeleteAll}
            >
              <IconTrash size={14} /> Delete all employees
            </button>
          )}
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && employees.length === 0 && (
          <p className="muted">No accounts yet.</p>
        )}
        <ul className="employee-list">
          {[...adminAccounts, ...employeeAccounts].map((emp) => {
            const isSelf = Number(emp.id) === Number(user?.id);
            return (
              <li key={emp.id} className="employee-row">
                <div className="employee-meta">
                  <strong>{emp.displayName}</strong>
                  <span className="muted">
                    {' '}
                    · {emp.email}
                    {emp.role === 'admin' ? ' · Admin' : ''} ·{' '}
                    {formatWhen(emp.createdAt)}
                  </span>
                </div>
                <div className="employee-actions">
                  {!isSelf && (
                    <button
                      type="button"
                      className="btn-role-outline compact"
                      disabled={busy || deletingId != null}
                      onClick={() => onToggleRole(emp)}
                    >
                      {emp.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </button>
                  )}
                  {emp.role === 'employee' && (
                    <button
                      type="button"
                      className="btn-danger-outline compact"
                      disabled={busy || deletingId != null}
                      onClick={() => onDeleteOne(emp)}
                    >
                      <IconTrash size={14} />
                      {deletingId === emp.id ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
