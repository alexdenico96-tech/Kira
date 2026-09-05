import dotenv from "dotenv";
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const HOME_ASSISTANT_URL = process.env.HOME_ASSISTANT_URL;
const HOME_ASSISTANT_TOKEN = process.env.HOME_ASSISTANT_TOKEN;
export const HOME_ASSISTANT_ENABLED = Boolean(HOME_ASSISTANT_URL && HOME_ASSISTANT_TOKEN);

// Ferramenta que a Kira pode chamar sozinha quando o usuário pedir uma imagem gerada.
// A geração em si não usa o Gemini (a cota gratuita dele pra isso está zerada) — usamos
// a Pollinations.ai (gratuita, sem chave) só para desenhar a imagem a partir do prompt.
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

// Ferramenta opcional de controle de dispositivos via Home Assistant. Só é oferecida à Kira
// se HOME_ASSISTANT_URL e HOME_ASSISTANT_TOKEN estiverem configurados no .env — sem isso,
// nem existe na lista de ferramentas, pra Kira nunca "achar" que consegue controlar algo que
// não está de fato configurado.
const HOME_ASSISTANT_TOOL = {
  name: "control_device",
  description:
    "Controla um dispositivo conectado ao Home Assistant (ligar, desligar, executar uma automação/script). Só use quando o usuário pedir claramente para controlar algo físico da casa (luz, tomada, máquina de lavar etc.) e você souber o entity_id correto pelo contexto da conversa.",
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

async function requestGemini({ systemInstruction, contents }) {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
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

// O Gemini às vezes devolve 503 UNAVAILABLE ("alta demanda") — geralmente passa sozinho em
// poucos segundos. Tenta de novo automaticamente antes de desistir e mostrar erro pro usuário.
export async function callGemini({ systemInstruction, contents }) {
  if (!GEMINI_API_KEY) {
    const err = new Error("GEMINI_API_KEY não configurada.");
    err.code = "missing_key";
    throw err;
  }

  const delays = [800, 2000]; // até 2 tentativas extras, com espera curta crescente
  let lastError;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await requestGemini({ systemInstruction, contents });
    } catch (err) {
      lastError = err;
      const isOverload = err.status === 503 || err.code === "UNAVAILABLE";
      if (!isOverload || attempt === delays.length) throw err;
      await sleep(delays[attempt]);
    }
  }

  throw lastError;
}

// model=flux dá qualidade bem melhor que o padrão da Pollinations; enhance=true deixa o
// próprio serviço reescrever/enriquecer o prompt para um resultado mais nítido.
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HOME_ASSISTANT_TOKEN}`
    },
    body: JSON.stringify({ entity_id })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Home Assistant recusou o comando: ${text}`);
  }

  return res.json();
}

export { GEMINI_MODEL };
