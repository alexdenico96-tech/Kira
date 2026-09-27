import dotenv from "dotenv";
dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DEFAULT_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

function getGroqModels() {
  const configured = (process.env.GROQ_MODELS || process.env.GROQ_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_MODELS])];
}

export const GROQ_ENABLED = Boolean(GROQ_API_KEY);

async function requestGroq({ model, messages, maxTokens = 4096, jsonMode = false }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    })
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Groq (${model}) falhou: ${body}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function tryModels(request) {
  if (!GROQ_ENABLED) {
    const err = new Error("Groq não configurada.");
    err.code = "not_configured";
    throw err;
  }

  let lastError;
  for (const model of getGroqModels()) {
    try {
      return await requestGroq({ ...request, model });
    } catch (err) {
      lastError = err;
      console.error(`[groq] modelo ${model} falhou:`, err.message);
    }
  }
  throw lastError || new Error("Nenhum modelo Groq disponível.");
}

export async function callGroqFallback({ systemInstruction, message }) {
  const content = await tryModels({
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: message }
    ],
    maxTokens: 4096
  });
  return content || "Não consegui gerar uma resposta agora.";
}

export async function callGroqArtifactFallback({ systemInstruction, message }) {
  const artifactInstruction = `${systemInstruction}\n\nVocê está no modo de criação de Artifact. Responda SOMENTE com um objeto JSON válido, sem markdown e sem texto antes/depois, no formato: {"projectName":"nome-do-projeto","files":[{"path":"index.html","content":"conteúdo completo","language":"html"}]}. Inclua TODOS os arquivos necessários pedidos pelo usuário. Cada arquivo deve ter path e content completos. Não diga que criou arquivos se files estiver vazio.`;

  const raw = await tryModels({
    messages: [
      { role: "system", content: artifactInstruction },
      { role: "user", content: message }
    ],
    maxTokens: 8192,
    jsonMode: true
  });

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error("Groq retornou um Artifact em formato inválido.");
    err.code = "invalid_artifact_json";
    throw err;
  }

  const files = Array.isArray(parsed?.files)
    ? parsed.files
        .filter((file) => file && typeof file.path === "string" && file.path.trim() && typeof file.content === "string" && file.content.length > 0)
        .map((file) => ({ path: file.path.trim(), content: file.content, language: typeof file.language === "string" ? file.language : "" }))
    : [];

  if (files.length === 0) {
    const err = new Error("Groq não devolveu arquivos válidos para o Artifact.");
    err.code = "empty_artifact";
    throw err;
  }

  return { projectName: String(parsed.projectName || "projeto").trim() || "projeto", files };
}
