// KIRA_CAROUSEL_V1 — desenho dos slides (PNG), PDF (LinkedIn) e ZIP.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import JSZip from 'jszip';
import { FORMATS, luminance } from './spec.js';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'fonts');
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const reg = (file, family) => GlobalFonts.registerFromPath(path.join(FONT_DIR, file), family);
  reg('Inter_400Regular.ttf', 'KInter'); reg('Inter_500Medium.ttf', 'KInter Medium'); reg('Inter_700Bold.ttf', 'KInter Bold'); reg('Inter_800ExtraBold.ttf', 'KInter Black');
  reg('DMSerifDisplay_400Regular.ttf', 'KSerif'); reg('PlayfairDisplay_700Bold.ttf', 'KPlayfair');
  reg('Montserrat_500Medium.ttf', 'KMont Medium'); reg('Montserrat_700Bold.ttf', 'KMont Bold'); reg('Montserrat_800ExtraBold.ttf', 'KMont Black');
  reg('SpaceGrotesk_500Medium.ttf', 'KGrotesk Medium'); reg('SpaceGrotesk_700Bold.ttf', 'KGrotesk Bold');
  fontsReady = true;
}

const PAIRS = {
  classic: { display: 'KSerif', body: 'KInter', bodyStrong: 'KInter Bold', label: 'KInter Bold', tracking: -0.5 },
  modern: { display: 'KMont Black', body: 'KInter', bodyStrong: 'KInter Bold', label: 'KMont Bold', tracking: -1.5 },
  tech: { display: 'KGrotesk Bold', body: 'KInter', bodyStrong: 'KInter Bold', label: 'KGrotesk Medium', tracking: -1.5 },
  elegant: { display: 'KPlayfair', body: 'KMont Medium', bodyStrong: 'KMont Bold', label: 'KMont Bold', tracking: -0.5 }
};
const UI = {
  pt: { swipe: 'Deslize', save: 'Salve', share: 'Compartilhe', comment: 'Comente', follow: 'Siga' },
  es: { swipe: 'Desliza', save: 'Guarda', share: 'Comparte', comment: 'Comenta', follow: 'Sigue' },
  en: { swipe: 'Swipe', save: 'Save', share: 'Share', comment: 'Comment', follow: 'Follow' },
  fr: { swipe: 'Glissez', save: 'Enregistrez', share: 'Partagez', comment: 'Commentez', follow: 'Suivez' },
  it: { swipe: 'Scorri', save: 'Salva', share: 'Condividi', comment: 'Commenta', follow: 'Segui' },
  de: { swipe: 'Wischen', save: 'Speichern', share: 'Teilen', comment: 'Kommentieren', follow: 'Folgen' }
};

const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
const onColor = bg => luminance(bg) > 0.45 ? '#111111' : '#ffffff';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      if (ctx.measureText(word).width <= maxWidth) { line = word; continue; }
      let chunk = '';
      for (const ch of word) { if (ctx.measureText(chunk + ch + '-').width > maxWidth) { lines.push(chunk + '-'); chunk = ch; } else chunk += ch; }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Maior tamanho de fonte em que o texto cabe na caixa. */
function fit(ctx, text, { font, maxW, maxH, max, min, lh = 1.15, maxLines = 99 }) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${size}px "${font}"`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.length * size * lh <= maxH) return { size, lines, height: lines.length * size * lh, lh, font, overflow: false };
  }
  ctx.font = `${min}px "${font}"`;
  let lines = wrap(ctx, text, maxW);
  const allowed = Math.max(1, Math.min(maxLines, Math.floor(maxH / (min * lh))));
  const overflow = lines.length > allowed;
  if (overflow) { lines = lines.slice(0, allowed); lines[allowed - 1] = lines[allowed - 1].replace(/\s*\S*$/, '') + '…'; }
  return { size: min, lines, height: lines.length * min * lh, lh, font, overflow };
}

function drawLines(ctx, block, x, y, color, { align = 'left', width = 0, tracking = 0 } = {}) {
  ctx.font = `${block.size}px "${block.font}"`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  try { ctx.letterSpacing = `${tracking}px`; } catch { /* versões antigas */ }
  const ax = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
  block.lines.forEach((line, i) => ctx.fillText(line, ax, y + i * block.size * block.lh + block.size * (block.lh - 1) / 2));
  try { ctx.letterSpacing = '0px'; } catch { /* idem */ }
  ctx.textAlign = 'left';
  return y + block.height;
}

function drawCover(ctx, img, x, y, w, h, { radius = 0, focusY = 0.42 } = {}) {
  ctx.save();
  if (radius) { roundRect(ctx, x, y, w, h, radius); ctx.clip(); }
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = Math.max(0, Math.min(img.height - sh, img.height * focusY - sh / 2));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function pill(ctx, text, x, y, { font, size, bg, fg, padX = 22, padY = 12, outline = false }) {
  ctx.font = `${size}px "${font}"`;
  const w = ctx.measureText(text).width + padX * 2, h = size + padY * 2;
  roundRect(ctx, x, y, w, h, h / 2);
  if (outline) { ctx.strokeStyle = bg; ctx.lineWidth = 3; ctx.stroke(); } else { ctx.fillStyle = bg; ctx.fill(); }
  ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = 'top';
  return { w, h };
}

function background(ctx, spec, W, H, index) {
  const p = spec.palette;
  if (spec.style === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p.background); g.addColorStop(1, p.surface);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.85, H * 0.12, 10, W * 0.85, H * 0.12, W * 0.7);
    glow.addColorStop(0, rgba(p.accent, 0.35)); glow.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = p.background; ctx.fillRect(0, 0, W, H);
  if (spec.style === 'dark') {
    const glow = ctx.createRadialGradient(W * (index % 2 ? 0.1 : 0.9), H * 0.08, 10, W * (index % 2 ? 0.1 : 0.9), H * 0.08, W * 0.8);
    glow.addColorStop(0, rgba(p.accent, 0.22)); glow.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  } else if (spec.style === 'bold') {
    ctx.fillStyle = p.accent; ctx.fillRect(0, 0, 18, H);
  } else if (spec.style === 'editorial') {
    ctx.strokeStyle = rgba(p.text, 0.12); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(88, 128); ctx.lineTo(W - 88, 128); ctx.stroke();
  }
}

function chrome(ctx, spec, i, n, W, H, safe, { onImage = false, ui }) {
  const p = spec.palette;
  const color = onImage ? 'rgba(255,255,255,0.85)' : p.muted;
  ctx.font = '26px "KInter Medium"'; ctx.fillStyle = color; ctx.textBaseline = 'top';
  const label = spec.handle || spec.brand || '';
  if (label) ctx.fillText(label, safe.x, safe.top - 70);
  const counter = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  ctx.textAlign = 'right'; ctx.fillText(counter, W - safe.x, safe.top - 70); ctx.textAlign = 'left';
  // Barra de progresso.
  const y = H - safe.bottom + 64, w = W - safe.x * 2;
  roundRect(ctx, safe.x, y, w, 6, 3); ctx.fillStyle = onImage ? 'rgba(255,255,255,0.28)' : rgba(p.text, 0.12); ctx.fill();
  roundRect(ctx, safe.x, y, Math.max(12, w * (i + 1) / n), 6, 3); ctx.fillStyle = p.accent; ctx.fill();
  if (i < n - 1) {
    ctx.font = '26px "KInter Bold"'; ctx.fillStyle = onImage ? '#ffffff' : p.text;
    const text = i === 0 ? `${ui.swipe}  →` : '→';
    ctx.textAlign = 'right'; ctx.fillText(text, W - safe.x, y - 50); ctx.textAlign = 'left';
  }
}

function overlay(ctx, W, H, from = 0.3, strength = 0.92) {
  const g = ctx.createLinearGradient(0, H * from, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, `rgba(0,0,0,${strength * 0.6})`); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, 'rgba(0,0,0,0.45)'); top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 220);
}

/** Desenha um slide. Devolve { canvas, overflow:boolean }. */
function drawSlide(spec, i, images, { W, H }) {
  const s = spec.slides[i], n = spec.slides.length, p = spec.palette;
  const f = PAIRS[spec.fonts] || PAIRS.modern;
  const ui = UI[spec.lang] || UI.pt;
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  const story = H / W > 1.6;
  const safe = { x: 88, top: story ? 250 : 170, bottom: story ? 280 : 150 };
  const cw = W - safe.x * 2;
  const img = images.get(i);
  const fullImage = img && (s.imagePlacement === 'full' || s.imagePlacement === 'background' || s.kind === 'image');
  let overflow = false;
  const block = (text, o) => { const b = fit(ctx, text, o); overflow ||= b.overflow; return b; };

  if (fullImage) {
    drawCover(ctx, img, 0, 0, W, H);
    if (s.imagePlacement === 'background') { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); overlay(ctx, W, H, 0.4, 0.5); }
    else overlay(ctx, W, H, s.kind === 'cover' ? 0.3 : 0.45, 0.92);
  } else background(ctx, spec, W, H, i);
  const textColor = fullImage ? '#ffffff' : p.text;
  const mutedColor = fullImage ? 'rgba(255,255,255,0.86)' : p.muted;
  const bottom = H - safe.bottom - 70; // espaço da seta/barra

  const kicker = (y, color = p.accent) => {
    if (!s.kicker) return y;
    if (fullImage || s.kind === 'cover') { const { h } = pill(ctx, s.kicker.toUpperCase(), safe.x, y, { font: f.label, size: 24, bg: p.accent, fg: onColor(p.accent) }); return y + h + 28; }
    ctx.font = `24px "${f.label}"`; ctx.fillStyle = color; ctx.textBaseline = 'top';
    try { ctx.letterSpacing = '3px'; } catch { /* */ }
    ctx.fillText(s.kicker.toUpperCase(), safe.x, y);
    try { ctx.letterSpacing = '0px'; } catch { /* */ }
    return y + 24 + 26;
  };

  if (s.kind === 'cover' || (fullImage && s.imagePlacement === 'full') || s.kind === 'image') {
    // Texto ancorado embaixo (sobre a foto) ou centralizado (sem foto).
    const big = s.kind === 'cover';
    const title = block(s.title || s.body, { font: f.display, maxW: cw, maxH: H * (big ? 0.38 : 0.24), max: big ? 120 : 72, min: big ? 56 : 40, lh: 1.04 });
    const body = s.body && s.title ? block(s.body, { font: f.body, maxW: cw, maxH: H * 0.14, max: 36, min: 26, lh: 1.35 }) : null;
    const kickerH = s.kicker ? 76 : 0;
    const total = kickerH + title.height + (body ? 30 + body.height : 0);
    let y = img ? bottom - total : Math.max(safe.top + 40, (H - total) / 2 - 20);
    if (!img && big && spec.style !== 'minimal') {
      ctx.fillStyle = rgba(p.accent, spec.style === 'bold' ? 1 : 0.9);
      roundRect(ctx, safe.x, y - 60, 96, 12, 6); ctx.fill();
    }
    y = kicker(y);
    y = drawLines(ctx, title, safe.x, y, textColor, { tracking: f.tracking });
    if (body) drawLines(ctx, body, safe.x, y + 30, mutedColor);
  } else if (s.kind === 'cta' || s.kind === 'list' || s.kind === 'stat' || s.kind === 'quote') {
    // Blocos só de texto: mede tudo, depois centraliza na área útil (levemente acima do centro).
    const top = safe.top + 10, avail = bottom - top;
    const items = []; // { h, gap, draw(y) }
    const push = (h, draw, gap = 0) => items.push({ h, draw, gap });
    const kickerItem = () => { if (s.kicker) push(50, y => kicker(y), 0); };
    if (s.kind === 'cta') {
      kickerItem();
      const title = block(s.title, { font: f.display, maxW: cw, maxH: avail * 0.42, max: 104, min: 46, lh: 1.06 });
      push(title.height, y => drawLines(ctx, title, safe.x, y, textColor, { tracking: f.tracking }), s.kicker ? 10 : 0);
      if (s.body) { const body = block(s.body, { font: f.body, maxW: cw, maxH: avail * 0.2, max: 40, min: 26, lh: 1.35 }); push(body.height, y => drawLines(ctx, body, safe.x, y, mutedColor), 36); }
      push(74, y => { let x = safe.x; for (const label of [ui.save, ui.share, ui.comment]) { const { w } = pill(ctx, label, x, y, { font: f.bodyStrong, size: 32, bg: fullImage ? '#ffffff' : p.text, fg: textColor, outline: true, padX: 30, padY: 18 }); x += w + 18; } }, 64);
      if (spec.handle) push(86, y => pill(ctx, `${ui.follow} ${spec.handle}`, safe.x, y, { font: f.bodyStrong, size: 36, bg: p.accent, fg: onColor(p.accent), padX: 34, padY: 24 }), 26);
    } else if (s.kind === 'list') {
      kickerItem();
      const title = block(s.title, { font: f.display, maxW: cw, maxH: avail * 0.26, max: 84, min: 40, lh: 1.08 });
      push(title.height, y => drawLines(ctx, title, safe.x, y, textColor, { tracking: f.tracking }), s.kicker ? 10 : 0);
      const room = avail - title.height - 140, dot = 64, gap = 34;
      let size = 46, lines;
      for (; size >= 24; size -= 2) {
        ctx.font = `${size}px "${f.body}"`;
        lines = s.bullets.map(b => wrap(ctx, b, cw - dot - 32));
        if (lines.reduce((a, l) => a + Math.max(dot, l.length * size * 1.3), 0) + gap * (lines.length - 1) <= room) break;
      }
      if (size < 24) { size = 24; overflow = true; }
      lines.forEach((ls, k) => {
        const h = Math.max(dot, ls.length * size * 1.3);
        push(h, y => {
          roundRect(ctx, safe.x, y, dot, dot, dot / 2); ctx.fillStyle = p.accent; ctx.fill();
          ctx.font = `30px "${f.bodyStrong}"`; ctx.fillStyle = onColor(p.accent); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(k + 1), safe.x + dot / 2, y + dot / 2 + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          ctx.font = `${size}px "${f.body}"`; ctx.fillStyle = textColor;
          const ty = y + (ls.length === 1 ? (dot - size * 1.3) / 2 : 0);
          ls.forEach((line, j) => ctx.fillText(line, safe.x + dot + 32, ty + j * size * 1.3 + size * 0.15));
        }, k === 0 ? 56 : gap);
      });
    } else if (s.kind === 'stat') {
      kickerItem();
      const value = block(s.statValue, { font: f.display, maxW: cw, maxH: avail * 0.3, max: 280, min: 96, lh: 1, maxLines: 1 });
      push(value.height, y => drawLines(ctx, value, safe.x, y, p.accent, { tracking: -3 }), 10);
      const label = block(s.statLabel || s.title, { font: f.bodyStrong, maxW: cw, maxH: avail * 0.2, max: 58, min: 32, lh: 1.15 });
      push(label.height, y => drawLines(ctx, label, safe.x, y, textColor), 28);
      const rest = [s.statLabel ? s.title : '', s.body].filter(Boolean).join('. ');
      if (rest) {
        push(4, y => { ctx.fillStyle = rgba(p.accent, 0.8); ctx.fillRect(safe.x, y, 120, 4); }, 44);
        const r = block(rest, { font: f.body, maxW: cw, maxH: avail * 0.28, max: 40, min: 24, lh: 1.4 });
        push(r.height, y => drawLines(ctx, r, safe.x, y, mutedColor), 44);
      }
    } else {
      const glyphFont = f.display === 'KSerif' || f.display === 'KPlayfair' ? f.display : 'KSerif';
      push(120, y => { ctx.font = `240px "${glyphFont}"`; ctx.fillStyle = p.accent; ctx.textBaseline = 'top'; ctx.fillText('“', safe.x - 8, y - 40); });
      const q = block(s.quote, { font: f.display, maxW: cw, maxH: avail * 0.6, max: 80, min: 34, lh: 1.16 });
      push(q.height, y => drawLines(ctx, q, safe.x, y, textColor, { tracking: f.tracking }), 20);
      if (s.author) push(36, y => { ctx.font = `34px "${f.bodyStrong}"`; ctx.fillStyle = p.accent; ctx.textBaseline = 'top'; ctx.fillText(`— ${s.author}`, safe.x, y); }, 44);
      if (s.title && s.title !== s.quote) { const t = block(s.title, { font: f.body, maxW: cw, maxH: avail * 0.16, max: 32, min: 24, lh: 1.35 }); push(t.height, y => drawLines(ctx, t, safe.x, y, mutedColor), 40); }
    }
    const total = items.reduce((a, it) => a + it.h + it.gap, 0);
    let y = top + Math.max(0, (avail - total) * 0.42);
    for (const it of items) { y += it.gap; it.draw(y); y += it.h; }
  } else {
    // content: foto em cima (top), fundo escurecido (background) ou só tipografia.
    let y = safe.top + 10;
    if (img && s.imagePlacement === 'top') {
      const h = Math.round(H * (story ? 0.36 : 0.4));
      drawCover(ctx, img, safe.x, y, cw, h, { radius: 28 });
      y += h + 48;
    } else if (!fullImage) {
      ctx.font = `120px "${f.display}"`; ctx.fillStyle = rgba(p.accent, 0.9); ctx.textBaseline = 'top';
      ctx.fillText(String(i).padStart(2, '0'), safe.x - 4, y);
      y += 170;
    } else y = Math.max(y, H * 0.3);
    y = kicker(y);
    const room = bottom - y;
    const title = block(s.title, { font: f.display, maxW: cw, maxH: Math.max(90, room * (s.body ? 0.45 : 0.9)), max: img ? 64 : 76, min: 38, lh: 1.08 });
    y = drawLines(ctx, title, safe.x, y, textColor, { tracking: f.tracking }) + 30;
    if (s.body) drawLines(ctx, block(s.body, { font: f.body, maxW: cw, maxH: bottom - y, max: 38, min: 24, lh: 1.42 }), safe.x, y, mutedColor);
    if (s.bullets.length && !s.body) drawLines(ctx, block(s.bullets.map(b => `• ${b}`).join('\n'), { font: f.body, maxW: cw, maxH: bottom - y, max: 34, min: 24, lh: 1.4 }), safe.x, y, mutedColor);
  }

  chrome(ctx, spec, i, n, W, H, safe, { onImage: Boolean(fullImage), ui });
  return { canvas, overflow };
}

/**
 * Desenha o carrossel inteiro.
 * @param {object} spec    plano normalizado
 * @param {Map<number, Buffer>} imageBuffers   índice do slide → bytes da imagem
 */
export async function renderCarousel(spec, imageBuffers = new Map()) {
  registerFonts();
  const { width: W, height: H } = FORMATS[spec.format] || FORMATS.portrait;
  const images = new Map();
  for (const [i, buf] of imageBuffers) {
    try { images.set(i, await loadImage(buf)); } catch (e) { console.warn(`[kira-carousel] imagem do slide ${i + 1} ilegível:`, e.message); }
  }
  const slides = [], overflow = [];
  for (let i = 0; i < spec.slides.length; i++) {
    const { canvas, overflow: o } = drawSlide(spec, i, images, { W, H });
    if (o) overflow.push(`o texto do slide ${i + 1} não coube no layout; encurte o título/texto desse slide`);
    slides.push(await canvas.encode('png'));
  }
  return { slides, overflow, width: W, height: H };
}

/** Só mede (sem imagens reais): usado para corrigir textos longos antes de gastar cota gerando fotos. */
export function measureCarousel(spec) {
  registerFonts();
  const { width: W, height: H } = FORMATS[spec.format] || FORMATS.portrait;
  const fake = new Map();
  const placeholder = createCanvas(16, 16);
  spec.slides.forEach((s, i) => { if (s.imageSource !== 'none') fake.set(i, placeholder); });
  const overflow = [];
  spec.slides.forEach((_, i) => { if (drawSlide(spec, i, fake, { W, H }).overflow) overflow.push(`o texto do slide ${i + 1} não coube no layout; encurte o título/texto desse slide`); });
  return overflow;
}

export function carouselPdf(slides, { width, height, title }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [width, height], margin: 0, autoFirstPage: false, info: { Title: title, Creator: 'Kira' } });
    const chunks = [];
    doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    for (const png of slides) { doc.addPage({ size: [width, height], margin: 0 }); doc.image(png, 0, 0, { width, height }); }
    doc.end();
  });
}

export async function carouselZip(slides, { slug, caption = '', hashtags = [] }) {
  const zip = new JSZip();
  slides.forEach((png, i) => zip.file(`${slug}-${String(i + 1).padStart(2, '0')}.png`, png));
  const text = [caption, hashtags.join(' ')].filter(Boolean).join('\n\n');
  if (text) zip.file('legenda.txt', text);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
