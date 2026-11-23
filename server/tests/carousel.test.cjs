const test = require('node:test');
const assert = require('node:assert/strict');
const ck = import('../lib/requestChecklist.js');
const sp = import('../lib/carousel/spec.js');
const rd = import('../lib/carousel/render.js');

test('checklist: textos exatos, quantidades, proibições, cores, idioma, @ e partes da pergunta', async () => {
  const { buildChecklist } = await ck;
  const c = buildChecklist('Crie um carrossel de 7 slides para Instagram, tom descontraído, cores marrom e creme, sem emojis, título "Café que abraça" e no final @cafeaurora.');
  assert.deepEqual(c.exact, ['Café que abraça']);
  assert.deepEqual(c.quantities.map(q => [q.unit, q.n]), [['slides', 7]]);
  assert.deepEqual(c.forbidden, ['emojis']);
  assert.deepEqual(c.colors, ['marrom', 'creme']);
  assert.deepEqual(c.handles, ['@cafeaurora']);
  assert.deepEqual(c.platforms, ['Instagram']);
  const es = buildChecklist('Hazme un carrusel en español de cinco diapositivas para LinkedIn, sin hashtags');
  assert.equal(es.language.code, 'es');
  assert.equal(es.quantities[0].n, 5);
  assert.deepEqual(buildChecklist('não quero fundo branco, só azul').colors, ['azul']);
  assert.equal(buildChecklist('o que é inflação? e como ela afeta meu salário?').parts.length, 2);
  assert.equal(buildChecklist('coloque no slide 3 a foto').forbidden.length, 0);
});

test('checklist confere o resultado e o bloco do prompt lista tudo', async () => {
  const { buildChecklist, checklistIssues, checklistBlock } = await ck;
  const c = buildChecklist('7 slides sem emojis "Café que abraça" @cafeaurora');
  const issues = checklistIssues('Café que abraça ☕', c, { slides: 6 });
  assert.equal(issues.length, 3);
  assert.equal(checklistIssues('Café que abraça — siga @cafeaurora', c, { slides: 7 }).length, 0);
  assert.match(checklistBlock(c), /EXATAMENTE[\s\S]*exatamente 7[\s\S]*PROIBIDO: emojis[\s\S]*@cafeaurora/);
  assert.equal(checklistBlock(buildChecklist('oi, tudo bem')), '');
});

test('detecção: carrossel social vs. carrossel dentro de um site; formato e edição', async () => {
  const { detectCarouselRequest, isCarouselEdit } = await sp;
  assert.equal(detectCarouselRequest('faça um carrossel sobre marketing').format, 'portrait');
  assert.equal(detectCarouselRequest('carrossel de stories sobre viagens').format, 'story');
  assert.equal(detectCarouselRequest('crea un carrusel cuadrado para instagram').format, 'square');
  assert.equal(detectCarouselRequest('crie um site react com um carrossel de produtos'), null);
  assert.equal(detectCarouselRequest('qual a capital da França?'), null);
  assert.equal(isCarouselEdit('troca o título do slide 3'), true);
  assert.equal(isCarouselEdit('usa esta foto na capa'), true);
  assert.equal(isCarouselEdit('crie um novo carrossel sobre chá'), false);
});

test('normalização: cores pedidas, fotos do usuário todas usadas, teto de imagens, sem emojis', async () => {
  const { normalizeCarouselSpec, sameColor, contrast } = await sp;
  const checklist = { colors: ['marrom', 'creme'], forbidden: ['emojis'], handles: ['@cafeaurora'], hashtags: [] };
  const raw = { style: 'editorial', palette: { background: '#2b1d14', accent: '#c8894b' }, caption: 'Legenda ☕ completa e útil para o post de hoje.',
    slides: [{ kind: 'content', title: 'Capa 🔥' }, { title: 'A', imageSource: 'generate', imagePrompt: 'x' }, { title: 'B' }, { title: 'C', imageSource: 'generate', imagePrompt: 'y' }, { kind: 'cta', title: 'Fim' }] };
  const s = normalizeCarouselSpec(raw, { checklist, userImages: 2, maxImages: 1 });
  assert.equal(s.slides[0].kind, 'cover');
  assert.equal(s.slides[0].title, 'Capa');
  assert.ok(!/☕/.test(s.caption));
  assert.equal(s.handle, '@cafeaurora');
  assert.deepEqual(s.slides.filter(x => x.imageSource === 'user').map(x => x.userImage).sort(), [1, 2]);
  assert.ok(s.slides.filter(x => x.imageSource === 'generate').length <= 1);
  assert.ok(sameColor(s.palette.text, '#f6efe2') || sameColor(s.palette.background, '#f6efe2'));
  assert.ok(contrast(s.palette.text, s.palette.background) >= 4.5);
});

test('inspeção: quantidade de slides e "minhas duas fotos" não vira total de imagens', async () => {
  const { normalizeCarouselSpec, inspectCarousel } = await sp;
  const { buildChecklist } = await ck;
  const checklist = buildChecklist('carrossel de 5 slides, use minhas duas fotos');
  const s = normalizeCarouselSpec({ caption: 'Uma legenda boa o bastante para passar na conferência.', slides: [{ title: 'a', imageSource: 'user', userImage: 1 }, { title: 'b', imageSource: 'generate', imagePrompt: 'p' }, { title: 'c', imageSource: 'user', userImage: 2 }, { title: 'd' }] }, { checklist, userImages: 2 });
  const issues = inspectCarousel(s, { checklist, userImages: 2 });
  assert.deepEqual(issues, ['o usuário pediu 5 slides/páginas ("5 slides") e o resultado tem 4']);
});

test('render: PNGs no tamanho do formato, texto longo detectado, PDF e ZIP válidos', async () => {
  const { normalizeCarouselSpec } = await sp;
  const { renderCarousel, measureCarousel, carouselPdf, carouselZip } = await rd;
  const spec = normalizeCarouselSpec({ caption: 'x'.repeat(50), slides: [{ kind: 'cover', title: 'Título da capa' }, { kind: 'list', title: 'Lista', bullets: ['um', 'dois', 'três'] }, { kind: 'stat', statValue: '80+', statLabel: 'pontos' }, { kind: 'quote', quote: 'Frase curta.' }, { kind: 'cta', title: 'Salve' }] }, { format: 'square' });
  const out = await renderCarousel(spec);
  assert.equal(out.slides.length, 5);
  assert.equal(out.width, 1080); assert.equal(out.height, 1080);
  assert.equal(out.slides[0].subarray(1, 4).toString(), 'PNG');
  const long = normalizeCarouselSpec({ slides: [{ kind: 'cover', title: 'Capa', body: 'palavra '.repeat(60) }, { title: 'a' }, { title: 'b' }] });
  assert.equal(measureCarousel(long).length, 1);
  const pdf = await carouselPdf(out.slides, { width: 1080, height: 1080, title: 't' });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const zip = await carouselZip(out.slides, { slug: 's', caption: 'c', hashtags: ['#a'] });
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
});
