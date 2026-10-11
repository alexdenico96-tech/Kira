// KIRA_GEMINI_DISCOVERY_V1
import dotenv from "dotenv";
dotenv.config();

function getApiKeys() {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi && multi.trim()) return multi.split(",").map((k) => k.trim()).filter(Boolean);
  return process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [];
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL;
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
export const HOME_ASSISTANT_ENABLED = Boolean(HOME_ASSISTANT_URL && HOME_ASSISTANT_TOKEN);

const IMAGE_TOOL = {
  name: "generate_image",
  description: "Gera uma imagem a partir de uma descrição em texto. Use quando o usuário pedir para criar/desenhar/ilustrar algo. Produza um prompt fiel ao pedido, com composição e objetos coerentes. Para fotografia, descreva realismo fotográfico, iluminação natural, anatomia correta, materiais, perspectiva e detalhes plausíveis; para outros estilos respeite o estilo solicitado.",
  parameters: {
    type: "OBJECT",
    properties: { prompt: { type: "STRING", description: "Descrição detalhada da imagem, de preferência em inglês." } },
    required: ["prompt"]
  }
};

const DOCUMENT_TOOL = {
  name: "create_document",
  description:
    "Cria um artifact completo de projeto. Para apps/frameworks, gere a arquitetura real: package.json, configuração, entrypoints, src/, componentes, páginas, estilos e demais arquivos necessários. Todos os imports/exports/caminhos/dependências devem ser coerentes. Nunca reduza React/Vite/Next/TypeScript a HTML simples. Nunca entregue stubs/TODOs no lugar de funcionalidades solicitadas. Devolva TODOS os arquivos no mesmo artifact.",
  parameters: {
    type: "OBJECT",
    properties: {
      projectName: { type: "STRING", description: "Nome curto do projeto/artifact, ex: landing-page" },
      files: {
        type: "ARRAY",
        description: "Todos os arquivos do artifact. Caminhos podem incluir subpastas, ex: src/App.jsx.",
        items: {
          type: "OBJECT",
          properties: {
            path: { type: "STRING", description: "Caminho relativo completo do arquivo dentro do projeto." },
            content: { type: "STRING", description: "Conteúdo completo do arquivo." },
            language: { type: "STRING", description: "Linguagem/formato para exibição, ex: html, css, javascript, jsx, json, markdown." }
          },
          required: ["path", "content"]
        }
      },
    },
    required: ["projectName", "files"]
  }
};


const UPDATE_ARTIFACT_TOOL = {
  name: "update_artifact",
  description: "Edita projeto existente usando operações mínimas. Nunca repita arquivos intactos.",
  parameters: {
    type: "OBJECT",
    properties: {
      changes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            action: { type: "STRING", enum: ["create","update","delete"] },
            path: { type: "STRING" },
            content: { type: "STRING" },
            language: { type: "STRING" }
          },
          required: ["action","path"]
        }
      },
      summary: { type: "STRING" }
    },
    required: ["changes","summary"]
  }
};

const HOME_ASSISTANT_TOOL = {
  name: "control_device",
  description: "Controla um dispositivo do Home Assistant (ligar/desligar/executar).",
  parameters: {
    type: "OBJECT",
    properties: {
      domain: { type: "STRING" },
      service: { type: "STRING" },
      entity_id: { type: "STRING" }
    },
    required: ["domain", "service", "entity_id"]
  }
};

function buildTools() {
  const functionDeclarations = [IMAGE_TOOL, DOCUMENT_TOOL, UPDATE_ARTIFACT_TOOL];
  if (HOME_ASSISTANT_ENABLED) functionDeclarations.push(HOME_ASSISTANT_TOOL);
  return [{ functionDeclarations }];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGemini({ systemInstruction, contents, apiKey, forceFunctionName, model }) {
  const hasAudio = contents.some(c => c.parts?.some(p => p.inlineData?.mimeType?.startsWith("audio/")));
  const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    signal: AbortSignal.timeout(Math.max(3000, Number(process.env.KIRA_GEMINI_TIMEOUT_MS || (forceFunctionName ? 45000 : hasAudio ? 30000 : 18000)))),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: buildTools(),
      ...(forceFunctionName ? {
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: [forceFunctionName] }
        }
      } : {}),
      generationConfig: {
        temperature: forceFunctionName ? 0.25 : 0.65,
        maxOutputTokens: forceFunctionName ? 16384 : 8192
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    let code = null;
    try {
      code = JSON.parse(text)?.error?.status;
    } catch {
      /* não era JSON */
    }
    const error = new Error(text);
    error.status = res.status;
    error.code = code;
    throw error;
  }

  return res.json();
}

let keyIndex = 0;
let overloadUntil = 0;
const discoveryCache = new Map();
const invalidModels = new Map();
const DISCOVERY_TTL_MS = 30 * 60 * 1000;
const INVALID_TTL_MS = 30 * 60 * 1000;

function normalizedModel(model) {
  return String(model || "").replace(/^models\//, "").trim();
}

async function discoverGeminiModels(apiKey) {
  const cached = discoveryCache.get(apiKey);
  if (cached && cached.expires > Date.now()) return cached.models;
  const models = [];
  let pageToken = "";
  for (let page = 0; page < 3; page++) {
    const url = new URL(`${GEMINI_BASE}/models`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!response.ok) {
      const error = new Error(`models.list retornou HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    for (const entry of data.models || []) {
      const methods = entry.supportedGenerationMethods || [];
      const model = normalizedModel(entry.name);
      if (methods.includes("generateContent") && model && !/embedding|imagen|veo|tts|audio|live/i.test(model)) models.push(model);
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  const unique = [...new Set(models)];
  discoveryCache.set(apiKey, { models: unique, expires: Date.now() + DISCOVERY_TTL_MS });
  console.info(`[kira-gemini] discovery count=${unique.length}`);
  return unique;
}

function chooseAlternatives(models, failedModel) {
  const configured = (process.env.KIRA_GEMINI_FALLBACK_MODELS || "")
    .split(",").map(normalizedModel).filter(Boolean);
  const available = new Set(models);
  const preferred = [...configured, ...models.filter(m => /flash/i.test(m) && !/lite|preview|exp/i.test(m)), ...models];
  return [...new Set(preferred)].filter(m => m !== failedModel && available.has(m) && (invalidModels.get(m) || 0) < Date.now()).slice(0, 2);
}

// 404: consultar a lista real da chave. 503: não repetir, usar fallback existente.
export async function callGemini({ systemInstruction, contents, forceFunctionName }) {
  const keys = getApiKeys();
  if (!keys.length) { const e = new Error("GEMINI_API_KEY não configurada."); e.code = "missing_key"; throw e; }
  if (Date.now() < overloadUntil) {
    const e = new Error("Gemini temporariamente indisponível após 503; usando fallback.");
    e.status = 503; e.code = "UNAVAILABLE"; throw e;
  }
  const key = keys[keyIndex++ % keys.length];
  const started = Date.now();
  const primary = normalizedModel(GEMINI_MODEL);
  const attempt = async (model) => {
    const data = await requestGemini({ systemInstruction, contents, apiKey: key, forceFunctionName, model });
    Object.defineProperty(data, "_kiraModel", { value: model, enumerable: false });
    console.info(`[kira-provider] provider=gemini model=${model} status=ok duration_ms=${Date.now()-started}`);
    return data;
  };
  try {
    if ((invalidModels.get(primary) || 0) < Date.now()) return await attempt(primary);
    const e = new Error("Modelo Gemini previamente retornou 404."); e.status = 404; throw e;
  } catch (err) {
    if (err.status === 404) {
      invalidModels.set(primary, Date.now() + INVALID_TTL_MS);
      try {
        const models = await discoverGeminiModels(key);
        for (const model of chooseAlternatives(models, primary)) {
          try { return await attempt(model); }
          catch (candidateErr) {
            if (candidateErr.status === 404) { invalidModels.set(model, Date.now() + INVALID_TTL_MS); continue; }
            err = candidateErr; break;
          }
        }
      } catch (discoveryError) {
        console.warn(`[kira-gemini] discovery_failed status=${discoveryError.status || "error"}`);
      }
    }
    // KIRA_MULTIMODAL_V2: apenas erro transitório 500; uma tentativa em modelo alternativo.
    // Evita trocar para provedores que não recebem os anexos.
    const hasAudio = contents.some(c => c.parts?.some(p => p.inlineData?.mimeType?.startsWith("audio/")));
    const transientAudioTimeout = hasAudio && (err.name === "TimeoutError" || err.code === 23);
    if ((err.status === 500 || transientAudioTimeout) && !forceFunctionName) {
      try {
        const models = await discoverGeminiModels(key);
        const alternative = chooseAlternatives(models, primary).find(m => m !== primary);
        if (alternative) {
          console.info('[kira-gemini] retry_transient model=' + alternative);
          return await attempt(alternative);
        }
      } catch (retryError) {
        console.warn('[kira-gemini] retry_transient_failed status=' + (retryError.status || retryError.name || 'error'));
      }
    }
    if (err.status === 503 || err.code === "UNAVAILABLE") {
      overloadUntil = Date.now() + Math.max(5000, Number(process.env.KIRA_GEMINI_COOLDOWN_MS || 45000));
    }
    console.warn(`[kira-provider] provider=gemini model=${primary} status=${err.status || err.name || "error"} duration_ms=${Date.now()-started}`);
    throw err;
  }
}

export function buildPollinationsUrl(prompt) {
  const encoded = encodeURIComponent(String(prompt || "").slice(0, 350));
  return `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=1280&model=flux&enhance=true&nologo=true`;
}

export async function callHomeAssistant({ domain, service, entity_id }) {
  if (!HOME_ASSISTANT_ENABLED) {
    const err = new Error("Home Assistant não configurado.");
    err.code = "not_configured";
    throw err;
  }
  const res = await fetch(`${HOME_ASSISTANT_URL}/api/services/${domain}/${service}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${HOME_ASSISTANT_TOKEN}` },
    body: JSON.stringify({ entity_id })
  });
  if (!res.ok) throw new Error(`Home Assistant recusou o comando: ${await res.text()}`);
  return res.json();
}

export { GEMINI_MODEL };
