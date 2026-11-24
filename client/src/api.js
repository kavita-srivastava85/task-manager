const TOKEN_KEY = 'tm_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = options.body instanceof FormData;
  if (!isForm && options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || 'Unexpected response' };
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  adminSignup: (payload) =>
    request('/api/auth/admin/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (email, password, options = {}) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        role: options.role || undefined,
      }),
    }),
  me: () => request('/api/auth/me'),
  forgotPassword: (email) =>
    request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (payload) =>
    request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listEmployees: () => request('/api/admin/employees'),
  createEmployee: (payload) =>
    request('/api/admin/employees', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteEmployee: (id) =>
    request(`/api/admin/employees/${id}`, { method: 'DELETE' }),
  deleteAllEmployees: () =>
    request('/api/admin/employees', { method: 'DELETE' }),
  listUsers: () => request('/api/users'),
  listPosts: () => request('/api/posts'),
  getPost: (id) => request(`/api/posts/${id}`),
  createPost: (formData) =>
    request('/api/posts', { method: 'POST', body: formData }),
  createReply: (postId, formData) =>
    request(`/api/posts/${postId}/replies`, {
      method: 'POST',
      body: formData,
    }),
  acceptReply: (postId, replyId) =>
    request(`/api/posts/${postId}/replies/${replyId}/accept`, {
      method: 'POST',
    }),
  closePost: (postId) =>
    request(`/api/posts/${postId}/close`, { method: 'POST' }),
  updatePost: (postId, body) =>
    request(`/api/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deletePost: (postId) =>
    request(`/api/posts/${postId}`, { method: 'DELETE' }),
  updateReply: (postId, replyId, body) =>
    request(`/api/posts/${postId}/replies/${replyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deleteReply: (postId, replyId) =>
    request(`/api/posts/${postId}/replies/${replyId}`, {
      method: 'DELETE',
    }),
  toggleReaction: (payload) =>
    request('/api/reactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listNotifications: () => request('/api/notifications'),
  markNotificationRead: (id) =>
    request(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request('/api/notifications/read-all', { method: 'POST' }),
  attachmentUrl: (id) => `/api/attachments/${id}`,
};
