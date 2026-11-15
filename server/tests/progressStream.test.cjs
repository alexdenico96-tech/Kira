const test = require('node:test');
const assert = require('node:assert/strict');

async function serve(handler) {
  const express = (await import('express')).default;
  const { progressStream } = await import('../lib/progressStream.js');
  const app = express();
  app.post('/x', progressStream, handler);
  return new Promise(resolve => { const server = app.listen(0, () => resolve(server)); });
}

test('com Accept ndjson envia progresso e o resultado final com o status original', async () => {
  const server = await serve((req, res) => { req.progress('build', 'Construindo'); req.progress('build', 'Fase 1 finalizada', '3 arquivos', 'done'); res.status(422).json({ error: 'falhou' }); });
  const r = await fetch(`http://localhost:${server.address().port}/x`, { method: 'POST', headers: { accept: 'application/x-ndjson' } });
  const lines = (await r.text()).trim().split('\n').map(l => JSON.parse(l));
  server.close();
  assert.deepEqual(lines.map(l => l.type), ['progress', 'progress', 'result']);
  assert.equal(lines[1].state, 'done');
  assert.equal(lines[2].status, 422);
  assert.equal(lines[2].body.error, 'falhou');
});

test('sem o header responde JSON normal (clientes antigos)', async () => {
  const server = await serve((req, res) => { req.progress('x', 'ignorado'); res.status(201).json({ ok: true }); });
  const r = await fetch(`http://localhost:${server.address().port}/x`, { method: 'POST' });
  const body = await r.json();
  server.close();
  assert.equal(r.status, 201);
  assert.deepEqual(body, { ok: true });
});
