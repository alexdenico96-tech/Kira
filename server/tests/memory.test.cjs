const test = require('node:test');
const assert = require('node:assert/strict');
const mem = import('../lib/memory.js');

const msgs = n => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `mensagem ${i} ` + 'x'.repeat(i === 3 ? 9000 : 10) }));

test('histórico: 12 recentes, mensagem longa mantém começo e fim, etiquetas de imagem/projeto/arquivo', async () => {
  const { buildHistory } = await mem;
  const list = msgs(20);
  list[19] = { role: 'assistant', content: 'pronto', imageUrl: '/x.png', artifactName: 'loja', artifactVersion: 3, file: { name: 'deck.pptx' } };
  const h = buildHistory(list);
  assert.equal(h.length, 12);
  assert.match(h.at(-1).parts[0].text, /gerou uma imagem[\s\S]*projeto "loja" v3[\s\S]*arquivo gerado: deck\.pptx/);
  const long = buildHistory(msgs(4), { recent: 4 })[3].parts[0].text;
  assert.ok(long.length < 4200 && long.includes('[…]') && long.startsWith('mensagem 3'));
});

test('resumo só quando 6+ mensagens novas saíram da janela recente', async () => {
  const { needsSummary } = await mem;
  assert.equal(needsSummary(msgs(12), 0), false);
  assert.equal(needsSummary(msgs(18), 0), true);
  assert.equal(needsSummary(msgs(20), 6), false);
  assert.equal(needsSummary(msgs(24), 6), true);
});

test('memória: aceita fatos úteis, recusa sensíveis, duplicados e ids desconhecidos', async () => {
  const { parseMemoryChanges } = await mem;
  const existing = [{ id: 'a1', fact: 'Prefere tema escuro' }];
  const raw = JSON.stringify({ add: [
    { fact: 'Chama-se Alex e trabalha com e-commerce', category: 'perfil' },
    { fact: 'Prefere tema escuro', category: 'preferencia' },
    { fact: 'A senha do painel é 1234', category: 'perfil' },
    { fact: 'CPF 123.456.789-00', category: 'perfil' },
    { fact: 'Prefere apresentações em espanhol', category: 'preferencia' }
  ], remove: ['a1', 'zz'] });
  const r = parseMemoryChanges(raw, existing);
  assert.deepEqual(r.add.map(x => x.fact), ['Chama-se Alex e trabalha com e-commerce', 'Prefere apresentações em espanhol']);
  assert.deepEqual(r.remove, ['a1']);
});

test('quando extrair memória e como ela entra no prompt', async () => {
  const { shouldExtractMemory, memoryBlock } = await mem;
  assert.equal(shouldExtractMemory(1, 'meu nome é Alex'), true);
  assert.equal(shouldExtractMemory(3, 'crie um site'), false);
  assert.equal(shouldExtractMemory(4, 'crie um site'), true);
  const block = memoryBlock({ facts: [{ fact: 'Prefere tema escuro' }], summary: '- Criamos a loja Aurora' });
  assert.match(block, /MEMÓRIA SOBRE O USUÁRIO[\s\S]*Prefere tema escuro[\s\S]*RESUMO DO INÍCIO[\s\S]*loja Aurora/);
  assert.equal(memoryBlock({}), '');
});
