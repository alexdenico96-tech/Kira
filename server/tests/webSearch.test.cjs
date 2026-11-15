const test = require('node:test');
const assert = require('node:assert/strict');
const mod = import('../lib/webSearch.js');

test('data atual entra no prompt com o ano correto', async () => {
  const { currentDateLine } = await mod;
  const line = currentDateLine(new Date('2026-11-14T22:30:00-03:00'));
  assert.match(line, /14 de novembro de 2026/);
  assert.match(line, /O ano atual é 2026/);
});

test('detecta perguntas que dependem do presente, mas não pedidos de código', async () => {
  const { needsWebSearch } = await mod;
  for (const q of ['qual a cotação do dólar hoje?', 'quem ganhou o jogo do Flamengo ontem?', 'últimas notícias sobre IA', 'quem é o atual presidente da Argentina?', 'pesquise na internet sobre o iPhone 18', 'o que mudou no React em 2026?'])
    assert.equal(needsWebSearch(q), true, q);
  for (const q of ['oi, tudo bem?', 'explique o que é recursão', 'crie um site de notícias atual em React'])
    assert.equal(needsWebSearch(q), false, q);
});

test('Gemini: extrai fontes únicas, consultas, sugestões e insere citações sem quebrar acentos', async () => {
  const { parseGeminiGrounding } = await mod;
  const text = 'A Espanha venceu a Eurocopa de 2024. A final foi em Berlim, com vitória por 2 a 1.';
  const r = parseGeminiGrounding({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: {
    webSearchQueries: ['quem venceu euro 2024'],
    searchEntryPoint: { renderedContent: '<div>sugestões</div>' },
    groundingChunks: [{ web: { uri: 'https://a.example/1', title: 'uefa.com' } }, { web: { uri: 'https://a.example/1', title: 'uefa.com' } }, { web: { uri: 'https://b.example/2', title: 'ge.globo.com' } }],
    groundingSupports: [
      { segment: { text: 'A Espanha venceu a Eurocopa de 2024.' }, groundingChunkIndices: [0, 1] },
      { segment: { text: 'A final foi em Berlim, com vitória por 2 a 1.' }, groundingChunkIndices: [2] }
    ] } }] });
  assert.equal(r.sources.length, 2);
  assert.equal(r.sources[1].domain, 'ge.globo.com');
  assert.match(r.sources[0].favicon, /s2\/favicons\?domain=uefa\.com/);
  assert.equal(r.text, 'A Espanha venceu a Eurocopa de 2024. [1] A final foi em Berlim, com vitória por 2 a 1. [2]');
  assert.deepEqual(r.queries, ['quem venceu euro 2024']);
  assert.equal(r.entryPoint, '<div>sugestões</div>');
});

test('cai para o Groq quando o Gemini falha e reporta as fases com ícones', async () => {
  const { webSearchAnswer } = await mod;
  const steps = [];
  const r = await webSearchAnswer({
    message: 'dólar hoje', systemInstruction: 'x',
    searchGemini: async () => { const e = new Error('quota'); e.status = 429; throw e; },
    searchGroq: async () => ({ content: 'O dólar fechou a R$ 5,10.', executed_tools: [{ arguments: '{"query":"dolar hoje"}', search_results: { results: [{ title: 'Valor', url: 'https://valor.globo.com/x' }, { title: 'InfoMoney', url: 'https://www.infomoney.com.br/y' }] } }] }),
    onProgress: (id, label, detail, state, extra) => steps.push({ id, label, state, extra })
  });
  assert.equal(r.provider, 'groq');
  assert.deepEqual(r.sources.map(s => s.domain), ['valor.globo.com', 'infomoney.com.br']);
  const done = steps.find(s => s.id === 'search' && s.state === 'done');
  assert.equal(done.label, '2 fontes consultadas');
  assert.deepEqual(done.extra.icons, ['valor.globo.com', 'infomoney.com.br']);
});
