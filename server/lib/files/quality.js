// KIRA_FILES_QUALITY_V1 — confere o conteúdo planejado ANTES de montar o arquivo.
// Cada problema vira uma instrução objetiva para a nova tentativa do modelo.
import { normalizeText } from '../requirements.js';
import { langOf, specLanguage } from './language.js';
import { FORMATS } from './spec.js';
import { parseNumber } from './values.js';

const PLACEHOLDER = /lorem ipsum|\b(?:texto|t[ií]tulo|item|produto|coluna|nome|valor) \d+\b|\[(?:inserir|insert|nome|data|texto)[^\]]*\]|xxx+|a definir|to be defined|tbd\b|\.\.\.$/i;

// Quantidades pedidas: "10 slides", "20 produtos", "3 abas", "5 seções", "15 linhas".
export function requestedCounts(request = '') {
  const t = normalizeText(request);
  const counts = {};
  const grab = (re, key) => { const m = t.match(re); if (m) counts[key] = Math.max(counts[key] || 0, Number(m[1])); };
  grab(/\b(\d{1,3})\s*(?:slides?|diapositivas?|laminas?|telas?)\b/, 'slides');
  grab(/\b(\d{1,3})\s*(?:abas?|hojas?|sheets?|tabs?)\b/, 'sheets');
  grab(/\b(\d{1,3})\s*(?:secoes|secciones|sections?|capitulos?|chapters?|topicos|temas)\b/, 'sections');
  grab(/\b(\d{1,4})\s*(?:linhas?|filas?|rows?|registros?|records?|lancamentos?|entradas?)\b/, 'rows');
  grab(/\b(\d{1,4})\s*(?:produtos?|productos?|products?|itens|items?|clientes?|alunos?|alumnos?|funcionarios?|empleados?|employees?|tarefas?|tareas?|tasks?|perguntas?|preguntas?|questions?|receitas?|recetas?|recipes?|despesas?|gastos?|expenses?|dias?|days?|semanas?|weeks?|meses|months?|pratos?|platos?|livros?|libros?|books?|filmes?|peliculas?|movies?|exercicios?|ejercicios?|exercises?)\b/, 'items');
  grab(/\b(\d{1,3})\s*(?:paginas?|pages?|folhas?)\b/, 'pages');
  return counts;
}

const allText = spec => [spec.title, spec.subtitle,
  ...spec.blocks.flatMap(b => [b.text, ...b.items, ...b.headers, ...b.rows.flat()]),
  ...spec.slides.flatMap(s => [s.title, s.subtitle, ...s.bullets, s.leftTitle, ...s.left, s.rightTitle, ...s.right, ...s.stats.flatMap(x => [x.value, x.label]), ...s.steps.flatMap(x => [x.title, x.text]), ...s.headers, ...s.rows.flat(), s.quote, s.notes]),
  ...spec.sheets.flatMap(s => [s.name, s.description, ...s.columns.map(c => c.header), ...s.rows.flat()])
].filter(Boolean).join('\n');

export function inspectFileSpec(spec, request, { lang = 'pt', requirements = [] } = {}) {
  const issues = [];
  const L = langOf(lang);
  const kind = FORMATS[spec.format].kind;
  const counts = requestedCounts(request);

  // Idioma
  const detected = specLanguage(spec);
  if (detected && detected !== lang) issues.push(`O conteúdo está em ${langOf(detected).name}, mas o pedido foi feito em ${L.name}. Reescreva TODO o conteúdo (títulos, textos, colunas, notas, nome do arquivo) em ${L.name}.`);

  // Quantidades
  if (kind === 'presentation') {
    const n = spec.slides.length;
    if (counts.slides && Math.abs(n - counts.slides) > 0) issues.push(`O usuário pediu ${counts.slides} slides e há ${n}. Entregue exatamente ${counts.slides}.`);
    else if (!counts.slides && n < 6) issues.push(`A apresentação tem só ${n} slides; faça de 8 a 12 cobrindo o assunto por completo.`);
    spec.slides.forEach((s, i) => {
      const body = s.bullets.length + s.left.length + s.right.length + s.stats.length + s.steps.length + s.rows.length + (s.quote ? 1 : 0);
      if (!['title', 'section', 'closing'].includes(s.layout) && body === 0) issues.push(`Slide ${i + 1} ("${s.title}") está sem conteúdo.`);
      if (!s.notes || s.notes.split(/\s+/).length < 15) issues.push(`Slide ${i + 1} ("${s.title}") precisa de anotações do apresentador com pelo menos 2 frases.`);
      if (s.layout === 'two-column' && (!s.left.length || !s.right.length)) issues.push(`Slide ${i + 1} (comparação) tem uma das colunas vazia.`);
    });
    if (n >= 3 && spec.slides[0]?.layout !== 'title') issues.push('O primeiro slide deve usar o layout title (capa).');
    if (n >= 3 && spec.slides[n - 1]?.layout !== 'closing') issues.push('O último slide deve usar o layout closing (agradecimento, próximos passos ou contato).');
  }
  if (kind === 'spreadsheet') {
    if (counts.sheets && spec.sheets.length < counts.sheets) issues.push(`O usuário pediu ${counts.sheets} abas e há ${spec.sheets.length}.`);
    const maxRows = Math.max(0, ...spec.sheets.map(s => s.rows.length));
    const wanted = counts.rows || counts.items;
    if (wanted && maxRows < wanted) issues.push(`O usuário pediu ${wanted} linhas/itens e a maior aba tem ${maxRows}. Inclua todos.`);
    for (const sheet of spec.sheets) {
      if (sheet.rows.length < 3) issues.push(`A aba "${sheet.name}" tem só ${sheet.rows.length} linha(s) de dados; inclua dados completos.`);
      const width = sheet.columns.length;
      const ragged = sheet.rows.filter(r => r.slice(0, width).filter(c => String(c).trim()).length < width).length;
      if (ragged >= Math.max(1, Math.ceil(sheet.rows.length * 0.15))) issues.push(`A aba "${sheet.name}" tem ${ragged} linhas com várias células vazias; preencha todas as colunas.`);
      sheet.columns.forEach((c, ci) => {
        if (!['number', 'integer', 'currency', 'percent'].includes(c.type)) return;
        const bad = sheet.rows.filter(r => r[ci] && !String(r[ci]).startsWith('=') && parseNumber(r[ci]) == null).length;
        if (bad) issues.push(`Na aba "${sheet.name}", a coluna "${c.header}" é numérica mas tem ${bad} valor(es) em texto; use só números (ou fórmulas).`);
      });
    }
  }
  if (kind === 'document') {
    const sections = spec.blocks.filter(b => b.type === 'heading' && b.level === 1).length;
    const words = spec.blocks.reduce((n, b) => n + `${b.text} ${b.items.join(' ')}`.split(/\s+/).filter(Boolean).length, 0);
    if (counts.sections && sections < counts.sections) issues.push(`O usuário pediu ${counts.sections} seções e há ${sections}.`);
    if (counts.items) {
      const maxList = Math.max(0, ...spec.blocks.map(b => Math.max(b.items.length, b.rows.length)));
      if (maxList < counts.items) issues.push(`O usuário pediu ${counts.items} itens e a maior lista/tabela tem ${maxList}.`);
    }
    const minWords = counts.pages ? counts.pages * 350 : 450;
    if (words < minWords) issues.push(`O documento tem ~${words} palavras; desenvolva o conteúdo (mínimo ~${minWords}), com parágrafos completos em cada seção.`);
    if (sections < 2 && words > 200) issues.push('Organize o documento em seções com títulos (heading level 1).');
    spec.blocks.forEach(b => {
      if (b.type === 'table' && b.rows.some(r => r.length < Math.max(1, b.headers.length) || r.some(c => !String(c).trim()))) issues.push(`A tabela "${b.headers.slice(0, 3).join(' / ')}" tem células vazias; preencha todas.`);
    });
  }

  // Placeholders
  const text = allText(spec);
  const ph = text.split('\n').filter(line => PLACEHOLDER.test(line)).slice(0, 3);
  if (ph.length) issues.push(`Há texto de preenchimento/placeholder (ex.: "${ph[0].slice(0, 60)}"); troque por conteúdo real.`);

  // Requisitos do pedido presentes no conteúdo
  const hay = normalizeText(text);
  // Palavras que só descrevem o tipo de arquivo não contam como conteúdo pedido.
  const META = /^(?:presenta|apresenta|diapositiv|slide|planilh|hoja|excel|word|pdf|powerpoint|pptx|docx|xlsx|csv|arquiv|archiv|document|pagin|tabel|tabla|aba|arquivo|lamina|deck|relatori|report|informe)/;
  const missing = requirements
    .filter(r => r.kind !== 'quantity')
    .map(r => ({ ...r, terms: r.terms.filter(term => !META.test(term)) }))
    .filter(r => r.terms.length && r.terms.filter(term => hay.includes(term)).length < Math.max(1, Math.ceil(r.terms.length / 2)));
  for (const r of missing.slice(0, 8)) issues.push(`Falta o item pedido: "${r.text}".`);

  return [...new Set(issues)].slice(0, 20);
}
