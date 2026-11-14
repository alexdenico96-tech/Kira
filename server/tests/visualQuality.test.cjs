const test = require('node:test');
const assert = require('node:assert/strict');
const design = import('../lib/designDirection.js');
const visual = import('../lib/visualQuality.js');

test('brief detecta segmento, estilo e cores pedidas', async () => {
  const { buildDesignBrief } = await design;
  const b = buildDesignBrief('Crie um site de restaurante italiano, tema escuro, cores vinho e dourado');
  assert.equal(b.domain, 'restaurante');
  assert.ok(b.styles.includes('dark'));
  assert.equal(b.palette.primary, '#7f1d1d');
  assert.equal(b.palette.accent, '#c9a227');
});

test('nome de cor fora de contexto de paleta não vira cor do tema', async () => {
  const { extractRequestedColors } = await design;
  assert.equal(extractRequestedColors('site de concessionária com um carro vermelho no hero').named.length, 0);
  assert.deepEqual(extractRequestedColors('use a cor #ff6600').hex, ['#ff6600']);
});

test('gate visual reprova CSS sem tokens, sem media query e com imagem morta', async () => {
  const { inspectVisualQuality } = await visual;
  const r = inspectVisualQuality([
    { path: 'index.html', content: '<main><img src="https://source.unsplash.com/800x600/?car"></main>' },
    { path: 'style.css', content: 'body{color:#333}' }
  ], 'crie um site');
  assert.equal(r.ok, false);
  assert.ok(r.issues.some(i => i.includes('@media')));
  assert.ok(r.issues.some(i => i.includes('design tokens')));
  assert.ok(r.issues.some(i => i.includes('descontinuado')));
});

test('gate visual aprova projeto bem acabado e cobra cor hex pedida', async () => {
  const { inspectVisualQuality } = await visual;
  const files = [
    { path: 'index.html', content: '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"><main><img src="https://image.pollinations.ai/prompt/car" alt="carro"></main>' },
    { path: 'style.css', content: ':root{--bg:#0b0d10;--text:#f3f5f7;--primary:#e63946;--radius:8px}main{display:grid}a:hover{opacity:.8}a:focus-visible{outline:2px solid}a{transition:all .2s}h1{font-size:clamp(2rem,5vw,4rem)}@media (min-width:640px){main{gap:1rem}}' }
  ];
  assert.equal(inspectVisualQuality(files, 'site escuro').ok, true);
  const missing = inspectVisualQuality(files, 'site com a cor #00ff88');
  assert.ok(missing.issues.some(i => i.includes('#00ff88')));
});

test('repairImageSources troca host morto por imagem gerada a partir do alt', async () => {
  const { repairImageSources } = await visual;
  const { files, replaced } = repairImageSources([{ path: 'index.html', content: '<img src="https://via.placeholder.com/600x400" alt="Honda Civic prata">' }]);
  assert.equal(replaced, 1);
  assert.match(files[0].content, /pollinations\.ai\/prompt\/Honda%20Civic%20prata\?width=600&height=400/);
});

test('prompts de projeto incluem direção visual, exceto backend puro', async () => {
  const { developerPrompt } = await import('../lib/developerAgent.js');
  const { artifactQualityPrompt } = await import('../lib/artifactQuality.js');
  assert.match(developerPrompt('Crie um dashboard em React'), /DIREÇÃO VISUAL/);
  assert.doesNotMatch(developerPrompt('Crie uma API REST em Express com postgres'), /DIREÇÃO VISUAL/);
  assert.match(artifactQualityPrompt('Crie uma landing page para clínica odontológica'), /--primary: #0e7490/);
});
