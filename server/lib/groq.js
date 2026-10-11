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
      temperature: jsonMode ? 0.1 : 0.5,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    }),
    signal: AbortSignal.timeout(Math.max(3000, Number(process.env.KIRA_GROQ_TIMEOUT_MS || (jsonMode && maxTokens >= 8192 ? 30000 : 18000))))
  });

  if (!res.ok) {
    const body = await res.text();
    let code = "unknown";
    try { code = JSON.parse(body)?.error?.code || code; } catch {}
    // Avoid logging failed_generation, which can contain the entire generated project.
    const err = new Error(`Groq (${model}) HTTP ${res.status} code=${code}`);
    err.code = code;
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content?.trim() || "";
  if (jsonMode && maxTokens >= 8192) {
    console.info(`[kira-groq-artifact] finish=${choice?.finish_reason || "unknown"} chars=${content.length} tokens=${data.usage?.completion_tokens ?? "unknown"}`);
  }
  return content;
}

async function tryModels(request, onSelectedModel, preferredModel, onlyPreferred = false) {
  if (!GROQ_ENABLED) {
    const err = new Error("Groq não configurada.");
    err.code = "not_configured";
    throw err;
  }

  const keys = getGroqKeys();
  const start = groqKeyIndex++ % keys.length;
  let lastError;
  const models = getGroqModels().filter(m => !/llama-3\.3-70b-versatile/i.test(m)); // KIRA_ARTIFACT_REPAIR_V1: evita modelo aposentado
  for (const model of onlyPreferred && preferredModel ? [preferredModel] : preferredModel ? [...new Set([preferredModel,...models])] : models) {
    let invalidModel = false;
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[(start + i) % keys.length];
      try {
        const result = await requestGroq({ ...request, model, apiKey });
        if (typeof onSelectedModel === "function") onSelectedModel(model);
        return result;
      } catch (err) {
        lastError = err;
        console.error(`[groq] modelo ${model}, chave ${((start+i)%keys.length)+1}/${keys.length} falhou:`, err.status || err.message);
        // 404 indica modelo/rota inválido: não testar o mesmo modelo com outras chaves.
        if (err.status === 404) { invalidModel = true; break; }
        if (![401,403,429,500,502,503,504].includes(err.status)) break;
      }
    }
    if (invalidModel) console.warn(`[groq] modelo ${model} retornou 404; avançando ao próximo modelo sem repetir nas outras chaves.`);
  }
  throw lastError || new Error("Nenhum modelo/chave Groq disponível.");
}

export async function callGroqFallback({ systemInstruction, message, onSelectedModel, preferredModel }) {
  const content = await tryModels({
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: message }
    ],
    maxTokens: 4096
  }, onSelectedModel, preferredModel);
  return content || "Não consegui gerar uma resposta agora.";
}

export async function callGroqArtifactFallback({ systemInstruction, message, preferredModel, onSelectedModel }) {
  const artifactInstruction = `${systemInstruction}\n\nVocê está no modo de criação de Artifact. Responda SOMENTE com um objeto JSON válido, sem markdown e sem texto antes/depois, no formato: {"projectName":"nome-do-projeto","files":[{"path":"index.html","content":"conteúdo completo","language":"html"}]}. Inclua TODOS os arquivos necessários pedidos pelo usuário. Cada arquivo deve ter path e content completos. Não diga que criou arquivos se files estiver vazio.
Para qualquer site HTML/CSS/JavaScript puro (NÃO APIs Node/Express ou backends), gere no mínimo index.html, style.css e script.js separados. index.html DEVE conter <link rel="stylesheet" href="style.css"> e <script src="script.js" defer></script>. Entregue implementação completa, coerente e apresentável, nunca uma página mínima ou placeholder.`;

  const raw = await tryModels({
    messages: [
      { role: "system", content: artifactInstruction },
      { role: "user", content: message }
    ],
    maxTokens: 8192,
    jsonMode: true
  }, onSelectedModel, preferredModel);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error("Groq retornou um Artifact em formato inválido.");
    err.code = "invalid_artifact_json";
    throw err;
  }

  // Aceita envelopes JSON comuns sem inventar arquivos.
  const fileList = Array.isArray(parsed?.files) ? parsed.files
    : Array.isArray(parsed?.artifact?.files) ? parsed.artifact.files
    : Array.isArray(parsed?.project?.files) ? parsed.project.files
    : Array.isArray(parsed?.document?.files) ? parsed.document.files
    : null;
  const files = Array.isArray(fileList)
    ? fileList
        .filter((file) => file && typeof file.path === "string" && file.path.trim() && typeof file.content === "string" && file.content.length > 0)
        .map((file) => ({ path: file.path.trim(), content: file.content, language: typeof file.language === "string" ? file.language : "" }))
    : [];

  if (files.length === 0) {
    const shape = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed).slice(0, 8).join(",") : typeof parsed;
    console.warn(`[kira-groq-artifact] empty_files json_keys=${shape} raw_chars=${raw.length}`);
    const err = new Error("Groq não devolveu arquivos válidos para o Artifact.");
    err.code = "empty_artifact";
    throw err;
  }

  return { projectName: String(parsed.projectName || "projeto").trim() || "projeto", files };
}


// KIRA_TARGETED_PACKAGE_REPAIR_V1
// Limita o contexto e a saída: nunca solicita regeneração do projeto inteiro.
export async function callGroqPackageJsonRepair({originalContent,projectRequest,onSelectedModel}){
  const content=String(originalContent||'');
  // Limite de tamanho evita exceder TPM com arquivos indevidamente gigantes.
  const maxInput=2800;
  const prompt='Corrija SOMENTE este package.json para que seja JSON válido. Preserve scripts, dependências e a stack Node/Express solicitada. Responda somente um objeto JSON com a chave packageJson contendo o OBJETO do package.json (não uma string). Não inclua código de outros arquivos.\nPedido resumido: '+String(projectRequest||'').slice(0,600)+'\nConteúdo original (pode estar malformado):\n'+content.slice(0,maxInput);
  const raw=await tryModels({
    messages:[{role:'system',content:'Você corrige arquivos package.json. Retorne JSON válido no formato {"packageJson":{"name":"app","version":"1.0.0","scripts":{"start":"node src/server.js"},"dependencies":{}}}. Preserve as dependências presentes e não invente arquivos.'},{role:'user',content:prompt}],
    maxTokens:1100,
    jsonMode:true
  },onSelectedModel,'openai/gpt-oss-120b',true);
  let response;
  try{response=JSON.parse(raw);}catch{const e=new Error('Reparo retornou JSON inválido');e.code='invalid_repair_json';throw e;}
  const pkg=response?.packageJson;
  if(!pkg||typeof pkg!=='object'||Array.isArray(pkg)||!pkg.scripts||typeof pkg.scripts!=='object'||!Object.keys(pkg.scripts).length){
    const e=new Error('Reparo sem scripts válidos');e.code='invalid_package_structure';throw e;
  }
  const fixed=JSON.stringify(pkg,null,2)+'\n';
  JSON.parse(fixed);
  return fixed;
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
