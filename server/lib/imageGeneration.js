import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPollinationsUrl } from "./gemini.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(currentDir, "../generated-images");


// KIRA_CLOUDFLARE_IMAGE_V1
const splitCredentials = value =>
  String(value || "").split(",").map(x => x.trim()).filter(Boolean);

// KIRA_AUTO_IMAGE_LAYOUT_V1
function detectImageLayout(prompt) {
  const text = String(prompt || "").toLowerCase();

  // A proporção explícita tem prioridade sobre palavras genéricas.
  if (/9\s*[:x/]\s*16|1080\s*[x×]\s*1920/i.test(text)) {
    return { width: 576, height: 1024, name: "vertical" };
  }

  if (/16\s*[:x/]\s*9|1920\s*[x×]\s*1080/i.test(text)) {
    return { width: 1024, height: 576, name: "horizontal" };
  }

  if (/vertical|stories|story|reels|shorts|tiktok|celular|smartphone|telefone|mobile/i.test(text)) {
    return { width: 576, height: 1024, name: "vertical" };
  }

  if (/horizontal|paisagem|panor[aâ]mic|widescreen|desktop|monitor|computador|youtube/i.test(text)) {
    return { width: 1024, height: 576, name: "horizontal" };
  }

  return { width: 1024, height: 1024, name: "square" };
}

function detectImageStyle(prompt) {
  const text = String(prompt || "").toLowerCase();

  if (/anime|mang[aá]|ghibli/i.test(text)) return "anime illustration";
  if (/3d|render|pixar|blender/i.test(text)) return "3D render";
  if (/aquarela|watercolor/i.test(text)) return "watercolor illustration";
  if (/cartoon|desenho animado/i.test(text)) return "cartoon illustration";
  if (/pixel art/i.test(text)) return "pixel art";
  if (/pintura|painting|[oó]leo sobre tela/i.test(text)) return "painting";
  if (/fot[oó]graf|realista|realistic|foto|photoreal/i.test(text)) {
    return "photorealistic photography";
  }

  return "natural detailed visual style";
}

function detectImageExtension(bytes) {
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "png";
  }
  if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") {
    return "jpg";
  }
  if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  ) {
    return "webp";
  }
  throw new Error("Formato de imagem Cloudflare não reconhecido.");
}

// KIRA_CLOUDFLARE_ACCOUNT_MANAGER_V1
const cloudflareCooldowns = new Map();
const cloudflareActiveRequests = new Map();
let cloudflareNextAccount = 0;

// KIRA_CLOUDFLARE_CONCURRENCY_V1
function getCloudflareActiveRequests(accountId) {
  return cloudflareActiveRequests.get(accountId) || 0;
}

function reserveCloudflareAccount(accountId) {
  cloudflareActiveRequests.set(
    accountId,
    getCloudflareActiveRequests(accountId) + 1
  );
}

function releaseCloudflareAccount(accountId) {
  const active = getCloudflareActiveRequests(accountId);

  if (active <= 1) {
    cloudflareActiveRequests.delete(accountId);
  } else {
    cloudflareActiveRequests.set(accountId, active - 1);
  }
}

const CLOUDFLARE_COOLDOWN_MS = 15 * 60 * 1000;

// KIRA_CLOUDFLARE_RETRY_AFTER_V1
function getCloudflareCooldownMs(response) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) return CLOUDFLARE_COOLDOWN_MS;

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(
      Math.max(1000, seconds * 1000),
      24 * 60 * 60 * 1000
    );
  }

  const retryDate = Date.parse(retryAfter);

  if (Number.isFinite(retryDate)) {
    return Math.min(
      Math.max(1000, retryDate - Date.now()),
      24 * 60 * 60 * 1000
    );
  }

  return CLOUDFLARE_COOLDOWN_MS;
}

function getCloudflareAccountOrder(ids) {
  const now = Date.now();
  const order = [];

  for (let offset = 0; offset < ids.length; offset++) {
    const index = (cloudflareNextAccount + offset) % ids.length;
    const key = ids[index];
    const blockedUntil = cloudflareCooldowns.get(key) || 0;

    if (blockedUntil > now) {
      console.info(
        "[kira-image] provider=cloudflare account=" +
        (index + 1) + " event=cooldown_skip"
      );
      continue;
    }

    if (blockedUntil) cloudflareCooldowns.delete(key);

    if (getCloudflareActiveRequests(key) > 0) {
      console.info(
        "[kira-image] provider=cloudflare account=" +
        (index + 1) + " event=busy_skip"
      );
      continue;
    }

    order.push(index);
  }

  return order;
}

async function generateCloudflareImage(prompt, layout) {
  const ids = splitCredentials(
    process.env.CLOUDFLARE_ACCOUNT_IDS || process.env.CLOUDFLARE_ACCOUNT_ID
  );
  const tokens = splitCredentials(
    process.env.CLOUDFLARE_API_TOKENS || process.env.CLOUDFLARE_API_TOKEN
  );

  if (!ids.length || ids.length !== tokens.length) {
    throw new Error("Credenciais Cloudflare ausentes ou incompatíveis.");
  }

  const model = process.env.CLOUDFLARE_IMAGE_MODEL ||
    "@cf/black-forest-labs/flux-2-klein-9b";

  let lastError;

  const accountOrder = getCloudflareAccountOrder(ids);

  if (!accountOrder.length) {
    throw new Error("Todas as contas Cloudflare estão em cooldown.");
  }

  for (const i of accountOrder) {
    const blockedUntil = cloudflareCooldowns.get(ids[i]) || 0;

    if (blockedUntil > Date.now()) {
      continue;
    }

    if (getCloudflareActiveRequests(ids[i]) > 0) {
      continue;
    }

    reserveCloudflareAccount(ids[i]);

    try {
      console.info(
        "[kira-image] provider=cloudflare account=" + (i + 1) + " event=start"
      );

      const form = new FormData();
      form.append("prompt", prompt);
      form.append("width", String(layout.width));
      form.append("height", String(layout.height));

      const url =
        "https://api.cloudflare.com/client/v4/accounts/" +
        encodeURIComponent(ids[i]) +
        "/ai/run/" + model;



  const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tokens[i]
        },
        body: form,
        signal: AbortSignal.timeout(120000)
      });

      if (!response.ok) {
        if (response.status === 429) {
          const cooldownMs = getCloudflareCooldownMs(response);

          cloudflareCooldowns.set(
            ids[i],
            Date.now() + cooldownMs
          );

          console.warn(
            "[kira-image] provider=cloudflare account=" +
            (i + 1) +
            " event=cooldown_start seconds=" +
            Math.ceil(cooldownMs / 1000)
          );
        }

        throw new Error("HTTP " + response.status);
      }

      const contentType = response.headers.get("content-type") || "";
      let bytes;
      let extension;

      if (contentType.startsWith("image/")) {
        bytes = Buffer.from(await response.arrayBuffer());
        extension = contentType.includes("jpeg") ? "jpg" :
          contentType.includes("webp") ? "webp" : "png";
      } else {
        const data = await response.json();

        if (data.success === false || typeof data.result?.image !== "string") {
          throw new Error("Cloudflare não retornou uma imagem válida.");
        }

        const base64 = data.result.image.replace(
          /^data:image\/[^;]+;base64,/,
          ""
        );

        bytes = Buffer.from(base64, "base64");
        extension = detectImageExtension(bytes);
      }

      if (bytes.length < 100 || bytes.length > 20 * 1024 * 1024) {
        throw new Error("Imagem Cloudflare vazia ou maior que 20 MB.");
      }

      await fs.mkdir(imageDir, { recursive: true });

      const filename = randomUUID() + "." + extension;
      await fs.writeFile(path.join(imageDir, filename), bytes);

      cloudflareNextAccount = (i + 1) % ids.length;

      console.info(
        "[kira-image] provider=cloudflare account=" + (i + 1) + " status=200"
      );

      return "/api/generated-images/" + filename;
    } catch (error) {
      lastError = error;
      console.warn(
        "[kira-image] provider=cloudflare account=" +
        (i + 1) + " failed=" + error.message
      );
    } finally {
      releaseCloudflareAccount(ids[i]);
    }
  }

  throw lastError || new Error("Cloudflare indisponível.");
}

export async function generateKiraImage(prompt) {
  const text = String(prompt || "").trim();

  if (!text) {
    throw new Error("A descrição da imagem está vazia.");
  }

  const cleanPrompt = text
    .replace(/^(crie|cria|criar|gere|gera|gerar|desenhe|desenha|faça)\s+(uma?\s+)?(imagem|foto|ilustração|retrato)\s+(de|do|da|mostrando|com)?\s*/i, "")
    .trim();

  const layout = detectImageLayout(cleanPrompt);
  const style = detectImageStyle(cleanPrompt);

  const enhancedPrompt = [
    "Create one image faithfully following this description:",
    cleanPrompt,
    "Visual style: " + style + ".",
    "Composition: " + layout.name + ".",
    "PRIORITY: The main subject must be immediately recognizable.",
    "Preserve the exact identity, species, colors, clothing,",
    "accessories, actions, positions and setting requested.",
    "Show mandatory objects clearly and in the correct location.",
    "Do not replace the subject with a human or another species.",
    "Do not invent capes, extra characters or unrelated objects.",
    "Respect the requested visual style and composition."
  ].join(" ");

  console.info(
    "[kira-image] layout=" + layout.name +
    " size=" + layout.width + "x" + layout.height +
    " style=" + style
  );
  console.info("[kira-image] prompt_chars=" + enhancedPrompt.length);

  try {
    return await generateCloudflareImage(enhancedPrompt, layout);
  } catch (error) {
    console.warn(
      "[kira-image] cloudflare unavailable; using pollinations:",
      error.message
    );
  }

  console.info("[kira-image] provider=pollinations event=start");

  const url = buildPollinationsUrl(enhancedPrompt);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    throw new Error(`Pollinations retornou HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Pollinations não retornou uma imagem.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length < 100) {
    throw new Error("A imagem recebida está vazia ou incompleta.");
  }

  if (bytes.length > 20 * 1024 * 1024) {
    throw new Error("A imagem recebida ultrapassa 20 MB.");
  }

  let extension;

  if (contentType.includes("image/jpeg")) {
    extension = "jpg";
  } else if (contentType.includes("image/png")) {
    extension = "png";
  } else if (contentType.includes("image/webp")) {
    extension = "webp";
  } else {
    throw new Error(`Formato de imagem não suportado: ${contentType}`);
  }

  await fs.mkdir(imageDir, { recursive: true });

  const filename = `${randomUUID()}.${extension}`;

  await fs.writeFile(path.join(imageDir, filename), bytes);

  return `/api/generated-images/${filename}`;
}
