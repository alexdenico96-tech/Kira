// KIRA_REQUIREMENTS_V1
// Fidelidade em projetos complexos: o pedido vira um checklist numerado (R1, R2...),
// o modelo implementa item a item e o servidor confere no código o que foi entregue.

const STOPWORDS = new Set(('a o as os um uma uns umas de do da dos das no na nos nas em para por com sem que se ao aos à às e ou ' +
  'mas como mais menos muito muita cada todo toda todos todas ter tenha tenham deve devem deverá precisa pode ' +
  'quero queria gostaria crie cria criar gere gerar faça fazer monte desenvolva construa implemente use usar usando ' +
  'projeto sistema aplicação aplicacao app site página pagina tela seção secao parte área area onde quando ' +
  'isso esse essa este esta ele ela eles elas meu minha seu sua nosso nossa também tambem então entao assim ' +
  'react vite next vue angular svelte typescript javascript html css componente componentes arquivo arquivos ' +
  'the and with for from that this have should must create build make').split(/\s+/));

export const normalizeText = value => String(value || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

const stem = word => word.length > 5 ? word.replace(/(?:coes|soes|oes|aes|ais|eis|ns|es|s)$/, '') : word;

export function keyTerms(text, max = 5) {
  const words = normalizeText(text).match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
  const out = [];
  for (const word of words) {
    if (STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    const s = stem(word);
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const QUANTITY = /\b(\d{1,3})\s+(produtos?|carros?|ve[ií]culos?|itens?|cards?|p[aá]ginas?|telas?|planos?|depoimentos?|categorias?|im[oó]veis|im[oó]vel|cursos?|pratos?|lanches?|servi[cç]os?|projetos?|posts?|artigos?|membros?|perguntas?|fotos?|imagens?|filmes?|livros?|usu[aá]rios?|tarefas?|clientes?|pedidos?|eventos?)\b/gi;

function kindOf(text) {
  const t = normalizeText(text);
  if (/\b(pagina|tela|rota|aba|dashboard|painel|perfil|checkout|carrinho|login|cadastro)\b/.test(t)) return 'page';
  if (/\b(cor|cores|tema|escuro|claro|fonte|layout|visual|estilo|design|animac)/.test(t)) return 'visual';
  if (/\b(filtr|busca|pesquis|ordena|adicionar|remover|editar|excluir|salvar|enviar|validar|calcul|login|logout|favorit|paginac|notifica|upload|download|exportar)/.test(t)) return 'feature';
  return 'content';
}

// Extração determinística: listas (•, -, 1.), frases e quantidades.
export function extractRequirementsHeuristic(message = '') {
  const text = String(message).replace(/\r/g, '');
  const reqs = [];
  const seen = new Set();
  const add = (raw, extra = {}) => {
    const clean = raw.replace(/^[\s\-–•*>\d.)]+/, '').replace(/\s+/g, ' ').trim().replace(/[.;:,]$/, '');
    const terms = extra.terms || keyTerms(clean);
    const key = normalizeText(clean);
    if (clean.length < 4 || !terms.length || seen.has(key)) return;
    seen.add(key);
    reqs.push({ id: `R${reqs.length + 1}`, text: clean, kind: extra.kind || kindOf(clean), terms, count: extra.count ?? null });
  };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => /^(?:[-–•*]|\d{1,2}[.)])\s+/.test(l));
  if (bullets.length >= 2) bullets.forEach(l => add(l));

  // Frases e listas "com X, Y e Z".
  for (const sentence of text.split(/[.;\n]+/)) {
    if (bullets.some(b => b.includes(sentence.trim()))) continue;
    const list = sentence.match(/\b(?:com|contendo|incluindo|que tenha|deve ter|precisa ter|tenha)\s+(.+)/i);
    if (list) {
      for (const item of list[1].split(/,|\s+e\s+(?=[a-zà-ú])/i)) add(item);
    } else if (sentence.trim().split(/\s+/).length >= 3 && !/^\s*(?:crie|cria|criar|fa[cç]a|gere|desenvolva|monte|quero)\b[^,]{0,40}$/i.test(sentence)) {
      add(sentence);
    }
  }

  for (const match of text.matchAll(QUANTITY)) {
    const count = Number(match[1]);
    if (count >= 2) add(`${match[1]} ${match[2]}`, { kind: 'quantity', count, terms: keyTerms(match[2], 1) });
  }
  return reqs.slice(0, 25);
}

export function requirementsExtractionPrompt(message) {
  return `Transforme o pedido de software abaixo em um checklist de requisitos ATÔMICOS e VERIFICÁVEIS.
Regras:
- Cada item é uma única coisa concreta que o usuário pediu (página, funcionalidade, campo, comportamento, conteúdo, quantidade, cor, texto, integração).
- Preserve nomes, textos, números e detalhes exatamente como o usuário escreveu.
- Inclua requisitos implícitos apenas quando forem consequência direta do pedido (ex.: "carrinho" implica adicionar e remover itens).
- NÃO invente funcionalidades que não foram pedidas.
- "terms": 2 a 4 palavras em minúsculas, sem acento, que obrigatoriamente aparecerão no código de quem implementar (nomes de rotas, campos, textos de botão).
- "count": número quando o pedido exigir uma quantidade mínima, senão null.
- Máximo 25 itens.
Responda SOMENTE JSON: {"requirements":[{"id":"R1","text":"...","kind":"page|feature|data|visual|behavior|content|quantity|stack","terms":["..."],"count":null}]}

PEDIDO:
${String(message).slice(0, 6000)}`;
}

function parseModelRequirements(raw) {
  const text = String(raw || '').replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const data = JSON.parse(text.slice(start, end + 1));
  const list = Array.isArray(data?.requirements) ? data.requirements : null;
  if (!list?.length) return null;
  return list.slice(0, 25).map((item, index) => {
    const textValue = String(item?.text || '').trim();
    const terms = (Array.isArray(item?.terms) ? item.terms : []).map(t => normalizeText(t).trim()).filter(t => t.length >= 2).slice(0, 4);
    return {
      id: `R${index + 1}`,
      text: textValue,
      kind: String(item?.kind || kindOf(textValue)),
      terms: terms.length ? terms.map(stem) : keyTerms(textValue),
      count: Number.isFinite(Number(item?.count)) && Number(item.count) > 1 ? Number(item.count) : null
    };
  }).filter(r => r.text && r.terms.length);
}

// ask(prompt) => Promise<string>. Qualquer falha cai na extração determinística.
export async function extractRequirements(message, ask) {
  const heuristic = extractRequirementsHeuristic(message);
  if (typeof ask !== 'function') return { requirements: heuristic, source: 'heuristic' };
  try {
    const fromModel = parseModelRequirements(await ask(requirementsExtractionPrompt(message)));
    if (!fromModel?.length) return { requirements: heuristic, source: 'heuristic' };
    // Quantidades explícitas detectadas por regex nunca podem se perder.
    for (const q of heuristic.filter(r => r.kind === 'quantity')) {
      if (!fromModel.some(r => r.count === q.count)) fromModel.push({ ...q, id: `R${fromModel.length + 1}` });
    }
    return { requirements: fromModel.slice(0, 28), source: 'model' };
  } catch {
    return { requirements: heuristic, source: 'heuristic' };
  }
}

export function requirementsPrompt(requirements = []) {
  if (!requirements.length) return '';
  return `
CHECKLIST DE FIDELIDADE (cada item é OBRIGATÓRIO; o servidor vai conferir item a item no código):
${requirements.map(r => `${r.id}. ${r.text}${r.count ? ` (quantidade mínima: ${r.count})` : ''}`).join('\n')}
- Implemente cada item de forma real e visível (rota, componente, estado, handler, dados), com os mesmos nomes, textos e números do pedido.
- Não troque nada por algo "parecido", não reduza quantidades e não omita itens por falta de espaço: prefira código mais enxuto a cortar requisitos.
- Não adicione funcionalidades grandes que não foram pedidas.
- Preencha "coverage" no create_document: para CADA id do checklist, informe os arquivos e como foi implementado.`;
}

function maxRepetition(files) {
  let best = 0;
  for (const file of files) {
    const content = String(file.content || '');
    if (/\.(?:jsx?|tsx?|json|vue|svelte)$/i.test(file.path)) {
      const counts = {};
      for (const m of content.matchAll(/\b(?:name|nome|title|titulo|título|price|preco|preço|model|modelo|id)\s*:/gi)) {
        const key = m[0].toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
      best = Math.max(best, ...Object.values(counts), 0);
    }
    if (/\.html?$/i.test(file.path)) best = Math.max(best, (content.match(/<(?:article|li)\b/gi) || []).length);
  }
  return best;
}

export function verifyRequirements(files = [], requirements = [], coverage = []) {
  if (!requirements.length) return { ok: true, missing: [], total: 0, covered: 0 };
  const clean = (files || []).filter(f => f?.path && typeof f.content === 'string');
  const haystack = normalizeText(clean.map(f => `${f.path}\n${f.content}`).join('\n'));
  const paths = new Set(clean.map(f => String(f.path).replace(/^\.?\//, '')));
  const claims = new Map((Array.isArray(coverage) ? coverage : []).map(c => [String(c?.id || '').toUpperCase(), c]));
  const repetition = maxRepetition(clean);
  const missing = [];

  for (const req of requirements) {
    const reasons = [];
    const hits = req.terms.filter(term => haystack.includes(term)).length;
    const needed = Math.max(1, Math.ceil(req.terms.length / 2));
    if (hits < needed) reasons.push(`não encontrei no código: ${req.terms.filter(t => !haystack.includes(t)).join(', ')}`);
    if (req.count && repetition < req.count) reasons.push(`pedido ${req.count}, encontrei ~${repetition}`);
    const claim = claims.get(req.id);
    const claimedFiles = Array.isArray(claim?.files) ? claim.files.map(f => String(f).replace(/^\.?\//, '')) : [];
    const ghost = claimedFiles.filter(f => !paths.has(f));
    if (ghost.length) reasons.push(`coverage cita arquivo inexistente: ${ghost.join(', ')}`);
    if (reasons.length) missing.push({ ...req, reason: reasons.join('; ') });
  }
  return { ok: missing.length === 0, missing, total: requirements.length, covered: requirements.length - missing.length };
}

export const requirementIssues = check =>
  check.missing.map(r => `requisito ${r.id} não atendido ("${r.text}"): ${r.reason}`);
