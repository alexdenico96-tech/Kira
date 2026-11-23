// KIRA_CAROUSEL_V1 — carrosséis para redes sociais (Instagram, LinkedIn, TikTok...).
// Pedido → plano estruturado (Gemini/Groq) → conferência contra o checklist → imagens → PNGs/PDF/ZIP.

import { normalizeText } from '../requirements.js';
import { COLOR_HEX, checklistIssues } from '../requestChecklist.js';

export const FORMATS = {
  portrait: { width: 1080, height: 1350, label: '1080×1350 (4:5)' },
  square: { width: 1080, height: 1080, label: '1080×1080 (1:1)' },
  story: { width: 1080, height: 1920, label: '1080×1920 (9:16)' }
};
export const STYLES = ['editorial', 'bold', 'minimal', 'dark', 'gradient'];
export const FONT_PAIRS = ['classic', 'modern', 'tech', 'elegant'];
export const KINDS = ['cover', 'content', 'list', 'stat', 'quote', 'image', 'cta'];
export const PLACEMENTS = ['full', 'top', 'background', 'none'];

const WEB_CONTEXT = /\b(site|landing ?page|p[aá]gina web|website|web ?site|react|componente|component|html|css|javascript|front-?end|app\b|aplicativo|sistema|projeto web|slider de|carousel component)\b/i;
const CAROUSEL_WORD = /\bcarross[eé]is\b|\bcarrossel\b|\bcarrusel(?:es)?\b|\bcarousels?\b/i;
const SOCIAL_HINT = /\b(instagram|insta|linkedin|tiktok|post|posts|publica[cç][aã]o|publicaci[oó]n|feed|redes sociais|redes sociales|social media|stories|story)\b/i;

/** "Crie um carrossel para Instagram..." → { format }. Carrossel dentro de um site continua sendo projeto. */
export function detectCarouselRequest(text = '') {
  const t = String(text || '');
  const carousel = CAROUSEL_WORD.test(t);
  const socialSlides = SOCIAL_HINT.test(t) && /\b(slides?|l[aâ]minas?|cards?|diapositivas?)\b/i.test(t) && /\b(post|posts|instagram|linkedin|carross|carrus|carousel)/i.test(t);
  if (!carousel && !socialSlides) return null;
  if (WEB_CONTEXT.test(t) && !SOCIAL_HINT.test(t)) return null;
  return { format: detectCarouselFormat(t) };
}

export function detectCarouselFormat(text = '') {
  const t = normalizeText(text);
  if (/\b(story|stories|storys|historias|9:16|9x16|1080x1920|tiktok|reels?|vertical cheio)\b/.test(t)) return 'story';
  if (/\b(quadrad[oa]|cuadrad[oa]|square|1:1|1x1|1080x1080)\b/.test(t)) return 'square';
  return 'portrait';
}

// Pedido de mudança no carrossel anterior ("troca o slide 3", "deixa o fundo azul", "usa essa foto na capa").
export function isCarouselEdit(text = '') {
  const t = normalizeText(text);
  if (/\b(novo|nova|outro|otra|otro|another|new)\s+carross|\bnuevo carrusel|\bnew carousel/.test(t)) return false;
  return /\b(slide|lamina|capa|portada|cover|ultimo|primeiro|segundo|terceiro|legenda|caption|hashtags?|fundo|fondo|background|cor|cores|color|fonte|letra|titulo|texto|foto|imagem|imagen|image)\b/.test(t) &&
    /\b(troca|trocar|muda|mudar|altera|alterar|ajusta|ajustar|corrige|corrigir|deixa|deixe|coloca|coloque|adiciona|adicione|acrescenta|remove|remova|tira|tire|substitui|substitua|aumenta|diminui|usa|use|cambia|cambiar|pon|pone|quita|agrega|anade|change|replace|make|add|remove|swap|use|put)\b/.test(t);
}

export const CREATE_CAROUSEL_TOOL = {
  name: 'create_carousel',
  description: 'Planeja um carrossel profissional para redes sociais: slides com textos curtos, imagens e legenda.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING', description: 'Nome interno do carrossel (curto).' },
      format: { type: 'STRING', enum: Object.keys(FORMATS) },
      style: { type: 'STRING', enum: STYLES, description: 'editorial (revistas, marcas, lifestyle), bold (impacto, vendas, esportes), minimal (sóbrio, consultoria, educação), dark (tecnologia, premium, noite), gradient (criativo, jovem, eventos).' },
      fonts: { type: 'STRING', enum: FONT_PAIRS, description: 'classic (serifada elegante), modern (geométrica forte), tech (técnica), elegant (luxo, moda, gastronomia).' },
      palette: { type: 'OBJECT', properties: {
        background: { type: 'STRING', description: 'Hex #rrggbb' }, surface: { type: 'STRING' }, text: { type: 'STRING' }, muted: { type: 'STRING' }, accent: { type: 'STRING' }
      } },
      imageStyle: { type: 'STRING', description: 'Em inglês: direção de arte única de TODAS as imagens geradas (luz, lente, paleta, clima), para o carrossel ficar coeso.' },
      handle: { type: 'STRING', description: '@ do perfil, se o usuário informou. Nunca invente.' },
      brand: { type: 'STRING', description: 'Nome da marca/autor, se informado.' },
      caption: { type: 'STRING', description: 'Legenda do post no idioma do pedido: gancho na 1ª linha, desenvolvimento curto, chamada para ação.' },
      hashtags: { type: 'ARRAY', items: { type: 'STRING' } },
      slides: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: {
          kind: { type: 'STRING', enum: KINDS },
          kicker: { type: 'STRING', description: 'Rótulo curto acima do título (máx. 4 palavras).' },
          title: { type: 'STRING', description: 'Título do slide (máx. ~9 palavras na capa, ~12 nos demais).' },
          body: { type: 'STRING', description: 'Texto de apoio (máx. ~35 palavras).' },
          bullets: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Para kind=list: 3 a 5 itens curtos.' },
          statValue: { type: 'STRING', description: 'kind=stat: número/valor de destaque (só dados reais ou fornecidos).' },
          statLabel: { type: 'STRING' },
          quote: { type: 'STRING' }, author: { type: 'STRING' },
          imageSource: { type: 'STRING', enum: ['none', 'generate', 'user'] },
          userImage: { type: 'INTEGER', description: 'Número da IMAGEM DO USUÁRIO (1, 2, 3...) quando imageSource=user.' },
          imagePrompt: { type: 'STRING', description: 'Em inglês, quando imageSource=generate: cena concreta e detalhada, sem texto/letras na imagem.' },
          imagePlacement: { type: 'STRING', enum: PLACEMENTS, description: 'full (foto ocupa o slide, texto sobre degradê), top (foto em cima, texto embaixo), background (foto escurecida atrás do texto), none.' }
        }, required: ['kind', 'title'] }
      }
    },
    required: ['title', 'slides', 'caption']
  }
};

const LANG_NAMES = { pt: 'português do Brasil', es: 'espanhol', en: 'inglês', fr: 'francês', it: 'italiano', de: 'alemão' };

export function carouselPlannerPrompt(request, { lang = 'pt', format = 'portrait', checklistText = '', userImages = 0, existingUserImages = 0, previous = null, draft = null, issues = [], maxImages = 5 } = {}) {
  const size = FORMATS[format] || FORMATS.portrait;
  return [
    previous
      ? `EDITE o carrossel abaixo conforme o pedido. Mude SOMENTE o que o pedido manda; mantenha todo o resto idêntico (textos, ordem, cores, imagens: mantenha imageSource/userImage/imagePrompt dos slides que não mudaram).\nCARROSSEL ATUAL (JSON):\n${JSON.stringify(previous)}\n\nPEDIDO DE MUDANÇA: ${request}`
      : `PEDIDO DO USUÁRIO (leia cada palavra): ${request}`,
    draft ? `\nSEU PLANO ANTERIOR (JSON) — refaça-o corrigindo TODOS os problemas listados no final, mantendo o que já estava bom:\n${JSON.stringify(draft)}` : '',
    '',
    `Crie o plano chamando create_carousel. Formato ${format} ${size.label}. Idioma de TODOS os textos, legenda e hashtags: ${LANG_NAMES[lang] || lang}.`,
    checklistText,
    'REGRAS DE UM CARROSSEL PROFISSIONAL:',
    '- Quantidade: se o usuário disse quantos slides, use exatamente esse número. Senão, 6 a 8 slides.',
    '- Slide 1 = capa (kind cover) com um gancho forte que faça a pessoa deslizar; último slide = chamada para ação (kind cta: salvar, compartilhar, seguir, comentar, link na bio...), a menos que o usuário peça outra coisa.',
    '- Um assunto por slide; frases curtas e concretas, sem enrolação nem frases genéricas. Títulos com no máx. ~12 palavras, textos com no máx. ~35 palavras.',
    '- Conteúdo verdadeiro e específico do tema pedido. Não invente números, preços, depoimentos, nomes ou @; use statValue só com dado conhecido/fornecido.',
    '- Varie os tipos (content, list, stat, quote, image) para dar ritmo, mantendo a mesma identidade visual em todos.',
    '- Paleta coerente com o tema e com as cores pedidas; contraste alto entre texto e fundo.',
    existingUserImages
      ? `- As IMAGENS DO USUÁRIO 1..${existingUserImages} já estão no carrossel (não são reenviadas)${userImages > existingUserImages ? `; as que ele anexou agora são as IMAGENS DO USUÁRIO ${existingUserImages + 1}..${userImages}, use-as onde o pedido mandar` : ''}. Mantenha imageSource/userImage dos slides que não mudam.`
      : userImages
      ? `- O usuário enviou ${userImages} imagem(ns) (IMAGEM DO USUÁRIO 1..${userImages}, anexadas na ordem). Use TODAS, cada uma no slide em que melhor encaixa pelo conteúdo dela (imageSource=user, userImage=N). Se ele disse em qual slide vai cada foto, obedeça. Só gere imagens novas (imageSource=generate) se ele pedir ou se faltar imagem para a capa.`
      : `- Imagens: use imageSource=generate nos slides que ganham com foto (sempre na capa), no máx. ${maxImages} imagens no total. imagePrompt em inglês, concreto (sujeito, ação, cenário, luz, enquadramento), sem texto, letras, logotipos ou marcas d'água; respeite o imageStyle comum.`,
    '- imagePlacement: capa com foto = full; slides de conteúdo com foto = top ou background; listas e stats normalmente sem foto.',
    '- Legenda pronta para postar no idioma do pedido + 5 a 10 hashtags relevantes (a menos que o usuário peça sem hashtags).',
    issues.length ? `\nO PLANO ANTERIOR TINHA ESTES PROBLEMAS — corrija todos:\n${issues.map(i => `- ${i}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');
}

const HEX = /^#[0-9a-f]{6}$/i;
const hex = v => {
  const s = String(v || '').trim();
  if (HEX.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s.slice(1).split('').map(c => c + c).join('')).toLowerCase();
  return null;
};
export function luminance(h) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

const STYLE_PALETTES = {
  editorial: { background: '#f4efe6', surface: '#e9e1d3', text: '#1d1a16', muted: '#6f665a', accent: '#c2562b' },
  bold: { background: '#111111', surface: '#1f1f1f', text: '#ffffff', muted: '#bdbdbd', accent: '#ffcc00' },
  minimal: { background: '#ffffff', surface: '#f2f3f5', text: '#14161a', muted: '#6b7280', accent: '#2563eb' },
  dark: { background: '#0c0f17', surface: '#161b27', text: '#f5f7fb', muted: '#9aa3b5', accent: '#7c5cff' },
  gradient: { background: '#1b1240', surface: '#2a1d5e', text: '#ffffff', muted: '#cfc7f2', accent: '#ff5fa2' }
};

function hsl(h) {
  const [r, g, b] = [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const sat = d / (1 - Math.abs(2 * l - 1));
  const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (hue * 60 + 360) % 360, s: sat, l };
}
/** Duas cores "são a mesma cor" para o usuário (mesmo tom, luminosidade parecida). */
export function sameColor(a, b) {
  const x = hsl(a), y = hsl(b);
  const chromatic = x.s > 0.18 && y.s > 0.18 && x.l > 0.08 && y.l > 0.08 && x.l < 0.94 && y.l < 0.94;
  if (chromatic) return Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h)) < 24 && Math.abs(x.l - y.l) < 0.32;
  return Math.abs(x.l - y.l) < 0.1 && Math.abs(x.s - y.s) < 0.35;
}

function fixPalette(raw = {}, style, requestedColors = []) {
  const base = STYLE_PALETTES[style] || STYLE_PALETTES.editorial;
  const p = {};
  for (const k of Object.keys(base)) p[k] = hex(raw[k]) || base[k];
  // Cores pedidas pelo usuário precisam aparecer de verdade (fundo e destaque são o que mais se vê).
  const wanted = requestedColors.map(c => hex(c) || COLOR_HEX[c]).filter(Boolean);
  const isWanted = v => wanted.some(w => sameColor(w, v));
  for (const c of wanted) {
    if ([p.background, p.accent, p.text].some(v => sameColor(v, c))) continue;
    const { l } = hsl(c);
    const extreme = l < 0.2 || l > 0.82;
    if (extreme && !isWanted(p.background)) p.background = c;
    else if (extreme && contrast(c, p.background) >= 4.5) p.text = c;
    else if (!isWanted(p.accent)) p.accent = c;
    else if (!isWanted(p.background)) p.background = c;
    else p.surface = c;
  }
  // Texto legível no fundo, cor de apoio coerente e destaque visível.
  const dark = luminance(p.background) < 0.35;
  if (contrast(p.text, p.background) < 4.5) p.text = dark ? '#ffffff' : '#141414';
  if (contrast(p.muted, p.background) < 3.2) p.muted = mix(p.text, p.background, 0.3);
  if (contrast(p.surface, p.background) < 1.08 || contrast(p.surface, p.text) < 4.5) p.surface = mix(p.background, p.text, dark ? 0.1 : 0.06);
  if (contrast(p.accent, p.background) < 1.8 && !isWanted(p.accent)) p.accent = mix(p.accent, dark ? '#ffffff' : '#000000', 0.4);
  return p;
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const clean = (v, max = 400) => String(v ?? '').replace(EMOJI, '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Plano cru (de qualquer modelo) → plano seguro e completo. */
export function normalizeCarouselSpec(raw = {}, { format = 'portrait', lang = 'pt', checklist = null, userImages = 0, mustUse = null, maxImages = 5 } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const style = STYLES.includes(r.style) ? r.style : 'editorial';
  const fmt = FORMATS[format] ? format : FORMATS[r.format] ? r.format : 'portrait';
  let slides = (Array.isArray(r.slides) ? r.slides : []).filter(s => s && typeof s === 'object').slice(0, 20).map((s, i) => {
    const kind = KINDS.includes(s.kind) ? s.kind : i === 0 ? 'cover' : Array.isArray(s.bullets) && s.bullets.length ? 'list' : 'content';
    let source = ['none', 'generate', 'user'].includes(s.imageSource) ? s.imageSource : (s.imagePrompt ? 'generate' : 'none');
    let userImage = Number.isInteger(Number(s.userImage)) ? Number(s.userImage) : null;
    if (source === 'user' && (!userImage || userImage < 1 || userImage > userImages)) source = userImages ? 'user' : (s.imagePrompt ? 'generate' : 'none');
    if (source === 'user' && (!userImage || userImage > userImages)) userImage = null;
    const prompt = clean(s.imagePrompt, 600);
    if (source === 'generate' && !prompt) source = 'none';
    let placement = PLACEMENTS.includes(s.imagePlacement) ? s.imagePlacement : null;
    if (source === 'none') placement = 'none';
    else if (!placement || placement === 'none') placement = kind === 'cover' || kind === 'image' ? 'full' : 'top';
    return {
      kind, kicker: clean(s.kicker, 40), title: clean(s.title, 160), body: clean(s.body, 420),
      bullets: (Array.isArray(s.bullets) ? s.bullets : []).map(b => clean(b, 140)).filter(Boolean).slice(0, 6),
      statValue: clean(s.statValue, 18), statLabel: clean(s.statLabel, 90), quote: clean(s.quote, 260), author: clean(s.author, 60),
      imageSource: source, userImage, imagePrompt: prompt, imagePlacement: placement,
      assetId: typeof s.assetId === 'string' && /^[0-9a-f-]{36}$/i.test(s.assetId) ? s.assetId : null
    };
  }).filter(s => s.title || s.body || s.bullets.length || s.quote || s.statValue);

  // Tipos coerentes com o conteúdo.
  for (const s of slides) {
    if (s.kind === 'list' && s.bullets.length < 2) s.kind = 'content';
    if (s.kind === 'stat' && !s.statValue) s.kind = 'content';
    if (s.kind === 'quote' && !s.quote) { s.quote = s.body || s.title; }
  }
  if (slides.length && slides[0].kind !== 'cover') slides[0].kind = 'cover';

  // Todas as fotos do usuário usadas (as que o modelo esqueceu vão para slides sem imagem, capa primeiro).
  if (userImages) {
    const used = new Set(slides.filter(s => s.imageSource === 'user' && s.userImage).map(s => s.userImage));
    for (const s of slides) if (s.imageSource === 'user' && !s.userImage) {
      const next = Array.from({ length: userImages }, (_, i) => i + 1).find(n => !used.has(n));
      if (next) { s.userImage = next; used.add(next); } else { s.imageSource = 'none'; s.imagePlacement = 'none'; }
    }
    for (const n of mustUse || Array.from({ length: userImages }, (_, k) => k + 1)) {
      if (used.has(n)) continue;
      const target = slides.find(s => s.imageSource === 'none' && s.kind !== 'cta' && s.kind !== 'stat') || slides.find(s => s.imageSource === 'generate');
      if (!target) break;
      Object.assign(target, { imageSource: 'user', userImage: n, imagePlacement: target.kind === 'cover' ? 'full' : 'top' });
      used.add(n);
    }
  }
  // Teto de imagens geradas (cota do Cloudflare): mantém a capa e as primeiras.
  let generated = 0;
  for (const s of slides) {
    if (s.imageSource !== 'generate' || s.assetId) continue;
    if (++generated > maxImages) { s.imageSource = 'none'; s.imagePlacement = 'none'; }
  }

  const fonts = FONT_PAIRS.includes(r.fonts) ? r.fonts : style === 'editorial' ? 'classic' : style === 'minimal' ? 'modern' : style === 'dark' ? 'tech' : 'modern';
  const handleWanted = checklist?.handles?.[0] || null;
  const handle = handleWanted || (/^@[a-z0-9_.]{2,30}$/i.test(String(r.handle || '').trim()) ? String(r.handle).trim() : '');
  const noHashtags = checklist?.forbidden?.some(f => /hashtag/i.test(f));
  let hashtags = (Array.isArray(r.hashtags) ? r.hashtags : String(r.hashtags || '').split(/[\s,]+/))
    .map(h => String(h || '').trim().replace(/^#?/, '#').replace(/[^#\p{L}\p{N}_]/gu, '')).filter(h => h.length > 2);
  for (const h of checklist?.hashtags || []) if (!hashtags.some(x => x.toLowerCase() === h.toLowerCase())) hashtags.unshift(h);
  hashtags = noHashtags ? [] : [...new Set(hashtags)].slice(0, 15);
  const keepEmoji = !checklist?.forbidden?.some(f => /emoji/i.test(f));
  const caption = String(r.caption || '').replace(keepEmoji ? /$^/ : EMOJI, '').replace(noHashtags ? /(^|\s)#[\p{L}\p{N}_]+/gu : /$^/, '$1').trim().slice(0, 2200);

  return {
    title: clean(r.title, 80) || slides[0]?.title?.slice(0, 60) || 'Carrossel',
    format: FORMATS[fmt] ? fmt : 'portrait', lang, style, fonts,
    palette: fixPalette(r.palette || {}, style, checklist?.colors || []),
    imageStyle: clean(r.imageStyle, 300),
    handle, brand: clean(r.brand, 40), caption, hashtags, slides
  };
}

export const carouselText = spec => [
  spec.handle, spec.brand, spec.caption, spec.hashtags.join(' '),
  ...spec.slides.flatMap(s => [s.kicker, s.title, s.body, ...s.bullets, s.statValue, s.statLabel, s.quote, s.author])
].filter(Boolean).join('\n');

/** Problemas do plano frente ao pedido; a lista volta ao modelo para correção. */
export function inspectCarousel(spec, { checklist = null, detectLang = null, lang = 'pt', userImages = 0, overflow = [] } = {}) {
  const issues = [];
  if (spec.slides.length < 3) issues.push(`o carrossel tem só ${spec.slides.length} slide(s); faça um carrossel completo`);
  const images = spec.slides.filter(s => s.imageSource !== 'none').length;
  // "use minhas duas fotos" descreve as fotos anexadas, não o total de imagens do carrossel.
  const qtyChecklist = checklist && { ...checklist, quantities: checklist.quantities.filter(q => !(q.unit === 'imagens' && userImages && q.n === userImages)) };
  issues.push(...checklistIssues(carouselText(spec), qtyChecklist, { slides: spec.slides.length, imagens: images }));
  spec.slides.forEach((s, i) => {
    if (!s.title && s.kind !== 'quote' && s.kind !== 'image') issues.push(`o slide ${i + 1} está sem título`);
    if (s.title.split(/\s+/).length > (s.kind === 'cover' ? 14 : 16)) issues.push(`o título do slide ${i + 1} é longo demais para um carrossel (encurte para no máx. ~12 palavras)`);
    if (s.body.split(/\s+/).length > 48) issues.push(`o texto do slide ${i + 1} é longo demais (máx. ~35 palavras)`);
  });
  for (const o of overflow) issues.push(o);
  if (!spec.caption || spec.caption.length < 40) issues.push('falta a legenda do post (gancho + desenvolvimento + chamada para ação)');
  if (detectLang) {
    const body = spec.slides.map(s => [s.title, s.body, ...s.bullets].join(' ')).join(' ');
    const got = detectLang(body, lang);
    if (body.length > 120 && got !== lang) issues.push(`os textos estão em ${got}, mas o pedido exige ${lang}`);
  }
  if (userImages) {
    const used = new Set(spec.slides.filter(s => s.imageSource === 'user').map(s => s.userImage));
    if (used.size < userImages) issues.push(`o usuário enviou ${userImages} imagem(ns) e só ${used.size} foram usadas`);
  }
  return [...new Set(issues)];
}

/** Plano mínimo e honesto quando nenhum modelo respondeu (nunca deixa o usuário sem nada). */
export function fallbackCarousel(request, { lang = 'pt' } = {}) {
  const topic = String(request).replace(/^.*?(?:sobre|acerca de|about)\s+/i, '').split(/[,.;\n]/)[0].slice(0, 80) || 'Seu tema';
  const t = { pt: ['Guia rápido', 'Comece por aqui', 'Salve para consultar depois'], es: ['Guía rápida', 'Empieza por aquí', 'Guárdalo para después'], en: ['Quick guide', 'Start here', 'Save it for later'] }[lang] || [];
  return { title: topic, slides: [{ kind: 'cover', kicker: t[0], title: topic }, { kind: 'cta', title: t[2] }], caption: '' };
}
