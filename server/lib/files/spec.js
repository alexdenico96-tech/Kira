// KIRA_FILES_V1 — especificação comum dos arquivos gerados pela Kira.
// O modelo descreve o CONTEÚDO (blocos, planilhas, slides); o servidor monta o arquivo com acabamento profissional.
import { THEME_NAMES } from './themes.js';
import { langOf, CURRENCIES } from './language.js';

export const FORMATS = {
  pdf: { ext: 'pdf', mime: 'application/pdf', label: 'PDF', kind: 'document' },
  docx: { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word', kind: 'document' },
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel', kind: 'spreadsheet' },
  csv: { ext: 'csv', mime: 'text/csv; charset=utf-8', label: 'CSV', kind: 'spreadsheet' },
  pptx: { ext: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint', kind: 'presentation' }
};

const ACTION = /\b(crie|cria|criar|gere|gera|gerar|fa[cç]a|faz|fazer|monte|montar|prepare|preparar|elabore|elaborar|exporte|exportar|converta|converter|transforme|transformar|salve|salvar|escreva|me (?:manda|envia|d[aá])|quero|preciso|gostaria|crea|genera|haz|prepara|exporta|convierte|make|create|generate|export)\b/i;
const CODE_CONTEXT = /\b(site|landing|p[aá]gina web|web ?app|aplicativo|react|vue|html|css|javascript|typescript|componente|api|backend|frontend|projeto web)\b/i;

// Formato pedido explicitamente (ou null). Formato vence projeto quando o usuário nomeia o tipo de arquivo.
export function detectFileRequest(text = '') {
  const t = String(text);
  let format = null;
  if (/\b(power ?point|pptx|apresenta[cç](?:[aã]o|[oõ]es)|presentaci[oó]n|slides?|deck)\b/i.test(t)) format = 'pptx';
  else if (/\b(excel|xlsx|planilhas?|hoja de c[aá]lculo|spreadsheet)\b/i.test(t)) format = 'xlsx';
  else if (/\bcsv\b/i.test(t)) format = 'csv';
  else if (/\b(word|docx|\.doc\b|documento do word)\b/i.test(t)) format = 'docx';
  else if (/\bpdf\b/i.test(t)) format = 'pdf';
  if (!format) return null;
  if (!ACTION.test(t) && !/\b(em|en|in|como|para|formato)\s+(?:um |uma |un |una |a )?(?:arquivo )?(pdf|word|docx|excel|xlsx|csv|power ?point|pptx|planilha|apresenta)/i.test(t)) return null;
  // "crie um site com slides de fotos" é projeto; "apresentação sobre React" continua sendo arquivo.
  if (CODE_CONTEXT.test(t) && !/\b(pdf|word|docx|excel|xlsx|csv|power ?point|pptx|planilha|apresenta[cç][aã]o (?:de|sobre|para))\b/i.test(t)) return null;
  return { format };
}

const str = (v, max = 4000) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const list = (v, max = 40, len = 600) => (Array.isArray(v) ? v : []).map(x => str(x, len)).filter(Boolean).slice(0, max);
const grid = (rows, maxRows = 2000, maxCols = 40) => (Array.isArray(rows) ? rows : []).slice(0, maxRows)
  .map(r => (Array.isArray(r) ? r : [r]).slice(0, maxCols).map(c => str(c, 1000)));

const BLOCK_TYPES = ['heading', 'paragraph', 'bullets', 'numbered', 'table', 'quote', 'callout', 'pagebreak'];
const COLUMN_TYPES = ['text', 'number', 'integer', 'currency', 'percent', 'date'];
export const SLIDE_LAYOUTS = ['title', 'section', 'bullets', 'two-column', 'stats', 'timeline', 'table', 'quote', 'image', 'closing'];

export function safeFileName(name, ext) {
  const base = str(name || 'kira-arquivo', 120)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.(pdf|docx?|xlsx?|csv|pptx?)$/i, '')
    .replace(/[^a-z0-9 _-]+/gi, ' ').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 80);
  return `${base || 'kira-arquivo'}.${ext}`;
}

// Normaliza e limita o que o modelo devolveu. Nunca confia em formato/tamanho vindos do modelo.
// Modelos diferentes usam nomes diferentes ("points", "content", "speakerNotes", linhas como objetos...).
// Converte tudo para o formato da Kira antes de normalizar, para nenhum conteúdo se perder.
const asList = v => Array.isArray(v)
  ? v.map(x => (x && typeof x === 'object' ? (x.text ?? x.content ?? x.title ?? x.value ?? Object.values(x).join(' — ')) : x)).filter(x => x != null && String(x).trim())
  : typeof v === 'string' ? v.split(/\n+/).map(x => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean) : [];
const first = (...vals) => vals.find(v => v != null && v !== '');

export function coerceRawSpec(raw = {}) {
  const r = raw && typeof raw === 'object' ? { ...raw } : {};
  const nested = r.presentation || r.document || r.spreadsheet || r.file;
  if (nested && typeof nested === 'object') Object.assign(r, { ...nested, ...r });
  r.slides = first(r.slides, r.diapositivas, r.pages) || [];
  r.sheets = first(r.sheets, r.worksheets, r.tabs, r.abas, r.hojas) || [];
  r.blocks = first(r.blocks, r.content, r.body) || [];
  if (!Array.isArray(r.blocks) && typeof r.blocks === 'string') r.blocks = [{ type: 'paragraph', text: r.blocks }];
  // "sections": [{ title, content/paragraphs/bullets }]
  if ((!Array.isArray(r.blocks) || !r.blocks.length) && Array.isArray(r.sections)) {
    r.blocks = r.sections.flatMap(sec => [
      { type: 'heading', level: 1, text: first(sec.title, sec.heading, sec.titulo) },
      ...asList(first(sec.paragraphs, sec.content, sec.text)).map(text => ({ type: 'paragraph', text })),
      ...(sec.bullets || sec.items ? [{ type: 'bullets', items: asList(sec.bullets || sec.items) }] : [])
    ].filter(b => b.text || b.items?.length));
  }
  const BLOCK_ALIAS = { h1: ['heading', 1], h2: ['heading', 2], h3: ['heading', 3], title: ['heading', 1], subtitle: ['heading', 2], list: ['bullets'], ul: ['bullets'], bullet: ['bullets'], ol: ['numbered'], 'numbered-list': ['numbered'], p: ['paragraph'], text: ['paragraph'], note: ['callout'], tip: ['callout'], blockquote: ['quote'] };
  r.blocks = (Array.isArray(r.blocks) ? r.blocks : []).map(b => {
    if (typeof b === 'string') return { type: 'paragraph', text: b };
    const alias = BLOCK_ALIAS[String(b?.type || '').toLowerCase()];
    return {
      ...b,
      type: alias ? alias[0] : b?.type,
      level: first(b?.level, alias?.[1]),
      text: typeof first(b?.text, b?.content) === 'string' ? first(b?.text, b?.content) : b?.text,
      items: b?.items?.length ? asList(b.items) : asList(first(b?.list, b?.points, Array.isArray(b?.content) ? b.content : undefined))
    };
  });
  r.slides = (Array.isArray(r.slides) ? r.slides : []).map(sl => ({
    ...sl,
    layout: first(sl?.layout, sl?.type, sl?.kind),
    title: first(sl?.title, sl?.heading, sl?.titulo, sl?.titulo_slide),
    subtitle: first(sl?.subtitle, sl?.subheading, sl?.subtitulo),
    bullets: (sl?.bullets?.length ? asList(sl.bullets) : asList(first(sl?.points, sl?.items, sl?.content, sl?.body, sl?.text, sl?.puntos, sl?.topicos))),
    notes: first(sl?.notes, sl?.speakerNotes, sl?.speaker_notes, sl?.notas, sl?.presenterNotes),
    left: sl?.left?.length ? asList(sl.left) : asList(sl?.leftColumn?.items || sl?.leftColumn),
    right: sl?.right?.length ? asList(sl.right) : asList(sl?.rightColumn?.items || sl?.rightColumn)
  }));
  r.sheets = (Array.isArray(r.sheets) ? r.sheets : []).map(sh => {
    const columns = (Array.isArray(sh?.columns) ? sh.columns : Array.isArray(sh?.headers) ? sh.headers : []).map(c => (typeof c === 'string' ? { header: c } : { ...c, header: first(c?.header, c?.name, c?.title, c?.label) }));
    const headers = columns.map(c => c.header);
    const rows = (Array.isArray(sh?.rows) ? sh.rows : Array.isArray(sh?.data) ? sh.data : []).map(row =>
      Array.isArray(row) ? row : row && typeof row === 'object' ? headers.map(h => row[h] ?? row[String(h).toLowerCase()] ?? '') : [row]);
    return { ...sh, name: first(sh?.name, sh?.title, sh?.nombre), columns, rows };
  });
  return r;
}

export function normalizeSpec(input = {}, format, { lang = 'pt', currency } = {}) {
  const raw = coerceRawSpec(input);
  const L = langOf(lang);
  const theme = THEME_NAMES.includes(String(raw.theme || '').toLowerCase()) ? String(raw.theme).toLowerCase() : 'corporativo';
  const spec = {
    format,
    lang: L.code,
    currency: CURRENCIES[String(raw.currency || currency || '').toUpperCase()] ? String(raw.currency || currency).toUpperCase() : L.defaultCurrency,
    title: str(raw.title, 200) || L.document,
    subtitle: str(raw.subtitle, 300),
    author: str(raw.author, 120),
    theme,
    fileName: safeFileName(raw.fileName || raw.title, FORMATS[format].ext),
    blocks: [],
    sheets: [],
    slides: []
  };
  for (const b of (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, 400)) {
    const type = BLOCK_TYPES.includes(b?.type) ? b.type : 'paragraph';
    spec.blocks.push({
      type,
      level: Math.min(3, Math.max(1, Number(b.level) || 1)),
      text: str(b.text, 6000),
      items: list(b.items, 60, 1200),
      headers: list(b.headers, 20, 200),
      rows: grid(b.rows, 300, 20),
      tone: ['info', 'success', 'warning'].includes(b.tone) ? b.tone : 'info'
    });
  }
  for (const s of (Array.isArray(raw.sheets) ? raw.sheets : []).slice(0, 12)) {
    const columns = (Array.isArray(s?.columns) ? s.columns : []).slice(0, 40).map(c => ({
      header: str(c?.header, 120) || 'Coluna',
      type: COLUMN_TYPES.includes(c?.type) ? c.type : 'text',
      width: Number(c?.width) > 0 ? Math.min(80, Math.max(6, Number(c.width))) : null
    }));
    const rows = grid(s?.rows, 5000, Math.max(1, columns.length || 40));
    if (!columns.length && rows.length) rows[0].forEach((h, i) => columns.push({ header: h || `${L.column} ${i + 1}`, type: 'text', width: null }));
    spec.sheets.push({ name: str(s?.name, 31).replace(/[\\/*?:[\]]/g, ' ') || `${L.sheet} ${spec.sheets.length + 1}`, description: str(s?.description, 300), columns, rows, totals: Boolean(s?.totals) });
  }
  for (const sl of (Array.isArray(raw.slides) ? raw.slides : []).slice(0, 60)) {
    spec.slides.push({
      layout: SLIDE_LAYOUTS.includes(sl?.layout) ? sl.layout : 'bullets',
      title: str(sl?.title, 160), subtitle: str(sl?.subtitle, 300),
      bullets: list(sl?.bullets, 40, 300),
      leftTitle: str(sl?.leftTitle, 100), left: list(sl?.left, 7, 260),
      rightTitle: str(sl?.rightTitle, 100), right: list(sl?.right, 7, 260),
      stats: (Array.isArray(sl?.stats) ? sl.stats : []).slice(0, 4).map(x => ({ value: str(x?.value, 24), label: str(x?.label, 80) })).filter(x => x.value),
      steps: (Array.isArray(sl?.steps) ? sl.steps : []).slice(0, 6).map(x => ({ title: str(x?.title, 60), text: str(x?.text, 160) })).filter(x => x.title),
      headers: list(sl?.headers, 6, 80), rows: grid(sl?.rows, 60, 6),
      quote: str(sl?.quote, 400), author: str(sl?.author, 120),
      imagePrompt: str(sl?.imagePrompt, 600),
      notes: str(sl?.notes, 2000)
    });
  }
  spec.slides = splitOverflowingSlides(spec.slides, L);
  return spec;
}

// Em vez de cortar conteúdo, slides com tabela ou lista grande demais viram slides de continuação.
function splitOverflowingSlides(slides, L) {
  const out = [];
  for (const s of slides) {
    if (s.layout === 'table' && s.rows.length > 8) {
      const headers = s.headers.length ? s.headers : s.rows[0];
      const rows = s.headers.length ? s.rows : s.rows.slice(1);
      for (let i = 0; i < rows.length; i += 8) out.push({ ...s, title: i ? `${s.title} ${L.continued}` : s.title, headers, rows: rows.slice(i, i + 8), notes: i ? '' : s.notes });
    } else if (['bullets', 'image'].includes(s.layout) && s.bullets.length > 8) {
      for (let i = 0; i < s.bullets.length; i += 8) out.push({ ...s, layout: i ? 'bullets' : s.layout, title: i ? `${s.title} ${L.continued}` : s.title, bullets: s.bullets.slice(i, i + 8), notes: i ? '' : s.notes });
    } else out.push(s);
  }
  return out.slice(0, 60);
}

export function specProblems(spec) {
  const kind = FORMATS[spec.format].kind;
  if (kind === 'document' && !spec.blocks.some(b => b.text || b.items.length || b.rows.length)) return ['documento sem conteúdo'];
  if (kind === 'spreadsheet' && !spec.sheets.some(s => s.rows.length)) return ['planilha sem linhas'];
  if (kind === 'presentation' && spec.slides.length < 2) return ['apresentação com menos de 2 slides'];
  return [];
}

// Esquema da função create_file para o Gemini (todos os campos opcionais, conforme o formato).
export const CREATE_FILE_TOOL = {
  name: 'create_file',
  description: 'Gera um arquivo para download (PDF, Word, Excel, CSV ou PowerPoint) a partir de conteúdo estruturado. Use quando o usuário pedir um arquivo nesses formatos.',
  parameters: {
    type: 'OBJECT',
    properties: {
      format: { type: 'STRING', enum: Object.keys(FORMATS) },
      fileName: { type: 'STRING', description: 'Nome curto do arquivo, sem extensão.' },
      title: { type: 'STRING' }, subtitle: { type: 'STRING' }, author: { type: 'STRING' },
      currency: { type: 'STRING', description: 'Código ISO da moeda (BRL, USD, EUR, MXN, ARS, COP, CLP, PEN, GBP).' },
      theme: { type: 'STRING', enum: THEME_NAMES, description: 'corporativo (negócios), executivo (diretoria, elegante, escuro), moderno (tecnologia), natureza (sustentabilidade, saúde, jardinagem), criativo (hobbies, eventos, culinária, escola), minimalista (acadêmico, sóbrio), oceano (viagens, turismo).' },
      blocks: {
        type: 'ARRAY', description: 'PDF/Word: conteúdo em ordem.',
        items: { type: 'OBJECT', properties: {
          type: { type: 'STRING', enum: BLOCK_TYPES }, level: { type: 'INTEGER' }, text: { type: 'STRING', description: 'Aceita **negrito** e *itálico*.' },
          items: { type: 'ARRAY', items: { type: 'STRING' } }, headers: { type: 'ARRAY', items: { type: 'STRING' } },
          rows: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } } }, tone: { type: 'STRING', enum: ['info', 'success', 'warning'] }
        }, required: ['type'] }
      },
      sheets: {
        type: 'ARRAY', description: 'Excel/CSV: uma ou mais abas.',
        items: { type: 'OBJECT', properties: {
          name: { type: 'STRING' }, description: { type: 'STRING' },
          columns: { type: 'ARRAY', items: { type: 'OBJECT', properties: { header: { type: 'STRING' }, type: { type: 'STRING', enum: COLUMN_TYPES }, width: { type: 'NUMBER' } }, required: ['header'] } },
          rows: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } }, description: 'Valores crus: números com ponto decimal (1234.5), datas AAAA-MM-DD, percentuais como 0.15. Fórmulas começam com = e usam referências A1 (linha 1 de dados = linha 4 da planilha).' },
          totals: { type: 'BOOLEAN', description: 'Adiciona linha de total somando colunas numéricas.' }
        }, required: ['name', 'columns', 'rows'] }
      },
      slides: {
        type: 'ARRAY', description: 'PowerPoint: slides em ordem.',
        items: { type: 'OBJECT', properties: {
          layout: { type: 'STRING', enum: SLIDE_LAYOUTS }, title: { type: 'STRING' }, subtitle: { type: 'STRING' },
          bullets: { type: 'ARRAY', items: { type: 'STRING' } },
          leftTitle: { type: 'STRING' }, left: { type: 'ARRAY', items: { type: 'STRING' } }, rightTitle: { type: 'STRING' }, right: { type: 'ARRAY', items: { type: 'STRING' } },
          stats: { type: 'ARRAY', items: { type: 'OBJECT', properties: { value: { type: 'STRING' }, label: { type: 'STRING' } } } },
          steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, text: { type: 'STRING' } } } },
          headers: { type: 'ARRAY', items: { type: 'STRING' } }, rows: { type: 'ARRAY', items: { type: 'ARRAY', items: { type: 'STRING' } } },
          quote: { type: 'STRING' }, author: { type: 'STRING' },
          imagePrompt: { type: 'STRING', description: 'Só no layout image: descrição em inglês da foto/ilustração.' },
          notes: { type: 'STRING', description: 'Anotações do apresentador.' }
        }, required: ['layout', 'title'] }
      }
    },
    required: ['format', 'title']
  }
};

export function filePlannerPrompt(request, format, { lang = 'pt', currency, requirements = [], issues = [], previous = null } = {}) {
  const f = FORMATS[format];
  const L = langOf(lang);
  const guide = {
    document: `- Use "blocks". Estrutura: parágrafo de introdução → seções com heading level 1 (e level 2 quando ajudar) → conclusão/próximos passos.
- Cada seção precisa de conteúdo REAL e completo: pelo menos 2 parágrafos de 50 a 120 palavras, com fatos, exemplos, números e explicações concretas — nunca frases genéricas.
- Use listas para passos e enumerações, tabela quando houver dados comparáveis (todas as células preenchidas) e callout para dicas/alertas.
- Se o pedido não disser o tamanho, escreva de 900 a 1800 palavras.`,
    spreadsheet: `- Use "sheets". Colunas com o tipo certo: currency para dinheiro (moeda ${currency}), percent para %, date para datas (AAAA-MM-DD), integer/number para quantidades.
- TODAS as linhas com TODAS as colunas preenchidas, com dados plausíveis e coerentes entre si (totais batem, datas em sequência, categorias consistentes).
- Use fórmulas quando um valor depende de outros (=C4*D4, =SUM(E4:E20)); a 1ª linha de dados é a linha 4. totals=true quando somar fizer sentido.
- Se o usuário não deu os números, crie um exemplo realista e diga isso na description da aba.
- Inclua TODAS as linhas pedidas (se pedir 30 itens, são 30 linhas). Em CSV não use fórmulas: escreva os valores calculados.`,
    presentation: `- Use "slides": o 1º com layout title e o último com closing. Se o pedido não disser a quantidade, faça de 8 a 12 slides; se disser, faça EXATAMENTE essa quantidade.
- Varie os layouts conforme o conteúdo: section para abrir partes, bullets (3 a 6 tópicos de até 15 palavras, com informação concreta), two-column para comparações (as duas colunas preenchidas), stats (2 a 4 números reais com rótulo), timeline (etapas com título e descrição), table (dados completos), quote e image (no máximo 3, com imagePrompt descritivo em inglês).
- Escreva "notes" em TODOS os slides: 3 a 6 frases com o que o apresentador deve dizer, explicando e aprofundando o slide.
- Cada slide deve trazer informação nova e específica do assunto — nada de slides repetidos ou vagos.`
  }[f.kind];
  const checklist = requirements.length
    ? `\nCHECKLIST DO PEDIDO (tudo precisa aparecer no arquivo):\n${requirements.map(r => `- ${r.text}${r.count ? ` (quantidade: ${r.count})` : ''}`).join('\n')}`
    : '';
  const fixes = issues.length
    ? `\nA VERSÃO ANTERIOR FOI REPROVADA. Corrija TODOS estes problemas e mantenha o que estava bom:\n${issues.map(i => `- ${i}`).join('\n')}${previous ? `\nVersão anterior (resumo JSON):\n${JSON.stringify(previous).slice(0, 12000)}` : ''}`
    : '';
  return `Você é a Kira preparando um arquivo ${f.label} profissional (formato "${format}").

IDIOMA OBRIGATÓRIO: ${L.name.toUpperCase()}. Escreva TODO o conteúdo do arquivo em ${L.name} — título, subtítulo, textos, tópicos, nomes de abas e colunas, anotações do apresentador e fileName — porque foi o idioma em que o usuário fez o pedido. (Estas instruções estão em português, mas isso não muda o idioma do arquivo.)

PEDIDO DO USUÁRIO (siga com fidelidade total; ele vence qualquer regra genérica abaixo):
${String(request).slice(0, 6000)}
${checklist}

Regras:
- Fidelidade: inclua tudo o que foi pedido, com os nomes, números, quantidades, ordem e detalhes que o usuário deu. Não troque o assunto, não omita partes e não invente requisitos.
- Conteúdo real, específico e útil. Proibido: "Lorem ipsum", "Texto aqui", "Item 1", "[inserir]", reticências no lugar de conteúdo.
- NÃO invente dados factuais sobre o produto, a empresa ou a pessoa do usuário (número de usuários, faturamento, satisfação, clientes, prêmios, citações atribuídas a alguém). Use só os números que o usuário deu ou fatos públicos e verificáveis do assunto. Sem dados, prefira layouts sem números (bullets, two-column, timeline) ou identifique claramente como "meta", "exemplo" ou "estimativa".
- Citações (layout quote) só de pessoas reais com frases conhecidas, ou do próprio usuário se ele forneceu; nunca atribua frases inventadas.
- Termine apresentações com um slide closing (agradecimento, próximos passos ou contato).
- Se o pedido se referir à conversa anterior ("isso", "essa resposta", "lo que hablamos"), use esse conteúdo.
- Escolha o "theme" que combina com o assunto (negócios → corporativo/executivo; tecnologia → moderno; hobbies, culinária, escola, festas → criativo; saúde/meio ambiente → natureza; viagens → oceano; acadêmico → minimalista).
- currency = "${currency}" salvo se o pedido citar outra moeda.
${guide}${fixes}
Chame create_file com format="${format}".`;
}
