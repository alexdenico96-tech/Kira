const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mod = import('../lib/imageFidelity.js');
const imgDir = path.resolve(__dirname, '../generated-images');
const metaDir = path.resolve(__dirname, '../generated-images-meta');

let n = 0;
const fakeGenerate = calls => async (request, options) => {
  calls.push(options);
  fs.mkdirSync(imgDir, { recursive: true });
  const name = `teste-${process.pid}-${n++}.png`;
  fs.writeFileSync(path.join(imgDir, name), Buffer.alloc(300, 7));
  return `/api/generated-images/${name}`;
};
const plan = JSON.stringify({ prompt: 'A small orange cat wearing a blue astronaut helmet floating above the Moon, photorealistic', elements: ['gato laranja', 'capacete azul', 'Lua'], aspect: 'landscape', style: 'photo' });

test('planeja, confere e refaz quando a nota fica abaixo do mínimo, ficando com a melhor', async () => {
  const { createFaithfulImage } = await mod;
  const calls = [], steps = [];
  const scores = [5, 9];
  const result = await createFaithfulImage({
    request: 'gato laranja com capacete azul flutuando sobre a Lua',
    ask: async () => plan,
    askVision: async () => JSON.stringify({ score: scores.shift(), missing: ['capacete azul'], extra: [] }),
    generate: fakeGenerate(calls),
    onProgress: (id, label) => steps.push(label)
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].layout.width, 1152); // proporção planejada (paisagem)
  assert.match(calls[1].plannedPrompt, /^Clearly visible and accurate: capacete azul/);
  assert.equal(result.verification.score, 9);
  assert.equal(fs.existsSync(path.join(imgDir, path.basename(result.url))), true);
  assert.ok(steps.includes('Imagem pronta'));
});

test('edição reaproveita a seed e o prompt anterior', async () => {
  const { createFaithfulImage } = await mod;
  const calls = [];
  let planAsk = '';
  await createFaithfulImage({
    request: 'agora deixe o céu roxo',
    previous: { prompt: 'A lighthouse at sunset', seed: 4242, aspect: 'portrait' },
    ask: async p => { planAsk = p; return plan; },
    askVision: async () => JSON.stringify({ score: 10, missing: [], extra: [] }),
    generate: fakeGenerate(calls)
  });
  assert.equal(calls[0].seed, 4242);
  assert.equal(calls[0].layout.height, 1152);
  assert.match(planAsk, /PREVIOUS PROMPT: A lighthouse at sunset/);
});

test('sem modelos auxiliares ainda gera uma imagem (plano de reserva)', async () => {
  const { createFaithfulImage } = await mod;
  const calls = [];
  const result = await createFaithfulImage({ request: 'um farol em estilo 16:9', generate: fakeGenerate(calls) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].layout.width, 1152);
  assert.ok(result.url);
});

test('detecta ajuste da última imagem e pedido com foto de referência', async () => {
  const { isImageEditFollowUp, isReferenceImageRequest } = await mod;
  assert.equal(isImageEditFollowUp('agora deixe o céu roxo'), true);
  assert.equal(isImageEditFollowUp('coloque um chapéu nele'), true);
  assert.equal(isImageEditFollowUp('o que você acha dessa imagem?'), false);
  assert.equal(isImageEditFollowUp('mude a cor do botão no site'), false);
  assert.equal(isReferenceImageRequest('transforme essa foto em anime'), true);
  assert.equal(isReferenceImageRequest('descreva essa imagem'), false);
});

test.after(() => {
  for (const dir of [imgDir, metaDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`teste-${process.pid}-`)) fs.rmSync(path.join(dir, f));
  }
});
