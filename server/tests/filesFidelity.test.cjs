const test = require('node:test');
const assert = require('node:assert/strict');
const files = import('../lib/files/index.js');

test('idioma e moeda do pedido', async () => {
  const { detectLanguage, detectCurrency } = await files;
  assert.equal(detectLanguage('Crea una presentación sobre la historia del café con 10 diapositivas'), 'es');
  assert.equal(detectLanguage('crea un word'), 'es');
  assert.equal(detectLanguage('Crie uma planilha de gastos'), 'pt');
  assert.equal(detectLanguage('Create a sales report in PDF'), 'en');
  assert.equal(detectCurrency('presupuesto en pesos mexicanos', 'es'), 'MXN');
  assert.equal(detectCurrency('orçamento da festa', 'pt'), 'BRL');
});

test('quantidades pedidas em pt/es/en', async () => {
  const { requestedCounts } = await files;
  assert.deepEqual(requestedCounts('Crea 12 diapositivas sobre café'), { slides: 12 });
  assert.equal(requestedCounts('planilha com 30 produtos e 2 abas').items, 30);
  assert.equal(requestedCounts('planilha com 30 produtos e 2 abas').sheets, 2);
  assert.equal(requestedCounts('a report with 5 sections').sections, 5);
});

test('reprova idioma errado, quantidade a menos, slides vazios e sem notas', async () => {
  const { normalizeSpec, inspectFileSpec } = await files;
  const english = normalizeSpec({ title: 'History of Coffee', slides: [
    { layout: 'title', title: 'History of Coffee', subtitle: 'From Ethiopia to the world' },
    { layout: 'bullets', title: 'Origins', bullets: ['The legend of Kaldi and the goats', 'Coffee spread to Yemen in the 15th century'] },
    { layout: 'bullets', title: 'Today', bullets: [] },
    { layout: 'closing', title: 'Thank you' }] }, 'pptx', { lang: 'es' });
  const issues = inspectFileSpec(english, 'Crea una presentación sobre la historia del café con 10 diapositivas', { lang: 'es' });
  assert.ok(issues.some(i => /está em English.*em español/.test(i)), issues.join('\n'));
  assert.ok(issues.some(i => /pediu 10 slides e há 4/.test(i)));
  assert.ok(issues.some(i => /Slide 3 \("Today"\) está sem conteúdo/.test(i)));
  assert.ok(issues.some(i => /anotações do apresentador/.test(i)));
});

test('planilha: linhas faltando, colunas vazias e números em texto', async () => {
  const { normalizeSpec, inspectFileSpec } = await files;
  const sheet = normalizeSpec({ title: 'Inventário', sheets: [{ name: 'Estoque', columns: [{ header: 'Produto', type: 'text' }, { header: 'Preço', type: 'currency' }, { header: 'Qtd', type: 'integer' }],
    rows: [['Café', '25,90', '10'], ['Açúcar', 'barato', ''], ['Leite', '', '']] }] }, 'xlsx', { lang: 'pt' });
  const issues = inspectFileSpec(sheet, 'crie uma planilha de inventário com 20 produtos', { lang: 'pt' });
  assert.ok(issues.some(i => /pediu 20 linhas\/itens/.test(i)));
  assert.ok(issues.some(i => /células vazias/.test(i)));
  assert.ok(issues.some(i => /"Preço" é numérica mas tem 1 valor/.test(i)));
});

test('conteúdo completo e no idioma certo passa sem problemas; meta-palavras não contam como requisito', async () => {
  const { normalizeSpec, inspectFileSpec } = await files;
  const { extractRequirementsHeuristic } = await import('../lib/requirements.js');
  const notes = 'El presentador explica el contexto histórico con ejemplos concretos y conecta este punto con la siguiente parte de la charla.';
  const slides = [{ layout: 'title', title: 'Historia del café', notes }];
  for (let i = 0; i < 8; i++) slides.push({ layout: 'bullets', title: `Etapa ${['etíope', 'yemení', 'otomana', 'europea', 'colonial', 'industrial', 'moderna', 'especial'][i]} del café`, bullets: ['Los granos se tostaban en ollas de barro', 'Las cafeterías se convirtieron en centros de debate'], notes });
  slides.push({ layout: 'closing', title: '¡Gracias!', notes });
  const spec = normalizeSpec({ title: 'Historia del café', slides }, 'pptx', { lang: 'es' });
  const request = 'Crea una presentación sobre la historia del café con 10 diapositivas';
  assert.deepEqual(inspectFileSpec(spec, request, { lang: 'es', requirements: extractRequirementsHeuristic(request) }), []);
});

test('tabela e lista grandes viram slides de continuação (nada é cortado)', async () => {
  const { normalizeSpec } = await files;
  const rows = Array.from({ length: 20 }, (_, i) => [`Item ${String.fromCharCode(65 + i)}`, String(i)]);
  const spec = normalizeSpec({ title: 'x', slides: [{ layout: 'title', title: 'x' }, { layout: 'table', title: 'Dados', headers: ['A', 'B'], rows }] }, 'pptx', { lang: 'es' });
  assert.deepEqual(spec.slides.map(s => [s.title, s.rows.length]), [['x', 0], ['Dados', 8], ['Dados (cont.)', 8], ['Dados (cont.)', 4]]);
});

test('arquivos localizados: espanhol com euro e CSV em inglês com vírgula', async () => {
  const { renderFile } = await files;
  const ExcelJS = require('exceljs');
  const sheetSpec = { title: 'Presupuesto', sheets: [{ name: 'Enero', columns: [{ header: 'Concepto', type: 'text' }, { header: 'Importe', type: 'currency' }, { header: 'Fecha', type: 'date' }], rows: [['Alquiler', '900', '2027-01-05'], ['Luz', '80.5', '2027-01-10'], ['Agua', '30', '2027-01-12']], totals: true }] };
  const xlsx = await renderFile(sheetSpec, 'xlsx', { lang: 'es', currency: 'EUR' });
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(xlsx.buffer);
  const ws = wb.getWorksheet('Enero');
  assert.equal(ws.getCell('B4').numFmt, '#,##0.00 "€"');
  assert.equal(ws.getCell('C4').numFmt, 'dd/mm/yyyy');
  const csv = await renderFile(sheetSpec, 'csv', { lang: 'en' });
  assert.match(csv.buffer.toString('utf8'), /Concepto,Importe,Fecha\r\nAlquiler,900,01\/05\/2027\r\nLuz,80\.5,/);
});
