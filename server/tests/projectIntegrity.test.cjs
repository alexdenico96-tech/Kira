const test = require('node:test');
const assert = require('node:assert/strict');
const fullstack = require('./fixtures/fullstack.cjs');
const checks = import('../lib/projectChecks.js');
const delivery = import('../lib/projectDelivery.js');
const syntax = import('../lib/syntaxGate.js');
const swap = (files, path, fn) => files.map(f => f.path === path ? { ...f, content: fn(f.content) } : f);

test('projeto full-stack correto passa em tudo', async () => {
  const { inspectProjectIntegrity } = await checks;
  assert.deepEqual(inspectProjectIntegrity(fullstack(), { database: true }), { blocking: [], soft: [] });
});

test('import local para arquivo inexistente bloqueia', async () => {
  const { inspectProjectIntegrity } = await checks;
  const files = swap(fullstack(), 'src/App.jsx', c => c.replace('./lib/api.js', './services/tasks.js'));
  assert.match(inspectProjectIntegrity(files).blocking[0], /src\/App\.jsx: importa "\.\/services\/tasks\.js"/);
});

test('pacote importado sem estar no package.json é adicionado ao package.json certo', async () => {
  const { repairMissingDependencies } = await checks;
  let files = swap(fullstack(), 'server/index.js', c => 'import helmet from "helmet";\n' + c);
  const r = repairMissingDependencies(files);
  assert.deepEqual(r.added.sort(), ['package.json:lucide-react', 'server/package.json:helmet']);
  const root = JSON.parse(r.files.find(f => f.path === 'package.json').content);
  assert.equal(root.dependencies['lucide-react'], '^0.460.0');
  assert.equal(JSON.parse(r.files.find(f => f.path === 'server/package.json').content).dependencies.helmet, '^8.0.0');
  assert.equal(repairMissingDependencies(r.files).added.length, 0);
});

test('banco de dados: SQL injection, senha no código, falta de schema/.env.example', async () => {
  const { inspectProjectIntegrity } = await checks;
  let files = swap(fullstack(), 'server/index.js', c => c.replace('query("SELECT * FROM tasks ORDER BY id")', 'query(`SELECT * FROM tasks WHERE title = \'${_q.query.t}\'`)'));
  files = swap(files, 'server/db.js', c => c.replace('process.env.DATABASE_URL', '"postgresql://admin:SuperSecreta1@db.exemplo.com/app"'));
  files = files.filter(f => !/schema\.sql|\.env\.example/.test(f.path));
  const soft = inspectProjectIntegrity(files, { database: true }).soft.join('\n');
  assert.match(soft, /SQL injection/);
  assert.match(soft, /senha do banco escrita no código/);
  assert.match(soft, /sem server\/schema\.sql/);
  assert.match(soft, /falta server\/\.env\.example/);
});

test('detecção de pedido com banco de dados (pt/es/en)', async () => {
  const { detectDatabaseRequest } = await checks;
  for (const t of ['crie um app de tarefas com banco de dados', 'sistema de estoque com PostgreSQL', 'una app con base de datos', 'a todo app with a REST API and database', 'faça um CRUD de clientes'])
    assert.equal(detectDatabaseRequest(t), true, t);
  assert.equal(detectDatabaseRequest('crie uma landing page de café'), false);
});

test('verificador de sintaxe usa o package.json mais próximo (server ESM com raiz sem "type")', async () => {
  const { inspectProjectSyntax } = await syntax;
  const files = swap(fullstack(), 'package.json', c => { const p = JSON.parse(c); delete p.type; return JSON.stringify(p); });
  assert.deepEqual(inspectProjectSyntax(files).issues, []);
});

test('mensagem de entrega: comandos reais, banco antes de rodar, variáveis, estrutura e sugestões', async () => {
  const { projectDeliveryMessage } = await delivery;
  const msg = projectDeliveryMessage({ files: fullstack(), name: 'Tarefas', summary: 'Lista de tarefas\nAPI com PostgreSQL', suggestions: ['Adicionar login por usuário', 'Filtros por status'] });
  assert.ok(msg.indexOf('Conectar o PostgreSQL') < msg.indexOf('Como rodar'));
  assert.match(msg, /cd server\n\s+npm install\n\s+npm run db:setup/);
  assert.match(msg, /http:\/\/localhost:5173/);
  assert.match(msg, /http:\/\/localhost:3001\/api\/health/);
  assert.match(msg, /`DATABASE_URL`, `DATABASE_SSL`, `PORT`/);
  assert.match(msg, /`server\/schema\.sql` — tabelas do banco/);
  assert.match(msg, /- Adicionar login por usuário/);
  const es = projectDeliveryMessage({ files: fullstack().filter(f => !f.path.startsWith('server/')), name: 'Tienda', lang: 'es' });
  assert.match(es, /Cómo ejecutarlo/);
  assert.doesNotMatch(es, /PostgreSQL/);
  const edit = projectDeliveryMessage({ files: fullstack(), name: 'Tarefas', mode: 'edit', version: 3, summary: 'Botão de excluir', manifest: { created: [], updated: ['src/App.jsx'], deleted: [] } });
  assert.match(edit, /para a \*\*v3\*\*[\s\S]*Botão de excluir[\s\S]*`src\/App\.jsx` \(alterado\)/);
  assert.doesNotMatch(edit, /Como rodar/);
  const site = projectDeliveryMessage({ files: [{ path: 'index.html', content: '<h1>x</h1>' }, { path: 'style.css', content: '' }], name: 'Site' });
  assert.match(site, /Abra o `index\.html`/);
});

test('validação final aceita server/ com o próprio package.json e acusa só o que falta de verdade', async () => {
  const { inspectProjectFiles } = await import('../lib/qualityGate.js');
  const { repairMissingDependencies } = await checks;
  assert.deepEqual(inspectProjectFiles(fullstack()).issues, ['src/App.jsx: dependência externa não declarada no package.json: lucide-react']);
  assert.deepEqual(inspectProjectFiles(repairMissingDependencies(fullstack()).files).issues, []);
});

test('modo demonstração: api.js sem checar content-type é apontado; reparo das flags do React Router', async () => {
  const { inspectProjectIntegrity, repairRouterFutureFlags } = await checks;
  const naive = swap(fullstack(), 'src/lib/api.js', () => 'const API = "/api";\nexport async function listTasks() { const r = await fetch(`${API}/tasks`); return r.json(); }');
  const soft = inspectProjectIntegrity(naive, { database: true }).soft.join('\n');
  assert.match(soft, /content-type/);
  assert.match(soft, /não tem modo demonstração/);
  const good = swap(fullstack(), 'src/lib/api.js', () => 'const API = "/api"; const demo = [];\nexport async function listTasks() { try { const r = await fetch(`${API}/tasks`); if (!r.headers.get("content-type")?.includes("application/json")) return demo; return await r.json(); } catch { return demo; } }');
  assert.deepEqual(inspectProjectIntegrity(good, { database: true }).soft, []);
  let files = swap(fullstack(), 'package.json', c => { const p = JSON.parse(c); p.dependencies['react-router-dom'] = '^6.28.0'; return JSON.stringify(p); });
  files = swap(files, 'src/main.jsx', c => c.replace('<App />', '<BrowserRouter><App /></BrowserRouter>'));
  const r = repairRouterFutureFlags(files);
  assert.equal(r.fixed, 1);
  assert.match(r.files.find(f => f.path === 'src/main.jsx').content, /<BrowserRouter future=\{\{ v7_startTransition: true, v7_relativeSplatPath: true \}\}>/);
  assert.equal(repairRouterFutureFlags(r.files).fixed, 0);
});
