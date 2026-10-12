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

async function generateCloudflareImage(prompt) {
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

  for (let i = 0; i < ids.length; i++) {
    try {
      console.info(
        "[kira-image] provider=cloudflare account=" + (i + 1) + " event=start"
      );

      const form = new FormData();
      form.append("prompt", prompt);

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
        extension = "png";
      }

      if (bytes.length < 100 || bytes.length > 20 * 1024 * 1024) {
        throw new Error("Imagem Cloudflare vazia ou maior que 20 MB.");
      }

      await fs.mkdir(imageDir, { recursive: true });

      const filename = randomUUID() + "." + extension;
      await fs.writeFile(path.join(imageDir, filename), bytes);

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
    .replace(/^(crie|cria|criar|gere|gera|gerar|desenhe|desenha|faça)\\s+(uma?\\s+)?(imagem|foto|ilustração|retrato)\\s+(de|do|da|mostrando|com)?\\s*/i, "")
    .trim();

  const enhancedPrompt = [
    "Create one image faithfully following this description:",
    cleanPrompt,
    "PRIORITY: The main subject must be immediately recognizable.",
    "Preserve the exact identity, species, colors, clothing,",
    "accessories, actions, positions and setting requested.",
    "Show mandatory objects clearly and in the correct location.",
    "Do not replace the subject with a human or another species.",
    "Do not invent capes, extra characters or unrelated objects.",
    "Respect the requested visual style and composition."
  ].join(" ");

  console.info("[kira-image] prompt_chars=" + enhancedPrompt.length);

  try {
    return await generateCloudflareImage(enhancedPrompt);
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
