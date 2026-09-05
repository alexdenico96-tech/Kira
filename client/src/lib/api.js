const BASE = "/api";
const TOKEN_KEY = "kira_token";
const USER_KEY = "kira_user";

export function getStoredSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

export function storeSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na requisição.");
  return data;
}

export const register = (username, email, password) =>
  request("/auth/register", { method: "POST", body: { username, email, password } });

export const login = (username, password) =>
  request("/auth/login", { method: "POST", body: { username, password } });

export const forgotPassword = (email) => request("/auth/forgot-password", { method: "POST", body: { email } });

export const resetPassword = (token, newPassword) =>
  request("/auth/reset-password", { method: "POST", body: { token, newPassword } });

export const resendVerification = (token) => request("/auth/resend-verification", { method: "POST", token });

export const getMe = (token) => request("/me", { token });

export const listConversations = (token) => request("/conversations", { token });

export const getConversation = (token, id) => request(`/conversations/${id}`, { token });

export const deleteConversation = (token, id) => request(`/conversations/${id}`, { method: "DELETE", token });

export const deleteAllConversations = (token) => request("/conversations", { method: "DELETE", token });

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const sendMessage = (token, message, conversationId, { image, audio } = {}) =>
  request("/chat", { method: "POST", token, body: { message, conversationId, image, audio } });

export const getUsage = (token) => request("/usage", { token });

export const sendFeedback = (token, message) => request("/feedback", { method: "POST", token, body: { message } });
