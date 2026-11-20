const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mod = import('../lib/projectImages.js');
const dir = path.resolve(__dirname, '../project-images');

const html = '<img src="https://image.pollinations.ai/prompt/bacon%20burger?width=600&height=400&seed=3&nologo=true" alt="x">' +
  '<img src="https://image.pollinations.ai/prompt/bacon%20burger?width=600&amp;height=400&amp;seed=3&amp;nologo=true">' +
  '<div style="background:url(https://image.pollinations.ai/prompt/restaurant%20interior?width=1200&height=800&seed=9)"></div>';

test('reescreve URLs do Pollinations para a rota da Kira e deduplica', async () => {
  const { rewriteProjectImages } = await mod;
  const { files, ids } = await rewriteProjectImages([{ path: 'index.html', content: html }], 'https://kira.app/');
  assert.equal(ids.length, 2);
  assert.doesNotMatch(files[0].content, /pollinations/);
  assert.match(files[0].content, /https:\/\/kira\.app\/api\/project-images\/[a-f0-9]{24}\?m=[\w-]+"/);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, ids[0] + '.json'), 'utf8'));
  assert.equal(manifest.prompt, 'bacon burger');
  assert.equal(manifest.width, 576);
});

test('sem Cloudflare: nenhuma chamada externa, fundo neutro do tamanho certo e sem cache (tenta de novo depois)', async () => {
  const { rewriteProjectImages, getProjectImage } = await mod;
  const { ids } = await rewriteProjectImages([{ path: 'a.html', content: '<img src="https://image.pollinations.ai/prompt/teste%20cache%20' + Date.now() + '?width=512&height=512">' }], '');
  const urls = [];
  const original = global.fetch;
  global.fetch = async url => { urls.push(String(url)); throw new Error('rede bloqueada no teste'); };
  try {
    const first = await getProjectImage(ids[0]);
    assert.match(first.placeholder, /^<svg[^>]+width="512" height="512"/);
    assert.equal(urls.filter(u => /pollinations/.test(u)).length, 0);
    const files = fs.readdirSync(dir).filter(f => f.startsWith(ids[0]) && !f.endsWith('.json'));
    assert.equal(files.length, 0);
    assert.ok((await getProjectImage(ids[0])).placeholder);
  } finally { global.fetch = original; }
});

test('id desconhecido ou inválido não gera nada', async () => {
  const { getProjectImage } = await mod;
  assert.equal(await getProjectImage('../../etc/passwd'), null);
  assert.equal(await getProjectImage('a'.repeat(24)), null);
});

test('regenera a partir da URL assinada após o disco ser apagado, e recusa assinatura falsa', async () => {
  const { rewriteProjectImages, getProjectImage } = await mod;
  const { files, ids } = await rewriteProjectImages([{ path: 'b.html', content: '<img src="https://image.pollinations.ai/prompt/disco%20apagado%20' + Date.now() + '?width=512&height=512">' }], '');
  const token = files[0].content.match(/\?m=([\w-]+)/)[1];
  fs.rmSync(dir, { recursive: true, force: true });
  const original = global.fetch;
  global.fetch = async () => { throw new Error('rede bloqueada no teste'); };
  try {
    assert.ok((await getProjectImage(ids[0], token)).placeholder);
    const forged = Buffer.from(JSON.stringify({ p: 'qualquer prompt', w: 512, h: 512, s: 1 })).toString('base64url');
    assert.equal(await getProjectImage('b'.repeat(24), forged), null);
  } finally { global.fetch = original; }
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
