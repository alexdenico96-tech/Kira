import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPollinationsUrl } from "./gemini.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(currentDir, "../generated-images");

export async function generateKiraImage(prompt) {
  const text = String(prompt || "").trim();

  if (!text) {
    throw new Error("A descrição da imagem está vazia.");
  }

  const cleanPrompt = text
  .replace(/^(crie|cria|criar|gere|gera|gerar|desenhe|desenha|faça)\s+(uma?\s+)?(imagem|foto|ilustração|retrato)\s+(de|do|da|mostrando|com)?\s*/i, "")
  .trim();

const enhancedPrompt = [
  cleanPrompt,
  "The image must accurately depict every essential subject, action,",
  "outfit, object and location explicitly requested.",
  "Do not omit essential elements.",
  "Clear recognizable subject, coherent composition, detailed scene."
].join(" ");

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
