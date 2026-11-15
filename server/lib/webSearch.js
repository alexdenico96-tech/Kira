// KIRA_WEB_SEARCH_V1
// Respostas atualizadas: perguntas sobre o presente vão para uma busca real na web
// (Gemini + Google Search; reserva: Groq Compound com busca embutida) e voltam com as fontes.

const TIMEZONE = process.env.KIRA_TIMEZONE || 'America/Sao_Paulo';

// Data e hora reais no prompt: sem isso o modelo "acha" que ainda está no ano do treinamento.
export function currentDateLine(now = new Date(), timeZone = TIMEZONE) {
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(now);
  const year = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric' }).format(now);
  return `DATA ATUAL: hoje é ${date}, ${time} (fuso ${timeZone}). O ano atual é ${year}.
Seu conhecimento interno foi treinado antes desta data e pode estar desatualizado. Nunca diga que o ano atual é anterior a ${year}. Para fatos que mudam com o tempo (cargos, preços, versões, notícias, resultados, leis) sem pesquisa na web nesta conversa, avise que a informação pode ter mudado.`;
}

// Perguntas que dependem do presente ou pedidos explícitos de pesquisa.
const SEARCH_HINTS = [
  /\b(pesquis[ae]r?|pesquisa|busqu?e|buscar|procur[ae]r?)\b.{0,40}\b(na |em )?(internet|web|google|online|fontes?|sites?)\b/i,
  /^(pesquis[ae]|busqu?e|procure)\b/i,
  /\b(hoje|agora|neste momento|atualmente|atual(?:mente)?|atualizad[oa]s?|recente(?:s|mente)?|[uú]ltim[oa]s? (?:not[ií]cias?|vers[aã]o|lan[cç]amento|atualiza[cç][aã]o|resultado|jogo|partida|semana|m[eê]s|dias?)|esta semana|este m[eê]s|este ano|ontem|amanh[aã])\b/i,
  /\b(not[ií]cias?|manchetes?|aconteceu|acontecendo|lan[cç]ou|lan[cç]amento|estreia|anunciou|anunciad[oa])\b/i,
  /\b(pre[cç]o|cota[cç][aã]o|quanto custa|valor d[oa] (?:d[oó]lar|euro|bitcoin|a[cç][aã]o)|d[oó]lar hoje|bitcoin|ibovespa|infla[cç][aã]o|selic|taxa de juros)\b/i,
  /\b(quem ganhou|quem venceu|placar|resultado d[oa]|classifica[cç][aã]o|tabela d[oa]|pr[oó]ximo jogo|campeonato|elei[cç][aã]o|elei[cç][oõ]es)\b/i,
  /\b(previs[aã]o do tempo|clima em|vai chover|temperatura em)\b/i,
  /\bquem [ée] (?:o|a) (?:atual |novo |nova )?(?:presidente|ceo|ministr[oa]|governador[a]?|prefeit[oa]|t[ée]cnico|treinador[a]?|papa|l[ií]der|dono|diretor[a]?)\b/i,
  /\b(vers[aã]o mais recente|vers[aã]o atual|ainda existe|ainda funciona|ainda [ée]|continua sendo)\b/i,
  /\b(202[4-9]|203\d)\b/
];

export function needsWebSearch(text = '') {
  const t = String(text).trim();
  if (!t || t.length > 2000) return false;
  if (/\b(crie|cria|criar|gere|gerar|fa[cç]a um|monte|desenvolva|c[oó]digo|html|css|componente|fun[cç][aã]o que)\b/i.test(t) && !/\b(pesquis|busqu|procur)/i.test(t)) return false;
  return SEARCH_HINTS.some(re => re.test(t));
}

export function domainOf(url = '', title = '') {
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(title).trim())) return String(title).trim().toLowerCase().replace(/^www\./, '');
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export const faviconUrl = domain => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

function normalizeSources(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const url = String(item?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const domain = item.domain || domainOf(url, item.title);
    const key = `${domain}|${item.title}`;
    if (!domain || seen.has(key)) continue;
    seen.add(key);
    out.push({ title: String(item.title || domain).slice(0, 160), url, domain, favicon: faviconUrl(domain) });
    if (out.length >= 10) break;
  }
  return out;
}

// Marcadores [1], [2]... depois dos trechos que o Google indicou como embasados em cada fonte.
// Usa o texto do segmento (não os índices em bytes) para não errar com acentos.
export function addCitations(text, supports = [], chunkCount = 0) {
  let result = String(text || '');
  let cursor = 0;
  const inserts = [];
  for (const support of supports || []) {
    const segment = String(support?.segment?.text || '').trim();
    const indices = (support?.groundingChunkIndices || []).filter(i => Number.isInteger(i) && i >= 0 && i < chunkCount);
    if (!segment || !indices.length) continue;
    const at = result.indexOf(segment, Math.max(0, cursor - segment.length));
    if (at < 0) continue;
    const end = at + segment.length;
    cursor = end;
    inserts.push({ end, marks: [...new Set(indices)].slice(0, 3).map(i => i + 1) });
  }
  for (const { end, marks } of inserts.sort((a, b) => b.end - a.end)) {
    result = `${result.slice(0, end)} ${marks.map(n => `[${n}]`).join('')}${result.slice(end)}`;
  }
  return result;
}

export function parseGeminiGrounding(data) {
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || []).map(p => p.text).filter(Boolean).join('\n').trim();
  const meta = candidate?.groundingMetadata || {};
  const chunks = (meta.groundingChunks || []).map(c => c?.web).filter(Boolean);
  const sources = normalizeSources(chunks.map(w => ({ url: w.uri, title: w.title, domain: w.domain ? String(w.domain).replace(/^www\./, '') : '' })));
  // Mapeia índices originais de chunk → número da fonte exibida (após remover duplicadas).
  const numberOf = chunks.map(w => sources.findIndex(s => s.url === w.uri));
  const supports = (meta.groundingSupports || []).map(s => ({
    ...s,
    groundingChunkIndices: (s.groundingChunkIndices || []).map(i => numberOf[i]).filter(i => i >= 0)
  }));
  return {
    text: sources.length ? addCitations(text, supports, sources.length) : text,
    sources,
    queries: (meta.webSearchQueries || []).map(String).filter(Boolean).slice(0, 6),
    entryPoint: typeof meta.searchEntryPoint?.renderedContent === 'string' ? meta.searchEntryPoint.renderedContent : ''
  };
}

export function parseGroqSearch(message) {
  const tools = Array.isArray(message?.executed_tools) ? message.executed_tools : [];
  const results = [];
  const queries = [];
  for (const tool of tools) {
    try { const args = typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments; if (args?.query) queries.push(String(args.query)); } catch { /* sem consulta legível */ }
    for (const r of tool?.search_results?.results || []) results.push({ url: r.url, title: r.title });
  }
  return { text: String(message?.content || '').trim(), sources: normalizeSources(results), queries: queries.slice(0, 6), entryPoint: '' };
}

export const SEARCH_INSTRUCTION = `
PESQUISA NA WEB ATIVA: use os resultados da pesquisa como fonte principal, priorize as informações mais recentes e mencione datas quando forem relevantes. Se as fontes divergirem, diga isso. Não invente dados que não estejam nas fontes. Responda no idioma do usuário, de forma direta e organizada.`;

/**
 * @param searchGemini (systemInstruction, contents) => resposta crua do Gemini com google_search
 * @param searchGroq   (systemInstruction, message, history) => message do Groq Compound
 */
export async function webSearchAnswer({ message, history = [], groqHistory = [], systemInstruction, searchGemini, searchGroq, onProgress = () => {} }) {
  onProgress('search', 'Pesquisando na web', 'buscando fontes atualizadas');
  const attempts = [
    ['gemini', searchGemini && (async () => parseGeminiGrounding(await searchGemini(systemInstruction + SEARCH_INSTRUCTION, [...history, { role: 'user', parts: [{ text: message }] }])))],
    ['groq', searchGroq && (async () => parseGroqSearch(await searchGroq(systemInstruction + SEARCH_INSTRUCTION, message, groqHistory)))]
  ];
  let lastError;
  for (const [provider, run] of attempts) {
    if (!run) continue;
    try {
      const result = await run();
      if (!result.text) throw new Error('resposta vazia');
      const icons = result.sources.map(s => s.domain).slice(0, 8);
      onProgress('search', result.sources.length ? `${result.sources.length} ${result.sources.length === 1 ? 'fonte consultada' : 'fontes consultadas'}` : 'Pesquisa concluída',
        result.queries.slice(0, 2).map(q => `“${q}”`).join(' · '), 'done', { icons });
      onProgress('write', 'Escrevendo a resposta com as fontes', '', 'done');
      console.info(`[kira-search] provider=${provider} sources=${result.sources.length} queries=${result.queries.length}`);
      return { ...result, provider };
    } catch (error) {
      lastError = error;
      console.warn(`[kira-search] provider=${provider} failed=${error.status || error.message}`);
    }
  }
  throw lastError || new Error('Nenhum provedor de pesquisa configurado.');
}
