const test = require('node:test');
const assert = require('node:assert/strict');
const files = import('../lib/files/index.js');
const values = import('../lib/files/values.js');

const deck = { title: 'Plano 2027', theme: 'executivo', slides: [
  { layout: 'title', title: 'Plano 2027', subtitle: 'Estratégia' },
  { layout: 'bullets', title: 'Por que agora', bullets: ['A', 'B', 'C'], notes: 'falar sobre o mercado' },
  { layout: 'stats', title: 'Números', stats: [{ value: '+18%', label: 'crescimento' }] },
  { layout: 'table', title: 'Metas', headers: ['Canal', 'Meta'], rows: [['Web', 'R$ 1 mi']] },
  { layout: 'image', title: 'Foto', imagePrompt: 'coffee', bullets: ['x'] },
  { layout: 'closing', title: 'Obrigado!' }] };
const doc = { title: 'Guia de Horta', theme: 'natureza', blocks: [
  { type: 'paragraph', text: 'Intro **forte** e *leve* → com seta.' }, { type: 'heading', level: 1, text: 'Local' },
  { type: 'bullets', items: ['Sol', 'Água'] }, { type: 'table', headers: ['Planta', 'Rega'], rows: [['Manjericão', 'Diária']] },
  { type: 'callout', tone: 'warning', text: 'Cuidado' }, { type: 'quote', text: 'Paciência' }] };
const sheet = { title: 'Orçamento', sheets: [{ name: 'Jan', columns: [{ header: 'Item', type: 'text' }, { header: 'Valor', type: 'currency' }, { header: 'Taxa', type: 'percent' }], rows: [['Aluguel', 'R$ 2.200,00', '15%'], ['Mercado', '1712.4', '0.05']], totals: true }] };

test('detecta pedidos de arquivo sem confundir com projetos', async () => {
  const { detectFileRequest } = await files;
  assert.equal(detectFileRequest('crie uma apresentação sobre jardinagem')?.format, 'pptx');
  assert.equal(detectFileRequest('gere uma planilha de controle de gastos')?.format, 'xlsx');
  assert.equal(detectFileRequest('me manda isso em PDF')?.format, 'pdf');
  assert.equal(detectFileRequest('exporte a tabela em csv')?.format, 'csv');
  assert.equal(detectFileRequest('faça um documento word com o contrato')?.format, 'docx');
  assert.equal(detectFileRequest('crie un archivo excel de inventario')?.format, 'xlsx');
  assert.equal(detectFileRequest('crie um site com slides de fotos'), null);
  assert.equal(detectFileRequest('o que é um pdf?'), null);
});

test('gera os cinco formatos com assinatura binária correta', async () => {
  const { renderFile } = await files;
  const img = async () => ({ bytes: Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'), mimeType: 'image/png' });
  const out = {};
  for (const [spec, f] of [[deck, 'pptx'], [doc, 'docx'], [doc, 'pdf'], [sheet, 'xlsx'], [sheet, 'csv']]) out[f] = await renderFile(spec, f, { resolveImage: img });
  for (const f of ['pptx', 'docx', 'xlsx']) assert.equal(out[f].buffer.subarray(0, 2).toString(), 'PK', f);
  assert.equal(out.pdf.buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(out.pptx.summary, '6 slides');
  assert.equal(out.pptx.fileName, 'plano-2027.pptx');
  assert.match(out.csv.buffer.toString('utf8'), /^﻿Item;Valor;Taxa\r\nAluguel;2200;15%/);
});

test('valores em formato brasileiro, internacional, percentual e fórmula', async () => {
  const { parseCell } = await values;
  assert.equal(parseCell('R$ 1.234,56', 'currency'), 1234.56);
  assert.equal(parseCell('1,234.56', 'number'), 1234.56);
  assert.equal(parseCell('15%', 'percent'), 0.15);
  assert.equal(parseCell('0.05', 'percent'), 0.05);
  assert.deepEqual(parseCell('=B4*C4', 'currency'), { formula: 'B4*C4' });
  assert.equal(parseCell('2027-01-05', 'date').toISOString().slice(0, 10), '2027-01-05');
});

test('recusa especificação vazia e limpa nome do arquivo', async () => {
  const { renderFile } = await files;
  await assert.rejects(renderFile({ title: 'x', slides: [{ layout: 'title', title: 'só capa' }] }, 'pptx'), /menos de 2 slides/);
  const r = await renderFile({ title: 'Relatório Anual: Vendas/2026!', blocks: [{ type: 'paragraph', text: 'ok' }] }, 'pdf');
  assert.equal(r.fileName, 'relatorio-anual-vendas-2026.pdf');
});
