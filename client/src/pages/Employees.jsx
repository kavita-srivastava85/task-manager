import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { formatWhen } from '../components';
import PasswordField from '../PasswordField';
import { rememberLogin } from '../rememberedLogins';
import { IconPlus, IconUsers } from '../icons';

export default function Employees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createdCred, setCreatedCred] = useState(null);
  const [copied, setCopied] = useState(false);
  const isAdmin = user?.role === 'admin';

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
      const { employees: next } = await api.listEmployees();
      setEmployees(next);
    } catch (err) {
      setError(err.message);
      setCreatedCred(null);
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
          Employees
        </h1>
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
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
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
        <h2 className="section-title">
          <span className="title-icon users">
            <IconUsers size={18} />
          </span>
          Accounts
        </h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading &&
          employees.filter((e) => e.role === 'employee').length === 0 && (
            <p className="muted">No employees yet.</p>
          )}
        <ul className="employee-list">
          {employees
            .filter((emp) => emp.role === 'employee')
            .map((emp) => (
              <li key={emp.id}>
                <strong>{emp.displayName}</strong>
                <span className="muted">
                  {' '}
                  · {emp.email} · {formatWhen(emp.createdAt)}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
