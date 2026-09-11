import dotenv from "dotenv";
dotenv.config();

// Suporta uma chave (GEMINI_API_KEY) ou várias, separadas por vírgula (GEMINI_API_KEYS).
// Com várias, o app tenta a próxima automaticamente quando uma bate no limite gratuito —
// só mostra "limite atingido" pro usuário quando TODAS as chaves configuradas falharem.
function getApiKeys() {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi && multi.trim()) {
    return multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [];
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL;
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
export const HOME_ASSISTANT_ENABLED = Boolean(HOME_ASSISTANT_URL && HOME_ASSISTANT_TOKEN);

const IMAGE_TOOL = {
  name: "generate_image",
  description:
    "Gera uma imagem a partir de uma descrição em texto. Use quando o usuário pedir para criar, gerar, desenhar ou ilustrar algo visualmente.",
  parameters: {
    type: "OBJECT",
    properties: {
      prompt: {
        type: "STRING",
        description:
          "Descrição bem detalhada da imagem a gerar (estilo, iluminação, composição, cores) — prefira escrever em inglês para melhor qualidade."
      }
    },
    required: ["prompt"]
  }
};

const HOME_ASSISTANT_TOOL = {
  name: "control_device",
  description:
    "Controla um dispositivo conectado ao Home Assistant (ligar, desligar, executar uma automação/script). Só use quando o usuário pedir claramente para controlar algo físico da casa e você souber o entity_id pelo contexto da conversa.",
  parameters: {
    type: "OBJECT",
    properties: {
      domain: { type: "STRING", description: "Domínio do Home Assistant, ex: switch, light, script, automation" },
      service: { type: "STRING", description: "Serviço a chamar, ex: turn_on, turn_off, toggle" },
      entity_id: { type: "STRING", description: "ID da entidade no Home Assistant, ex: switch.maquina_de_lavar" }
    },
    required: ["domain", "service", "entity_id"]
  }
};

function buildTools() {
  const functionDeclarations = [IMAGE_TOOL];
  if (HOME_ASSISTANT_ENABLED) functionDeclarations.push(HOME_ASSISTANT_TOOL);
  return [{ functionDeclarations }];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGemini({ systemInstruction, contents, apiKey }) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: buildTools(),
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    let code = null;
    try {
      code = JSON.parse(text)?.error?.status;
    } catch {
      /* corpo não era JSON */
    }
    const error = new Error(text);
    error.status = res.status;
    error.code = code;
    throw error;
  }

  return res.json();
}

// Tenta uma chave com retry curto para sobrecarga temporária (503) do próprio Google.
async function requestWithOverloadRetry({ systemInstruction, contents, apiKey }) {
  const delays = [800, 2000];
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await requestGemini({ systemInstruction, contents, apiKey });
    } catch (err) {
      lastError = err;
      const isOverload = err.status === 503 || err.code === "UNAVAILABLE";
      if (!isOverload || attempt === delays.length) throw err;
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
}

// Índice global para fazer round-robin entre as chaves: cada chamada começa numa chave
// diferente da anterior, espalhando o uso em vez de sempre martelar a primeira da lista.
let keyIndex = 0;

export async function callGemini({ systemInstruction, contents }) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    const err = new Error("GEMINI_API_KEY não configurada.");
    err.code = "missing_key";
    throw err;
  }

  const startIndex = keyIndex;
  keyIndex = (keyIndex + 1) % keys.length;

  let lastError;
  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[(startIndex + i) % keys.length];
    try {
      return await requestWithOverloadRetry({ systemInstruction, contents, apiKey });
    } catch (err) {
      lastError = err;
      const isQuotaOrAuth = err.status === 429 || err.code === "RESOURCE_EXHAUSTED" || err.status === 401 || err.status === 403;
      if (!isQuotaOrAuth) throw err;
    }
  }

  throw lastError;
}

export function buildPollinationsUrl(prompt) {
  const encoded = encodeURIComponent(prompt).slice(0, 800);
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Home Assistant recusou o comando: ${text}`);
  }

  return res.json();
}

export { GEMINI_MODEL };
