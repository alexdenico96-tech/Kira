import dotenv from "dotenv";
dotenv.config();

function getGroqKeys() {
  const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  return [...new Set(raw.split(",").map(k => k.trim()).filter(Boolean))];
}
let groqKeyIndex = 0;
const DEFAULT_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

function getGroqModels() {
  const configured = (process.env.GROQ_MODELS || process.env.GROQ_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([...configured, ...DEFAULT_MODELS])];
}

export const GROQ_ENABLED = getGroqKeys().length > 0;

async function requestGroq({ apiKey, model, messages, maxTokens = 4096, jsonMode = false }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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

  const keys = getGroqKeys();
  const start = groqKeyIndex++ % keys.length;
  let lastError;
  for (const model of getGroqModels()) {
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[(start + i) % keys.length];
      try {
        return await requestGroq({ ...request, model, apiKey });
      } catch (err) {
        lastError = err;
        console.error(`[groq] modelo ${model}, chave ${((start+i)%keys.length)+1}/${keys.length} falhou:`, err.status || err.message);
        if (![401,403,429,500,502,503,504].includes(err.status)) break;
      }
    }
  }
  throw lastError || new Error("Nenhum modelo/chave Groq disponível.");
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
  const artifactInstruction = `${systemInstruction}\n\nVocê está no modo de criação de Artifact. Responda SOMENTE com um objeto JSON válido, sem markdown e sem texto antes/depois, no formato: {"projectName":"nome-do-projeto","files":[{"path":"index.html","content":"conteúdo completo","language":"html"}]}. Inclua TODOS os arquivos necessários pedidos pelo usuário. Cada arquivo deve ter path e content completos. Não diga que criou arquivos se files estiver vazio.
Para qualquer site HTML/CSS/JavaScript, gere no mínimo index.html, style.css e script.js separados. index.html DEVE conter <link rel="stylesheet" href="style.css"> e <script src="script.js" defer></script>. Entregue implementação completa, coerente e apresentável, nunca uma página mínima ou placeholder.`;

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


export async function callGroqArtifactUpdateFallback({ systemInstruction, message }) {
  const instruction = `${systemInstruction}

Você está editando um Artifact existente. Responda SOMENTE JSON válido:
{"changes":[{"action":"create|update|delete","path":"arquivo.ext","content":"conteúdo completo quando create/update","language":"..."}],"summary":"resumo curto"}.
Retorne SOMENTE operações necessárias. Não repita arquivos intactos. Use delete sem content.`;

  const raw = await tryModels({
    messages: [{ role: "system", content: instruction }, { role: "user", content: message }],
    maxTokens: 8192,
    jsonMode: true
  });
  let parsed;
  try { parsed = JSON.parse(raw); } catch {
    const err = new Error("Groq retornou atualização de Artifact inválida.");
    err.code = "invalid_artifact_update_json";
    throw err;
  }
  const changes = Array.isArray(parsed?.changes) ? parsed.changes
    .filter(x => x?.path && ["create","update","delete"].includes(x.action) && (x.action==="delete" || typeof x.content==="string"))
    .map(x => ({action:x.action,path:String(x.path).trim(),...(x.action!=="delete"?{content:x.content,language:typeof x.language==="string"?x.language:""}:{})})) : [];
  if (!changes.length) throw new Error("Groq não devolveu operações válidas.");
  return { changes, summary: String(parsed.summary || "Alteração no projeto").slice(0, 240) };
}
