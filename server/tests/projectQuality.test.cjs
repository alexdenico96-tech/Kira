const test = require('node:test');
const assert = require('node:assert/strict');

const qualityPromise = import('../lib/qualityGate.js');
const developerPromise = import('../lib/developerAgent.js');

test('quality gate rejects path traversal and duplicate normalized paths', async () => {
  const { inspectProjectFiles } = await qualityPromise;
  const report = inspectProjectFiles([
    { path: '../outside.js', content: 'export default 1;' },
    { path: 'src/../src/App.jsx', content: 'export default function App(){ return null; }' },
    { path: 'src/App.jsx', content: 'export default function App(){ return null; }' }
  ]);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(issue => issue.includes('Caminho inseguro')));
  assert.ok(report.issues.some(issue => issue.includes('Arquivo duplicado')));
});

test('quality gate reports unresolved local imports as blocking issues', async () => {
  const { inspectProjectFiles } = await qualityPromise;
  const report = inspectProjectFiles([
    { path: 'src/main.jsx', content: 'import App from "./MissingApp"; export default App;' },
    { path: 'package.json', content: JSON.stringify({ dependencies: { react: '^18.0.0' } }) }
  ]);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(issue => issue.includes('arquivo importado não encontrado')));
});

test('quality gate blocks undeclared external packages while accepting resolved local imports', async () => {
  const { inspectProjectFiles } = await qualityPromise;
  const report = inspectProjectFiles([
    { path: 'src/main.jsx', content: 'import App from "./App"; import dayjs from "dayjs"; export default App;' },
    { path: 'src/App.jsx', content: 'export default function App(){ return null; }' },
    { path: 'package.json', content: JSON.stringify({ dependencies: { react: '^18.0.0' } }) }
  ]);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(issue => issue.includes('dayjs')));
});

test('developer agent detects requested frontend stacks without collapsing them to React', async () => {
  const { detectRequestedStack, buildProjectSpec } = await developerPromise;
  assert.equal(detectRequestedStack('Crie um painel em Vue'), 'vue');
  assert.equal(detectRequestedStack('Crie um site com SvelteKit'), 'svelte');
  assert.equal(detectRequestedStack('Crie um site em Angular'), 'angular');
  assert.equal(detectRequestedStack('Crie um blog com Astro'), 'astro');
  assert.ok(buildProjectSpec('Crie um app em Vue').requirements.some(item => item.includes('src/App.vue')));
});
