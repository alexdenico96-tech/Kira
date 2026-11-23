// KIRA_CHECKLIST_V1
// "Entender cada palavra": antes de responder, o pedido vira um checklist do que é obrigatório
// (textos exatos, quantidades, proibições, cores, idioma, plataforma, @/links, partes da pergunta).
// O checklist entra no prompt de TODAS as chamadas da requisição e também é conferido por código
// nos arquivos e carrosséis gerados.

import { normalizeText } from './requirements.js';

const NUMBER_WORDS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, vinte: 20,
  uno: 1, dos: 2, cuatro: 4, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12
};
const NUM = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})`;
const UNITS = {
  slides: 'slides?|l[aâ]minas?|telas?|cards?|diapositivas?|p[aá]ginas?|pages?',
  imagens: 'imagens?|fotos?|images?|im[aá]genes|photos?|ilustra[cç](?:[aã]o|[oõ]es)',
  topicos: 't[oó]picos?|itens?|pontos?|dicas?|passos?|etapas?|ideias?|exemplos?|motivos?|razones|razoes|raz[oõ]es|tips?|steps?|items?|points?|consejos?|pasos?|perguntas?|preguntas?|questions?',
  palavras: 'palavras?|palabras?|words?',
  linhas: 'linhas?|l[ií]neas?|lines?|frases?|par[aá]grafos?|paragraphs?|sentences?',
  colunas: 'colunas?|columnas?|columns?',
  opcoes: 'op[cç](?:[aã]o|[oõ]es)|opciones|options?|alternativas?|vers[oõ]es|versiones|versions?|varia[cç](?:[aã]o|[oõ]es)'
};

const COLORS = {
  azul: 'azul', blue: 'azul', vermelho: 'vermelho', rojo: 'vermelho', red: 'vermelho', verde: 'verde', green: 'verde',
  amarelo: 'amarelo', amarillo: 'amarelo', yellow: 'amarelo', laranja: 'laranja', naranja: 'laranja', orange: 'laranja',
  roxo: 'roxo', violeta: 'roxo', lilas: 'lilás', morado: 'roxo', purple: 'roxo', rosa: 'rosa', pink: 'rosa',
  preto: 'preto', negro: 'preto', black: 'preto', branco: 'branco', blanco: 'branco', white: 'branco',
  cinza: 'cinza', gris: 'cinza', gray: 'cinza', grey: 'cinza', dourado: 'dourado', dorado: 'dourado', gold: 'dourado',
  prata: 'prata', plateado: 'prata', silver: 'prata', marrom: 'marrom', marron: 'marrom', brown: 'marrom', bege: 'bege', beige: 'bege',
  turquesa: 'turquesa', ciano: 'ciano', cyan: 'ciano', vinho: 'vinho', bordo: 'vinho', coral: 'coral', creme: 'creme', crema: 'creme', cream: 'creme', neon: 'neon'
};
export const COLOR_HEX = {
  azul: '#2563eb', vermelho: '#dc2626', verde: '#16a34a', amarelo: '#facc15', laranja: '#f97316', roxo: '#7c3aed', 'lilás': '#c4b5fd',
  rosa: '#ec4899', preto: '#0b0b0f', branco: '#ffffff', cinza: '#6b7280', dourado: '#d4a017', prata: '#c0c0c8', marrom: '#7c4a2d',
  bege: '#e8dcc4', turquesa: '#14b8a6', ciano: '#06b6d4', vinho: '#7f1d3a', coral: '#ff6f61', creme: '#f6efe2', neon: '#39ff88'
};

const LANGS = [
  [/\b(em|para o|para|no) ingl[eê]s\b|\bin english\b|\ben ingl[eé]s\b/i, 'en', 'inglês'],
  [/\b(em|para o|para|no) espanhol\b|\ben (espa[nñ]ol|castellano)\b|\bin spanish\b/i, 'es', 'espanhol'],
  [/\b(em|para o|para) portugu[eê]s\b|\ben portugu[eé]s\b|\bin portuguese\b/i, 'pt', 'português'],
  [/\b(em|para o|para) franc[eê]s\b|\ben franc[eé]s\b|\bin french\b/i, 'fr', 'francês'],
  [/\b(em|para o|para) italiano\b|\ben italiano\b|\bin italian\b/i, 'it', 'italiano'],
  [/\b(em|para o|para) alem[aã]o\b|\ben alem[aá]n\b|\bin german\b/i, 'de', 'alemão']
];
const PLATFORMS = [
  [/\binstagram\b|\binsta\b|\big\b/i, 'Instagram'], [/\blinked ?in\b/i, 'LinkedIn'], [/\btik ?tok\b/i, 'TikTok'],
  [/\bstor(y|ies)\b|\bhistorias\b/i, 'Stories'], [/\bfacebook\b/i, 'Facebook'], [/\bpinterest\b/i, 'Pinterest'],
  [/\bx\.com\b|\btwitter\b/i, 'X/Twitter'], [/\bwhats ?app\b/i, 'WhatsApp'], [/\byoutube\b/i, 'YouTube']
];
const TONES = [
  [/\bformal\b/i, 'formal'], [/\binformal\b|\bdescontra[ií]d[oa]\b|\bdescontra[ií]do\b|\bcasual\b/i, 'descontraído'],
  [/\bprofissional\b|\bprofesional\b|\bprofessional\b|\bcorporativ[oa]\b/i, 'profissional'],
  [/\bdivertid[oa]\b|\bengra[cç]ad[oa]\b|\bfunny\b|\bhumor\b/i, 'divertido'], [/\bminimalista\b|\bminimal(ist)?\b|\bclean\b|\blimp[oa]\b/i, 'minimalista'],
  [/\bluxo\b|\bluxuos[oa]\b|\bpremium\b|\belegante\b|\bsofisticad[oa]\b|\blujo(so)?\b/i, 'elegante/premium'],
  [/\bcriancas\b|\binfantil\b|\bkids\b|\bni[nñ]os\b/i, 'para crianças'], [/\bt[eé]cnic[oa]\b|\btechnical\b/i, 'técnico'],
  [/\bpersuasiv[oa]\b|\bvend(a|er|edor)\b|\bconvers[aã]o\b|\bsales\b/i, 'persuasivo/vendas'], [/\beducativ[oa]\b|\bdid[aá]tic[oa]\b|\beducational\b/i, 'educativo'],
  [/\bemocional\b|\binspirador[a]?\b|\bmotivacional\b/i, 'inspirador']
];

// Proibições: "sem X", "não use X", "evite X", "nada de X", "sin X", "no uses X", "without X", "don't X".
const NEGATION = /(?:^|[\s,;.(])(?:sem|sin|without|nada de|evite|evitar|evita|no uses?|no incluyas|no pongas|n[aã]o (?:use|usar|coloque|colocar|quero|ponha|p[oô]r|inclua|incluir|mostre|mostrar|tenha|ter|adicione|adicionar|fa[cç]a|escreva)|don'?t (?:use|include|add|put|show)|do not (?:use|include|add|put|show)|avoid|no)\s+([^,.;!?\n]{2,60})/gi;
const NEG_STOP = /\s+(?:e|y|and|mas|pero|but|com|con|with|para|por|que|porque|pois)\s+.*$/i;

const fold = s => normalizeText(s).replace(/\s+/g, ' ').trim();

function quotedTexts(text) {
  const out = [];
  const re = /"([^"\n]{2,160})"|“([^”\n]{2,160})”|«([^»\n]{2,160})»|(?:^|[\s(:])'([^'\n]{3,160})'(?=[\s.,;:!?)]|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const value = (m[1] || m[2] || m[3] || m[4] || '').trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function quantities(text) {
  const out = [];
  for (const [unit, pattern] of Object.entries(UNITS)) {
    const re = new RegExp(`\\b${NUM}\\s+(?:(?:novas?|nuevas?|new|diferentes|different|principais|melhores|mejores|best|curt[oa]s|grandes|pequen[oa]s)\\s+)?(${pattern})\\b`, 'gi');
    let m;
    while ((m = re.exec(fold(text)))) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
      if (n && n <= 200 && !out.some(q => q.unit === unit)) out.push({ unit, n, words: m[0] });
    }
  }
  return out;
}

function negations(text) {
  const out = [];
  let m;
  NEGATION.lastIndex = 0;
  while ((m = NEGATION.exec(text))) {
    const word = m[0].trim().split(/\s+/)[0].toLowerCase();
    let what = m[1].replace(NEG_STOP, '').trim();
    // "no" sozinho só conta em espanhol/inglês com verbo conhecido; evita "no slide 3" (= "em o").
    if (word === 'no' && !/^(uses?|pongas|incluyas|quiero|text|emojis?|logos?)\b/i.test(what)) continue;
    if (/^(?:problema|d[uú]vida|duda|problem|issue|pressa|prisa)\b/i.test(what)) continue;
    what = what.split(/\s+/).slice(0, 6).join(' ');
    if (what.length >= 2 && !out.some(o => fold(o) === fold(what))) out.push(what);
  }
  return out;
}

function colors(text) {
  const t = fold(text);
  const out = [];
  for (const [word, name] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${word}s?\\b`).test(t) && !out.includes(name)) out.push(name);
  }
  for (const hex of text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []) if (!out.includes(hex)) out.push(hex);
  return out;
}

// Partes de uma pergunta composta ("o que é X? e como faço Y?" / listas numeradas).
function questionParts(text) {
  const clean = String(text).trim();
  const byLine = clean.split('\n').map(l => l.trim()).filter(l => /^(?:\d{1,2}[.)]|[-•*])\s+\S/.test(l));
  if (byLine.length >= 2) return byLine.map(l => l.replace(/^(?:\d{1,2}[.)]|[-•*])\s+/, ''));
  const qs = clean.split(/(?<=\?)\s+/).map(s => s.trim()).filter(s => s.length > 6 && /\?$/.test(s));
  return qs.length >= 2 ? qs : [];
}

/** Transforma o pedido no checklist estruturado. Determinístico (sem IA): rápido e sempre disponível. */
export function buildChecklist(message = '') {
  const text = String(message || '');
  const language = LANGS.find(([re]) => re.test(text));
  const platform = PLATFORMS.filter(([re]) => re.test(text)).map(([, name]) => name);
  const forbidden = negations(text);
  const forbiddenColors = colors(forbidden.join(' '));
  return {
    exact: quotedTexts(text),
    quantities: quantities(text),
    forbidden,
    colors: colors(text).filter(cn => !forbiddenColors.includes(cn)),
    language: language ? { code: language[1], name: language[2] } : null,
    platforms: platform,
    tones: TONES.filter(([re]) => re.test(text)).map(([, t]) => t),
    handles: [...new Set(text.match(/(?:^|\s)(@[a-z0-9_.]{2,30})/gi)?.map(h => h.trim().replace(/\.+$/, '')) || [])],
    links: [...new Set(text.match(/\bhttps?:\/\/[^\s)]+|\bwww\.[^\s)]+/gi) || [])],
    hashtags: [...new Set(text.match(/(?:^|\s)(#[\p{L}0-9_]{2,40})/giu)?.map(h => h.trim()).filter(h => !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) || [])],
    parts: questionParts(text)
  };
}

export function checklistSize(c) {
  if (!c) return 0;
  return c.exact.length + c.quantities.length + c.forbidden.length + c.colors.length + (c.language ? 1 : 0) +
    c.platforms.length + c.tones.length + c.handles.length + c.links.length + c.hashtags.length + c.parts.length;
}

const UNIT_LABEL = { slides: 'slides/páginas', imagens: 'imagens', topicos: 'itens/tópicos', palavras: 'palavras', linhas: 'linhas/frases', colunas: 'colunas', opcoes: 'opções/versões' };

/** Bloco para o prompt do sistema. Vazio quando o pedido não tem nada além do óbvio. */
export function checklistBlock(c) {
  if (!checklistSize(c)) return '';
  const lines = [];
  for (const e of c.exact) lines.push(`- Use EXATAMENTE este texto, sem traduzir nem mudar uma letra: "${e}"`);
  for (const q of c.quantities) lines.push(`- Quantidade pedida: exatamente ${q.n} ${UNIT_LABEL[q.unit]} ("${q.words}") — nem mais, nem menos`);
  for (const f of c.forbidden) lines.push(`- PROIBIDO: ${f} (o usuário pediu para não ter isso)`);
  if (c.colors.length) lines.push(`- Cores pedidas: ${c.colors.join(', ')} — devem aparecer de verdade no resultado`);
  if (c.language) lines.push(`- Idioma obrigatório do resultado: ${c.language.name}`);
  if (c.platforms.length) lines.push(`- Plataforma/destino: ${c.platforms.join(', ')} — respeite o formato e as boas práticas dela`);
  if (c.tones.length) lines.push(`- Tom/estilo pedido: ${c.tones.join(', ')}`);
  for (const h of c.handles) lines.push(`- Inclua o perfil ${h} exatamente assim`);
  for (const l of c.links) lines.push(`- Inclua o link ${l} exatamente assim`);
  if (c.hashtags.length) lines.push(`- Hashtags pedidas (use exatamente): ${c.hashtags.join(' ')}`);
  if (c.parts.length) lines.push(`- O pedido tem ${c.parts.length} partes; responda TODAS, na ordem:\n${c.parts.map((p, i) => `   ${i + 1}. ${p}`).join('\n')}`);
  return `CHECKLIST DO PEDIDO ATUAL (leia cada palavra; tudo abaixo é obrigatório e vale mais que qualquer padrão seu):\n${lines.join('\n')}\nAntes de terminar, confira item por item. Se algo for impossível, diga claramente qual item e por quê.`;
}

/**
 * Confere um resultado em texto contra o checklist.
 * @param {string} output   todo o texto visível do resultado
 * @param {object} c        checklist
 * @param {object} counts   contagens reais do resultado, ex.: { slides: 7, imagens: 3 }
 */
export function checklistIssues(output, c, counts = {}) {
  if (!c) return [];
  const issues = [];
  const body = fold(output);
  for (const e of c.exact) if (!body.includes(fold(e))) issues.push(`o texto exato "${e}" pedido pelo usuário não aparece`);
  for (const q of c.quantities) {
    const real = counts[q.unit];
    if (typeof real === 'number' && real !== q.n) issues.push(`o usuário pediu ${q.n} ${UNIT_LABEL[q.unit]} ("${q.words}") e o resultado tem ${real}`);
  }
  for (const f of c.forbidden) {
    const term = fold(f).split(' ').filter(w => w.length > 3).slice(0, 2).join(' ');
    if (term.length > 3 && body.includes(term) && !/^(emoji|imag|foto|texto|text|logo|hashtag)/.test(term)) issues.push(`o resultado contém "${f}", que o usuário proibiu`);
  }
  if (c.forbidden.some(f => /emoji/i.test(f)) && /\p{Extended_Pictographic}/u.test(output)) issues.push('o usuário pediu sem emojis e o resultado tem emojis');
  if (c.forbidden.some(f => /hashtag/i.test(f)) && /(^|\s)#[\p{L}]/u.test(output)) issues.push('o usuário pediu sem hashtags e o resultado tem hashtags');
  for (const h of c.handles) if (!body.includes(fold(h))) issues.push(`o perfil ${h} pedido não aparece`);
  for (const l of c.links) if (!body.includes(fold(l).replace(/^https?:\/\//, ''))) issues.push(`o link ${l} pedido não aparece`);
  for (const t of c.hashtags) if (!body.includes(fold(t))) issues.push(`a hashtag ${t} pedida não aparece`);
  return issues;
}
