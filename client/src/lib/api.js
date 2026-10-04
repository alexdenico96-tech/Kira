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

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const register = (username, email, password, legal = {}) =>
  request("/auth/register", { method: "POST", body: { username, email, password, ...legal } });

export const login = (username, password) =>
  request("/auth/login", { method: "POST", body: { username, password } });

export const forgotPassword = (email) =>
  request("/auth/forgot-password", { method: "POST", body: { email } });

export const resetPassword = (token, newPassword) =>
  request("/auth/reset-password", { method: "POST", body: { token, newPassword } });

export const getMe = (token) => request("/me", { token });

export const listConversations = (token) => request("/conversations", { token });

export const getConversation = (token, id) => request(`/conversations/${id}`, { token });

export const deleteConversation = (token, id) => request(`/conversations/${id}`, { method: "DELETE", token });

export const deleteAllConversations = (token) => request("/conversations", { method: "DELETE", token });

export const sendMessage = (token, message, conversationId, { image, audio, artifactId } = {}) =>
  request("/chat", { method: "POST", token, body: { message, conversationId, image, audio, artifactId } });

export const getArtifact = (token, artifactId, version) =>
  request(`/artifacts/${artifactId}${version ? `?version=${version}` : ""}`, { token });

export const listArtifactVersions = (token, artifactId) =>
  request(`/artifacts/${artifactId}/versions`, { token });

export const restoreArtifactVersion = (token, artifactId, version) =>
  request(`/artifacts/${artifactId}/restore`, { method: "POST", token, body: { version } });

export const getUsage = (token) => request("/usage", { token });

export const sendFeedback = (token, message) => request("/feedback", { method: "POST", token, body: { message } });

export const listProjects = (token) => request("/projects", { token });
export const generateProjectReadme = (token, id) => request(`/projects/${id}/readme`, { token });
export const getVersionChanges = (token, id, version) => request(`/projects/${id}/changes/${version}`, { token });
export const importProjectZip = (token, name, zipBase64) => request("/projects/import-zip", { method:"POST", token, body:{name,zipBase64} });
export const exportProjectGithub = (token,id,owner,repo,branch="main") => request(`/projects/${id}/github-export`, {method:"POST",token,body:{owner,repo,branch}});
export const importProjectGithub = (token,owner,repo,branch="main") => request("/projects/github-import", {method:"POST",token,body:{owner,repo,branch}});
export const saveArtifactFile = (token,id,path,content) => request(`/artifacts/${id}/manual-save`, {method:"POST",token,body:{path,content}});
export const getProviderStatus = (token) => request("/ai/providers", {token});
