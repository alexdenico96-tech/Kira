// KIRA_PROJECT_IMAGES_V1
// Imagens dos projetos gerados: em vez de o preview pedir 10+ imagens ao Pollinations ao mesmo
// tempo (fila por IP, demora e timeouts), o servidor:
//   1. troca cada URL do Pollinations por /api/project-images/<id> e grava um manifesto;
//   2. começa a gerar as imagens em segundo plano, numa fila com concorrência controlada,
//      usando as contas Cloudflare (com Pollinations server-side como reserva);
//   3. guarda o arquivo em disco: depois da primeira geração, a imagem abre na hora, sempre.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateCloudflareImage } from './imageGeneration.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(currentDir, '../project-images');
const generatedDir = path.resolve(currentDir, '../generated-images');
const POLLINATIONS_URL = /https:\/\/image\.pollinations\.ai\/prompt\/([^?"'`\s)<>]+)(\?[^"'`\s)<>]*)?/g;
const EXTENSIONS = ['jpg', 'png', 'webp'];
const LIMIT = Number(process.env.KIRA_PROJECT_IMAGE_LIMIT || 16);
const accountCount = String(process.env.CLOUDFLARE_ACCOUNT_IDS || process.env.CLOUDFLARE_ACCOUNT_ID || '')
  .split(',').map(x => x.trim()).filter(Boolean).length;
const CONCURRENCY = Math.max(1, Math.min(4, accountCount || 1));

const manifests = new Map();
const inflight = new Map();

// O id é um HMAC do conteúdo: só o servidor consegue criar ids válidos, então a URL pode
// carregar a descrição da imagem (?m=) e ser regenerada mesmo se o disco for apagado
// (ex.: Render apaga arquivos a cada deploy), sem abrir a rota para prompts arbitrários.
const SECRET = process.env.JWT_SECRET || 'kira-dev-project-images';
const signId = m => createHmac('sha256', SECRET).update(`${m.prompt}|${m.width}|${m.height}|${m.seed}`).digest('hex').slice(0, 24);
const encodeManifest = m => Buffer.from(JSON.stringify({ p: m.prompt, w: m.width, h: m.height, s: m.seed })).toString('base64url');
function decodeManifest(id, token) {
  try {
    const raw = JSON.parse(Buffer.from(String(token), 'base64url').toString('utf8'));
    const m = { prompt: String(raw.p || '').slice(0, 600), width: clampSize(raw.w), height: clampSize(raw.h), seed: Number(raw.s) || 1 };
    if (!m.prompt || signId(m) !== id) return null;
    m.originalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(m.prompt)}?width=${m.width}&height=${m.height}&seed=${m.seed}&nologo=true`;
    return m;
  } catch { return null; }
}

export const isProjectImageId = id => /^[a-f0-9]{24}$/.test(String(id || ''));

const clampSize = value => {
  const n = Number(value) || 1024;
  return Math.round(Math.min(1280, Math.max(256, n)) / 64) * 64;
};

function parsePollinations(prompt, query = '') {
  let text;
  try { text = decodeURIComponent(prompt); } catch { text = prompt; }
  const params = new URLSearchParams(String(query).replace(/^\?/, '').replace(/&amp;/g, '&'));
  return {
    prompt: text.replace(/\s+/g, ' ').trim().slice(0, 600),
    width: clampSize(params.get('width')),
    height: clampSize(params.get('height')),
    seed: Number(params.get('seed')) || 1
  };
}

async function writeManifest(id, manifest) {
  manifests.set(id, manifest);
  const file = path.join(imageDir, `${id}.json`);
  try { await fs.access(file); } catch {
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(manifest));
  }
}

async function readManifest(id) {
  if (manifests.has(id)) return manifests.get(id);
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(imageDir, `${id}.json`), 'utf8'));
    manifests.set(id, manifest);
    return manifest;
  } catch { return null; }
}

async function findReadyFile(id) {
  for (const ext of EXTENSIONS) {
    const file = path.join(imageDir, `${id}.${ext}`);
    try { await fs.access(file); return file; } catch { /* próxima extensão */ }
  }
  return null;
}

// Troca as URLs do Pollinations nos arquivos do projeto por URLs servidas pela Kira.
export async function rewriteProjectImages(files = [], baseUrl = '') {
  const ids = [];
  const pending = [];
  const base = String(baseUrl).replace(/\/$/, '');
  const next = files.map(file => {
    if (typeof file?.content !== 'string' || !file.content.includes('image.pollinations.ai')) return file;
    const content = file.content.replace(POLLINATIONS_URL, (url, prompt, query) => {
      const manifest = { ...parsePollinations(prompt, query), originalUrl: url.replace(/&amp;/g, '&') };
      if (!manifest.prompt) return url;
      const id = signId(manifest);
      if (!ids.includes(id)) {
        if (ids.length >= LIMIT) return url; // acima do limite, mantém o link original
        ids.push(id);
        pending.push(writeManifest(id, manifest));
      }
      return `${base}/api/project-images/${id}?m=${encodeManifest(manifest)}`;
    });
    return content === file.content ? file : { ...file, content };
  });
  await Promise.all(pending);
  return { files: next, ids };
}

// Fila com concorrência = número de contas Cloudflare (1 a 4).
let active = 0;
const waiting = [];
function schedule(task, priority = false) {
  return new Promise((resolve, reject) => {
    const job = { task, resolve, reject };
    if (priority) waiting.unshift(job); else waiting.push(job);
    pump();
  });
}
function pump() {
  while (active < CONCURRENCY && waiting.length) {
    const job = waiting.shift();
    active++;
    job.task().then(job.resolve, job.reject).finally(() => { active--; pump(); });
  }
}

// O Pollinations anônimo aceita ~1 requisição por IP; serializa a reserva.
let pollinationsChain = Promise.resolve();
function viaPollinations(id, manifest) {
  const run = pollinationsChain.then(async () => {
    const response = await fetch(manifest.originalUrl, { signal: AbortSignal.timeout(90000) });
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !type.startsWith('image/')) throw new Error(`Pollinations HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100) throw new Error('Pollinations retornou imagem vazia');
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const dest = path.join(imageDir, `${id}.${ext}`);
    await fs.writeFile(dest, bytes);
    return dest;
  });
  pollinationsChain = run.catch(() => {});
  return run;
}

async function generate(id, manifest) {
  await fs.mkdir(imageDir, { recursive: true });
  try {
    const prompt = `${manifest.prompt}. Professional photograph for a website section, sharp focus, no text, no watermark, no logos.`;
    const rel = await generateCloudflareImage(prompt, { width: manifest.width, height: manifest.height, name: 'project' });
    const src = path.join(generatedDir, path.basename(rel));
    const dest = path.join(imageDir, `${id}${path.extname(src)}`);
    await fs.rename(src, dest).catch(async () => { await fs.copyFile(src, dest); await fs.unlink(src).catch(() => {}); });
    console.info(`[kira-project-image] id=${id} provider=cloudflare status=ok`);
    return dest;
  } catch (error) {
    console.warn(`[kira-project-image] id=${id} cloudflare_failed=${error.message}; usando Pollinations no servidor`);
    const dest = await viaPollinations(id, manifest);
    console.info(`[kira-project-image] id=${id} provider=pollinations status=ok`);
    return dest;
  }
}

function ensure(id, manifest, priority) {
  if (inflight.has(id)) return inflight.get(id);
  const promise = schedule(async () => (await findReadyFile(id)) || generate(id, manifest), priority)
    .finally(() => inflight.delete(id));
  inflight.set(id, promise);
  return promise;
}

// Gera em segundo plano logo após salvar o projeto, para o preview já encontrar tudo pronto.
export function warmProjectImages(ids = []) {
  for (const id of ids) {
    readManifest(id).then(manifest => {
      if (manifest) ensure(id, manifest, false).catch(() => {});
    });
  }
}

// Usado pela rota: devolve o arquivo pronto, espera a geração ou indica a URL original como reserva.
export async function getProjectImage(id, token) {
  if (!isProjectImageId(id)) return null;
  const ready = await findReadyFile(id);
  if (ready) return { file: ready };
  let manifest = await readManifest(id);
  if (!manifest && token) {
    manifest = decodeManifest(id, token);
    if (manifest) await writeManifest(id, manifest);
  }
  if (!manifest) return null;
  try {
    return { file: await ensure(id, manifest, true) };
  } catch {
    return { fallbackUrl: manifest.originalUrl };
  }
}
