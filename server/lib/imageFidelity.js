// KIRA_IMAGE_FIDELITY_V1
// Imagens mais fiéis sem trocar o modelo (FLUX.2 klein 9B na Cloudflare):
//  1. PLANO: o pedido (em qualquer idioma) vira um prompt descritivo em inglês, no formato que o FLUX
//     entende melhor, mais uma checklist dos elementos obrigatórios e a proporção certa.
//  2. GERAÇÃO com seed conhecida (edições reaproveitam a seed para manter a composição) e,
//     quando o usuário envia uma foto, com a foto como referência (input_image_0).
//  3. CONFERÊNCIA: um modelo de visão compara a imagem com a checklist e dá nota de 0 a 10.
//  4. REFINO: abaixo da nota mínima, gera de novo reforçando o que faltou e fica com a melhor.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const imageDir = path.resolve(currentDir, '../generated-images');
const metaDir = path.resolve(currentDir, '../generated-images-meta'); // fora da pasta pública

export const ASPECTS = {
  square: { width: 1024, height: 1024, name: 'square' },
  portrait: { width: 768, height: 1152, name: 'vertical' },
  landscape: { width: 1152, height: 768, name: 'horizontal' }
};

const MIN_SCORE = Number(process.env.KIRA_IMAGE_MIN_SCORE || 8);
const MAX_ATTEMPTS = Math.max(1, Math.min(4, Number(process.env.KIRA_IMAGE_MAX_ATTEMPTS || 2)));
const GUIDANCE = process.env.KIRA_IMAGE_GUIDANCE ? Number(process.env.KIRA_IMAGE_GUIDANCE) : undefined;

export function explicitAspect(text = '') {
  const t = String(text).toLowerCase();
  if (/9\s*[:x/]\s*16|vertical|stories|story|reels|shorts|tiktok|celular|wallpaper de celular|retrato vertical/.test(t)) return 'portrait';
  if (/16\s*[:x/]\s*9|horizontal|paisagem|panor[aâ]mic|widescreen|banner|capa do youtube|thumbnail|desktop/.test(t)) return 'landscape';
  if (/quadrad[ao]|1\s*[:x/]\s*1|post do instagram|avatar|[ií]cone|logo/.test(t)) return 'square';
  return null;
}

export function planPrompt(request, { previous, hasReference } = {}) {
  return `You write prompts for FLUX.2, a text-to-image model. Convert the user's request (it may be in Portuguese) into ONE English prompt that makes the model render EXACTLY what was asked.
Rules:
- Order: main subject → its attributes (colors, materials, clothing, pose, expression) → action → every other object with exact counts written as words and numerals ("three (3) red apples") → spatial layout (left/right/center/foreground/background) → setting → lighting → camera and lens (for photos) or medium (for art) → mood.
- Keep EVERY detail the user gave. Do not drop, merge, soften or change anything. Do not add characters, objects, logos or text that were not requested.
- If the user names a style, use it literally. If not, pick the most fitting style (real-world scenes → photorealistic photo).
- Text inside the image: put the exact text in double quotes and say where it appears.
- Describe what must be seen in positive terms; avoid negations.
- 60 to 180 words of natural prose, no lists.
${previous ? `- EDIT MODE: the user is changing the previous image. Start from PREVIOUS PROMPT, keep everything in it unchanged, and apply ONLY the requested change.\nPREVIOUS PROMPT: ${String(previous.prompt || previous.request || '').slice(0, 1500)}\n` : ''}${hasReference ? '- REFERENCE MODE: the user attached a photo as image 0. Write the prompt as an instruction that preserves the identity, shapes and composition of the subject from image 0 and applies the requested change or style.\n' : ''}
Return JSON only:
{"prompt":"...","elements":["each required visual element as a short checklist item in Portuguese, including counts and colors"],"aspect":"square|portrait|landscape","style":"photo|illustration|3d|anime|painting|other"}

USER REQUEST:
${String(request).slice(0, 3000)}`;
}

function parseJson(raw) {
  const text = String(raw || '').replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export function parsePlan(raw, request) {
  const data = parseJson(raw);
  const prompt = String(data?.prompt || '').trim();
  if (prompt.length < 20) return null;
  const elements = (Array.isArray(data.elements) ? data.elements : []).map(e => String(e).trim()).filter(Boolean).slice(0, 12);
  const aspect = explicitAspect(request) || (ASPECTS[data.aspect] ? data.aspect : 'square');
  return { prompt: prompt.slice(0, 2000), elements, aspect, style: String(data.style || 'other') };
}

export function fallbackPlan(request, previous) {
  const base = previous?.prompt ? `${previous.prompt}. Change: ${request}` : request;
  return { prompt: String(base).slice(0, 2000), elements: [], aspect: explicitAspect(request) || previous?.aspect || 'square', style: 'other' };
}

export function verificationPrompt(request, plan) {
  return `Você é um revisor rigoroso de imagens geradas por IA. Compare a imagem com o pedido do usuário.
PEDIDO: ${String(request).slice(0, 1500)}
CHECKLIST: ${plan.elements.length ? plan.elements.map((e, i) => `${i + 1}. ${e}`).join(' ') : '(derive do pedido)'}
Dê uma nota de 0 a 10: 10 = todos os elementos presentes, quantidades, cores, posições e estilo corretos, sem defeitos.
Desconte 2 por elemento pedido ausente, 1 por cor/quantidade/posição errada, 1 por defeito grave (mãos ou rostos deformados, texto ilegível), 1 por elemento importante não pedido.
Responda SOMENTE JSON: {"score":0,"missing":["o que falta ou está errado, curto, em português"],"fix_en":["the same corrections as short English visual phrases, e.g. 'a blue astronaut helmet on the cat'"],"extra":["elementos não pedidos relevantes"]}`;
}

export function parseVerification(raw) {
  const data = parseJson(raw);
  const score = Number(data?.score);
  if (!Number.isFinite(score)) return null;
  const list = v => (Array.isArray(v) ? v : []).map(x => String(x).trim()).filter(Boolean).slice(0, 8);
  return { score: Math.max(0, Math.min(10, score)), missing: list(data.missing), fixEn: list(data.fix_en), extra: list(data.extra) };
}

// Reforço determinístico: o FLUX dá mais peso ao começo do prompt.
export function reinforcePrompt(plan, verification) {
  const fixes = verification?.fixEn?.length ? verification.fixEn : verification?.missing || [];
  const focus = fixes.length ? `Clearly visible and accurate: ${fixes.join('; ')}. ` : '';
  const avoid = verification?.extra?.length ? ` The scene contains only the requested elements.` : '';
  return `${focus}${plan.prompt}${avoid}`.slice(0, 2200);
}

const fileFromUrl = url => path.join(imageDir, path.basename(String(url || '').split('?')[0]));
const mimeOf = file => file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

export async function saveImageMeta(url, meta) {
  try {
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(path.join(metaDir, `${path.basename(fileFromUrl(url))}.json`), JSON.stringify(meta));
  } catch { /* metadado é opcional */ }
}

export async function readImageMeta(url) {
  if (!String(url || '').startsWith('/api/generated-images/')) return null;
  try { return JSON.parse(await fs.readFile(path.join(metaDir, `${path.basename(fileFromUrl(url))}.json`), 'utf8')); }
  catch { return null; }
}

/**
 * @param request   pedido do usuário
 * @param previous  {prompt, seed, aspect} da imagem anterior quando é uma edição
 * @param reference {bytes, mimeType} foto do usuário (≤ 512px) para edição/estilo
 * @param ask       (prompt) => texto        — planejamento do prompt
 * @param askVision (prompt, bytes, mime) => texto — conferência da imagem
 * @param generate  (prompt, options) => url — geração (Cloudflare com reserva)
 */
export async function createFaithfulImage({ request, previous = null, reference = null, ask, askVision, generate, onProgress = () => {} }) {
  onProgress('plan', 'Interpretando a cena');
  let plan = null;
  if (typeof ask === 'function') {
    try { plan = parsePlan(await ask(planPrompt(request, { previous, hasReference: Boolean(reference) })), request); }
    catch (error) { console.warn('[kira-image-fidelity] plano falhou:', error.message); }
  }
  if (!plan) plan = fallbackPlan(request, previous);
  if (previous?.aspect && !explicitAspect(request)) plan.aspect = previous.aspect;
  onProgress('plan', 'Cena planejada', plan.elements.length ? `${plan.elements.length} elementos obrigatórios` : '', 'done');
  console.info(`[kira-image-fidelity] plan elements=${plan.elements.length} aspect=${plan.aspect} edit=${Boolean(previous)} reference=${Boolean(reference)}`);

  const attempts = [];
  let prompt = plan.prompt;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Edição reaproveita a seed da imagem anterior na 1ª tentativa para manter a composição.
    const seed = attempt === 1 && Number.isFinite(previous?.seed) ? previous.seed : Math.floor(Math.random() * 2 ** 31);
    onProgress(`render-${attempt}`, attempt === 1 ? 'Gerando a imagem' : `Refinando · tentativa ${attempt}`, attempt === 1 ? '' : 'reforçando o que faltou');
    const url = await generate(request, {
      plannedPrompt: prompt, layout: ASPECTS[plan.aspect], seed, guidance: GUIDANCE,
      referenceImage: reference || undefined
    });
    const current = { url, prompt, seed, verification: null };
    attempts.push(current);

    if (typeof askVision !== 'function') break;
    onProgress(`render-${attempt}`, attempt === 1 ? 'Imagem gerada' : `Tentativa ${attempt} gerada`, '', 'done');
    onProgress(`check-${attempt}`, 'Conferindo fidelidade ao pedido');
    try {
      const file = fileFromUrl(url);
      const bytes = await fs.readFile(file);
      current.verification = parseVerification(await askVision(verificationPrompt(request, plan), bytes, mimeOf(file)));
    } catch (error) {
      console.warn('[kira-image-fidelity] conferência indisponível:', error.message);
    }
    const v = current.verification;
    console.info(`[kira-image-fidelity] attempt=${attempt} score=${v?.score ?? 'n/a'} missing=${v?.missing?.length ?? 0}`);
    if (!v) break;
    onProgress(`check-${attempt}`, `Nota de fidelidade: ${v.score}/10`, v.missing.length ? `Ajustar: ${v.missing.slice(0, 3).join(', ')}` : 'Todos os elementos conferidos', 'done');
    if (v.score >= MIN_SCORE) break;
    prompt = reinforcePrompt(plan, v);
  }

  const scored = attempts.filter(a => a.verification);
  const best = scored.length ? scored.reduce((a, b) => (b.verification.score > a.verification.score ? b : a)) : attempts[attempts.length - 1];
  for (const a of attempts) if (a !== best) fs.unlink(fileFromUrl(a.url)).catch(() => {});
  await saveImageMeta(best.url, { request: String(request).slice(0, 2000), prompt: best.prompt, seed: best.seed, aspect: plan.aspect, elements: plan.elements, score: best.verification?.score ?? null });
  onProgress('done', 'Imagem pronta', '', 'done');
  return { url: best.url, plan, verification: best.verification, attempts: attempts.length };
}

// Pedido de ajuste na última imagem ("agora deixe o céu roxo", "coloque um chapéu nele").
export function isImageEditFollowUp(text = '') {
  const t = String(text).trim();
  if (!t || t.length > 400 || /\?\s*$/.test(t)) return false;
  if (/\b(html|css|javascript|c[oó]digo|componente|site|app|projeto|arquivo)\b/i.test(t)) return false;
  return /^(?:(?:agora|ok|beleza|perfeito|legal|show)[,!.]?\s+)?(?:e\s+)?(?:deix[ae]|mud[ae]|troqu?e|troca|coloqu?e|coloca|p[oõ]e|adicion[ae]|acrescent[ae]|inclu[ai]|remov[ae]|tir[ae]|apag[ae]|aument[ae]|diminu[ai]|fa[cç]a|faz|transform[ae]|refa[cç]a|gere outra|outra vers[aã]o|muda|mais|menos|sem\s|com\s|em\s+estilo|no\s+estilo|estilo)/i.test(t);
}

// Foto anexada + pedido de transformação ("transforme essa foto em anime", "coloque um chapéu nele").
export function isReferenceImageRequest(text = '') {
  const t = String(text);
  return /\b(transform[ae]|edit[ae]|coloqu?e|coloca|adicion[ae]|remov[ae]|tir[ae]|troqu?e|mud[ae]|deix[ae]|recri[ae]|refa[cç]a|estiliz[ae]|convert[ae]|vers[aã]o|gere|crie|fa[cç]a)\b/i.test(t) &&
    /\b(foto|imagem|ela|ele|nela|nele|isso|essa|esta|dessa|desta|nessa|nesta|anime|desenho|cartoon|pintura|aquarela|pixar|3d|estilo)\b/i.test(t) &&
    !/\b(descrev[ae]|o que (?:é|tem|há)|analis[ae]|explique|leia|identifique|quem é)\b/i.test(t);
}
