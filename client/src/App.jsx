import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Shell } from './components';
import Welcome from './pages/Welcome';
import AdminHome from './pages/AdminHome';
import AdminSignup from './pages/AdminSignup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Feed from './pages/Feed';
import Thread from './pages/Thread';
import Employees from './pages/Employees';
function Protected({ children, adminOnly = false }) {
  const { user, loading, logout } = useAuth();
  if (loading) {
    return (
      <div className="auth-page compact">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/discussions" replace />;
  }
  return (
    <Shell user={user} onLogout={logout}>
      {children}
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/admin/signup" element={<AdminSignup />} />
          <Route path="/admin/login" element={<Login mode="admin" />} />
          <Route path="/employee/login" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login mode="any" />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/discussions"
            element={
              <Protected>
                <Feed />
              </Protected>
            }
          />
          <Route path="/chat" element={<Navigate to="/discussions" replace />} />
          <Route
            path="/posts/:id"
            element={
              <Protected>
                <Thread />
              </Protected>
            }
          />
          <Route path="/account" element={<Navigate to="/discussions" replace />} />
          <Route
            path="/admin/employees"
            element={
              <Protected adminOnly>
                <Employees />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
