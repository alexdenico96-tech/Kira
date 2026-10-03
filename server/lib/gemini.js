import dotenv from "dotenv";
dotenv.config();

function getApiKeys() {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi && multi.trim()) return multi.split(",").map((k) => k.trim()).filter(Boolean);
  return process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : [];
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL;
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
export const HOME_ASSISTANT_ENABLED = Boolean(HOME_ASSISTANT_URL && HOME_ASSISTANT_TOKEN);

const IMAGE_TOOL = {
  name: "generate_image",
  description: "Gera uma imagem a partir de uma descrição em texto. Use quando o usuário pedir para criar/desenhar/ilustrar algo.",
  parameters: {
    type: "OBJECT",
    properties: { prompt: { type: "STRING", description: "Descrição detalhada da imagem, de preferência em inglês." } },
    required: ["prompt"]
  }
};

const DOCUMENT_TOOL = {
  name: "create_document",
  description:
    "Cria um artifact de projeto para download e visualização. Pode conter um ou vários arquivos e subpastas. Use para código, sites, apps, documentos, planos técnicos ou qualquer conteúdo que o usuário queira criar/salvar. Se o pedido exigir vários arquivos, devolva TODOS no mesmo artifact. Respeite a tecnologia pedida pelo usuário; quando ele não especificar, escolha ou sugira uma stack adequada sem trocar silenciosamente a tecnologia de um projeto existente.",
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

async function requestGemini({ systemInstruction, contents, apiKey, forceFunctionName }) {
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
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

// Tenta todas as chaves rápido (sem espera entre elas); só faz UMA pausa curta se todas
// baterem em sobrecarga (503), antes de tentar a rodada inteira de novo.
export async function callGemini({ systemInstruction, contents, forceFunctionName }) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    const err = new Error("GEMINI_API_KEY não configurada.");
    err.code = "missing_key";
    throw err;
  }

  const startIndex = keyIndex;
  keyIndex = (keyIndex + 1) % keys.length;

  async function tryAll() {
    let lastError;
    let hadOverload = false;
    for (let i = 0; i < keys.length; i++) {
      const apiKey = keys[(startIndex + i) % keys.length];
      try {
        return await requestGemini({ systemInstruction, contents, apiKey, forceFunctionName });
      } catch (err) {
        lastError = err;
        const isOverload = err.status === 503 || err.code === "UNAVAILABLE";
        const isQuotaOrAuth = err.status === 429 || err.code === "RESOURCE_EXHAUSTED" || err.status === 401 || err.status === 403;
        if (isOverload) hadOverload = true;
        if (!isOverload && !isQuotaOrAuth) throw err;
      }
    }
    const err = lastError || new Error("Todas as chaves falharam.");
    err.hadOverload = hadOverload;
    throw err;
  }

  try {
    return await tryAll();
  } catch (err) {
    if (err.hadOverload) {
      await sleep(1200);
      return tryAll();
    }
    throw err;
  }
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
  if (!res.ok) throw new Error(`Home Assistant recusou o comando: ${await res.text()}`);
  return res.json();
}

export { GEMINI_MODEL };
