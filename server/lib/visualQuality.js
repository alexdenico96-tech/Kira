// KIRA_VISUAL_QUALITY_V1
// Inspeção determinística da qualidade visual de um projeto gerado.
// "issues" = problemas que justificam pedir uma nova tentativa ao modelo.
// "warnings" = acabamento que vale registrar, mas não bloqueia a entrega.
import { extractRequestedColors, contrastRatio } from './designDirection.js';

const STYLE_FILE = /\.(css|scss|sass|less)$/i;
const MARKUP_FILE = /\.(html?|jsx|tsx|vue|svelte|astro)$/i;
const DEAD_IMAGE_HOSTS = /https?:\/\/(?:source\.unsplash\.com|via\.placeholder\.com|placeholder\.com|placehold\.it|dummyimage\.com)[^"'\s)]*/gi;
const ASSET_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

function collect(files) {
  const css = [], markup = [];
  for (const file of files) {
    const path = String(file.path || '');
    const content = String(file.content || '');
    if (STYLE_FILE.test(path)) css.push(content);
    if (MARKUP_FILE.test(path)) {
      markup.push({ path, content });
      for (const m of content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css.push(m[1]);
    }
  }
  return { css: css.join('\n'), markup };
}

function rootVars(css) {
  const vars = {};
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const decl of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) vars[decl[1]] = decl[2].trim();
  }
  return vars;
}

function isTailwindProject(files, css) {
  return /@tailwind\b|@import\s+["']tailwindcss/.test(css) ||
    files.some(f => /tailwind\.config\./.test(f.path) || /cdn\.tailwindcss\.com/.test(f.content));
}

export function inspectVisualQuality(files = [], message = '') {
  const issues = [], warnings = [];
  const clean = (files || []).filter(f => f?.path && typeof f.content === 'string');
  const hasFrontend = clean.some(f => MARKUP_FILE.test(f.path));
  if (!hasFrontend) return { ok: true, score: 100, issues, warnings, checked: false };

  const { css, markup } = collect(clean);
  const allMarkup = markup.map(m => m.content).join('\n');
  const tailwind = isTailwindProject(clean, css);
  const vars = rootVars(css);
  let score = 100;
  const penalize = (points, text, blocking = false) => {
    score -= points;
    (blocking ? issues : warnings).push(text);
  };

  if (!tailwind) {
    if (Object.keys(vars).length < 4) penalize(15, 'visual: CSS sem design tokens (variáveis em :root para cores, fontes e raio)', true);
    if (!/@media\b/.test(css)) penalize(20, 'visual: nenhuma @media query — layout não é responsivo', true);
    if (!/:hover\b/.test(css)) penalize(8, 'visual: elementos clicáveis sem estado :hover');
    if (!/:focus(-visible)?\b/.test(css)) penalize(6, 'visual: sem estilo de foco visível (:focus-visible)');
    if (!/transition\s*:/.test(css)) penalize(4, 'visual: sem transições suaves nas interações');
    if (!/\b(display\s*:\s*(grid|flex))/.test(css)) penalize(10, 'visual: layout sem grid/flex', true);
    const customFont = /fonts\.googleapis\.com|@font-face|fontsource/.test(css + allMarkup);
    if (!customFont) penalize(10, 'visual: tipografia padrão do navegador — carregue as fontes da direção visual (Google Fonts)', true);
    if (!/clamp\(/.test(css)) penalize(3, 'visual: títulos sem escala fluida (clamp)');
  }

  // Contraste entre tokens de texto e fundo, quando forem hex.
  const text = vars.text || vars['color-text'] || vars.fg;
  const bg = vars.bg || vars.background || vars['color-bg'];
  const ratio = contrastRatio(text, bg);
  if (ratio != null && ratio < 4.5) penalize(15, `visual: contraste insuficiente entre --text (${text}) e --bg (${bg}): ${ratio.toFixed(2)}:1, mínimo 4.5:1`, true);

  // Imagens: hosts mortos, caminhos locais inexistentes e falta de alt.
  const dead = [...new Set((allMarkup + css).match(DEAD_IMAGE_HOSTS) || [])];
  if (dead.length) penalize(15, `visual: ${dead.length} imagem(ns) com serviço descontinuado/placeholder (ex.: ${dead[0].slice(0, 60)})`, true);

  const paths = new Set(clean.map(f => f.path.replace(/^\.?\//, '')));
  const localRefs = [...(allMarkup + css).matchAll(/(?:src=|href=|url\()\s*["']?((?!https?:|data:|\/\/|#)[^"')\s]+)/gi)]
    .map(m => m[1].replace(/^\.?\//, ''))
    .filter(p => ASSET_EXT.test(p) && !paths.has(p) && !paths.has(`public/${p}`) && !paths.has(`src/${p}`));
  if (localRefs.length) penalize(12, `visual: imagem local inexistente no projeto: ${[...new Set(localRefs)].slice(0, 3).join(', ')}`, true);

  const imgs = allMarkup.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter(tag => !/\balt\s*=/.test(tag)).length;
  if (noAlt) penalize(4, `visual: ${noAlt} <img> sem alt`);

  // Placeholders de conteúdo que deixam a página com cara de rascunho.
  if (/lorem ipsum|t[ií]tulo aqui|texto aqui|produto \d\b|item \d\b|your (?:title|text) here/i.test(allMarkup)) {
    penalize(10, 'visual: conteúdo placeholder (lorem ipsum / "Título aqui" / "Item 1") no lugar de texto real', true);
  }

  // Cores pedidas explicitamente devem aparecer no projeto.
  const requested = extractRequestedColors(message);
  const haystack = (css + allMarkup).toLowerCase();
  const missingHex = requested.hex.filter(h => !haystack.includes(h.toLowerCase()));
  if (missingHex.length) penalize(15, `visual: cores pedidas pelo usuário não aplicadas: ${missingHex.join(', ')}`, true);

  // Modo escuro pedido mas fundo claro.
  if (/\b(dark|escur[oa]|modo escuro)\b/i.test(message) && bg && /^#/.test(bg)) {
    const r = contrastRatio(bg, '#000000');
    if (r != null && r > 4) penalize(12, `visual: usuário pediu tema escuro, mas --bg é claro (${bg})`, true);
  }

  return { ok: issues.length === 0, score: Math.max(0, score), issues, warnings, checked: true };
}

// Correção determinística barata: troca hosts de imagem mortos por imagens geradas
// a partir do alt do <img>, sem precisar de outra chamada ao modelo.
export function repairImageSources(files = []) {
  let replaced = 0;
  let seed = 11;
  const next = files.map(file => {
    if (!MARKUP_FILE.test(file.path || '') && !STYLE_FILE.test(file.path || '')) return file;
    let content = String(file.content || '');
    content = content.replace(/<img\b[^>]*>/gi, tag => {
      const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!src || !new RegExp(DEAD_IMAGE_HOSTS.source, 'i').test(src)) return tag;
      const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || 'high quality photo';
      const dims = src.match(/(\d{2,4})x(\d{2,4})/);
      const [w, h] = dims ? [dims[1], dims[2]] : ['1200', '800'];
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(alt.slice(0, 300))}?width=${w}&height=${h}&seed=${seed++}&nologo=true`;
      replaced++;
      return tag.replace(src, url);
    });
    return content === file.content ? file : { ...file, content };
  });
  return { files: next, replaced };
}
