import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSandpackPreviewConfig, frontendFilesOnly } from '../src/lib/projectPreviewConfig.js';

const files = [
  { path: 'package.json', content: JSON.stringify({ dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', recharts: '^2.13.0' }, devDependencies: { vite: '^5' } }) },
  { path: 'index.html', content: '<div id="root"></div><script type="module" src="/src/main.jsx"></script>' },
  { path: 'src/main.jsx', content: 'import App from "./App.jsx";' },
  { path: 'src/App.jsx', content: 'export default () => null;' },
  { path: 'src/api/client.js', content: 'export const x = 1;' },
  { path: 'server/package.json', content: JSON.stringify({ type: 'module', dependencies: { express: '^4', pg: '^8' } }) },
  { path: 'server/index.js', content: 'import express from "express";' },
  { path: 'server/schema.sql', content: 'CREATE TABLE t (id int);' },
  { path: 'server/.env.example', content: 'DATABASE_URL=' },
  { path: 'worker/package.json', content: '{}' },
  { path: 'worker/job.js', content: '' },
  { path: 'README.md', content: '#' }
];

test('preview full-stack: só o frontend vai para o navegador', () => {
  const kept = frontendFilesOnly(files).map(f => f.path);
  assert.deepEqual(kept, ['package.json', 'index.html', 'src/main.jsx', 'src/App.jsx', 'src/api/client.js']);
  const cfg = buildSandpackPreviewConfig(files);
  assert.equal(cfg.customSetup.entry, '/src/main.jsx');
  assert.ok(!Object.keys(cfg.files).some(p => p.startsWith('/server') || p.endsWith('.sql')));
  assert.deepEqual(Object.keys(cfg.customSetup.dependencies).sort(), ['react', 'react-dom', 'recharts']);
});

test('preview full-stack: /api falha na hora (modo demonstração) e outros fetch continuam normais', async () => {
  const cfg = buildSandpackPreviewConfig(files);
  const page = cfg.files['/public/index.html'].code;
  const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  const calls = [];
  const win = { fetch: async u => { calls.push(String(u)); return { ok: true }; } };
  const fn = new Function('window', 'location', 'console', script);
  fn(win, { href: 'https://preview.test/', origin: 'https://preview.test' }, { info() {} });
  await assert.rejects(win.fetch('/api/dashboard'), /servidor da API/);
  await assert.rejects(win.fetch('https://preview.test/api/produtos?x=1'), TypeError);
  await win.fetch('/apiary.json'); await win.fetch('https://cdn.example/data.json');
  assert.deepEqual(calls, ['/apiary.json', 'https://cdn.example/data.json']);
  const front = buildSandpackPreviewConfig(files.filter(f => !/^(server|worker)\//.test(f.path)));
  assert.doesNotMatch(front.files['/public/index.html'].code, /servidor da API/);
});
