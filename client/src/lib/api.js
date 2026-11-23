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

export const sendMessage = (token, message, conversationId, { image, images, audio, artifactId } = {}) =>
  request("/chat", { method: "POST", token, body: { message, conversationId, image, images, audio, artifactId } });

// KIRA_PROGRESS_STREAM_V1: recebe as fases em tempo real (NDJSON) e devolve a resposta final.
// Se o servidor responder JSON comum (versão antiga), funciona igual ao sendMessage.
export async function sendMessageStream(token, message, conversationId, { image, images, audio, artifactId } = {}, onProgress) {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ message, conversationId, image, images, audio, artifactId })
  });
  const type = res.headers.get("content-type") || "";
  if (!type.includes("ndjson") || !res.body) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erro na requisição.");
    return data;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  const handle = line => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === "progress") onProgress?.(event);
    else if (event.type === "result") result = event;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  }
  handle(buffer);
  if (!result) throw new Error("A conexão caiu antes da resposta. Tente novamente.");
  if (result.status >= 400) throw new Error(result.body?.error || "Erro na requisição.");
  return result.body;
}

// KIRA_FILES_V1: baixa um arquivo gerado (precisa do token, por isso não é um link direto).
export async function downloadFile(token, id) {
  const res = await fetch(`${BASE}/files/${encodeURIComponent(id)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Não consegui baixar o arquivo.");
  }
  return res.blob();
}

// KIRA_MEMORY_V1: o que a Kira lembra do usuário.
async function memoryRequest(token, path = "", options = {}) {
  const res = await fetch(`${BASE}/memory${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erro na requisição.");
  return data;
}
export const getMemory = token => memoryRequest(token);
export const setMemoryEnabled = (token, enabled) => memoryRequest(token, "", { method: "PUT", body: JSON.stringify({ enabled }) });
export const deleteMemory = (token, id) => memoryRequest(token, `/${encodeURIComponent(id)}`, { method: "DELETE" });
export const clearMemory = token => memoryRequest(token, "", { method: "DELETE" });

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
