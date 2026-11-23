// KIRA_PROJECT_DELIVERY_V1
// Mensagem de entrega de projeto no chat, como um desenvolvedor explicaria: o que foi feito, como rodar
// (comandos reais tirados do package.json), estrutura, variáveis de ambiente, banco de dados e próximos passos.
import { hasDatabaseCode } from './projectChecks.js';

const norm = p => String(p || '').replaceAll('\\', '/').replace(/^\.\//, '');

const L = {
  pt: {
    ready: n => `**${n}** está pronto.`, updated: (n, v) => `Atualizei **${n}** para a **v${v}**.`,
    built: 'O que foi feito', changed: 'O que mudou', created: 'criado', updatedF: 'alterado', deleted: 'removido',
    preview: 'A pré-visualização já está aberta no painel ao lado.',
    previewDemo: 'Na pré-visualização a Kira mostra os dados de demonstração; para salvar de verdade, rode o servidor com o banco conectado.',
    run: 'Como rodar no seu computador', download: 'No painel do projeto, clique no ícone de pasta (**Baixar ZIP**) e extraia os arquivos.',
    inFolder: 'Na pasta do projeto:', open: url => `Abra **${url}** no navegador.`, staticOpen: 'Abra o `index.html` no navegador (ou use a extensão Live Server do VS Code).',
    needs: 'Você precisa do **Node.js 18 ou mais novo** instalado.', two: 'São dois terminais: um para o servidor (API) e outro para o site.',
    t1: 'Terminal 1 — servidor:', t2: 'Terminal 2 — site:',
    db: 'Conectar o PostgreSQL', dbCreate: 'Crie um banco PostgreSQL. Pode ser **local** (instale o PostgreSQL e crie um banco, por exemplo `createdb meu_app`) ou **na nuvem** (Neon, Supabase, Render ou Railway): copie a *connection string* que o serviço mostra.',
    dbEnv: f => `Copie \`${f}\` para \`${f.replace(/\.example$/, '')}\` e cole a sua connection string em \`DATABASE_URL\`. Em bancos na nuvem, coloque também \`DATABASE_SSL=true\`.`,
    dbSetup: 'Crie as tabelas e os dados de exemplo:', dbPsql: f => `Ou, se você tem o \`psql\`: \`psql "SUA_DATABASE_URL" -f ${f}\``,
    dbCheck: url => `Depois de iniciar o servidor (passo abaixo), teste a conexão em **${url}** — deve responder \`{ ok: true }\`.`,
    dbSafe: ok => `Nunca envie o arquivo \`.env\` para o GitHub: ele tem a senha do banco${ok ? ' (o `.gitignore` do projeto já o ignora)' : ' — adicione `.env` ao `.gitignore`'}.`,
    env: 'Variáveis de ambiente', envText: f => `Definidas em \`${f}\`:`,
    structure: 'Estrutura principal', more: n => `…e mais ${n} arquivo(s).`,
    next: 'Sugestões de próximos passos', ask: 'Quer que eu faça alguma dessas? É só pedir.'
  },
  es: {
    ready: n => `**${n}** está listo.`, updated: (n, v) => `Actualicé **${n}** a la **v${v}**.`,
    built: 'Qué se hizo', changed: 'Qué cambió', created: 'creado', updatedF: 'modificado', deleted: 'eliminado',
    preview: 'La vista previa ya está abierta en el panel lateral.',
    previewDemo: 'En la vista previa se muestran datos de demostración; para guardar de verdad, ejecuta el servidor con la base de datos conectada.',
    run: 'Cómo ejecutarlo en tu computadora', download: 'En el panel del proyecto, haz clic en el ícono de carpeta (**Descargar ZIP**) y extrae los archivos.',
    inFolder: 'En la carpeta del proyecto:', open: url => `Abre **${url}** en el navegador.`, staticOpen: 'Abre `index.html` en el navegador (o usa la extensión Live Server de VS Code).',
    needs: 'Necesitas **Node.js 18 o superior** instalado.', two: 'Son dos terminales: una para el servidor (API) y otra para el sitio.',
    t1: 'Terminal 1 — servidor:', t2: 'Terminal 2 — sitio:',
    db: 'Conectar PostgreSQL', dbCreate: 'Crea una base de datos PostgreSQL. Puede ser **local** (instala PostgreSQL y crea una base, por ejemplo `createdb mi_app`) o **en la nube** (Neon, Supabase, Render o Railway): copia la *connection string* que muestra el servicio.',
    dbEnv: f => `Copia \`${f}\` a \`${f.replace(/\.example$/, '')}\` y pega tu connection string en \`DATABASE_URL\`. En bases en la nube, agrega también \`DATABASE_SSL=true\`.`,
    dbSetup: 'Crea las tablas y los datos de ejemplo:', dbPsql: f => `O, si tienes \`psql\`: \`psql "TU_DATABASE_URL" -f ${f}\``,
    dbCheck: url => `Después de iniciar el servidor (paso siguiente), prueba la conexión en **${url}** — debe responder \`{ ok: true }\`.`,
    dbSafe: ok => `Nunca subas el archivo \`.env\` a GitHub: contiene la contraseña de la base${ok ? ' (el `.gitignore` del proyecto ya lo ignora)' : ' — agrega `.env` al `.gitignore`'}.`,
    env: 'Variables de entorno', envText: f => `Definidas en \`${f}\`:`,
    structure: 'Estructura principal', more: n => `…y ${n} archivo(s) más.`,
    next: 'Sugerencias de próximos pasos', ask: '¿Quieres que haga alguna? Solo pídelo.'
  },
  en: {
    ready: n => `**${n}** is ready.`, updated: (n, v) => `I updated **${n}** to **v${v}**.`,
    built: 'What was built', changed: 'What changed', created: 'created', updatedF: 'updated', deleted: 'removed',
    preview: 'The preview is already open in the side panel.',
    previewDemo: 'The preview shows demo data; to save for real, run the server with the database connected.',
    run: 'How to run it on your computer', download: 'In the project panel, click the folder icon (**Download ZIP**) and extract the files.',
    inFolder: 'In the project folder:', open: url => `Open **${url}** in your browser.`, staticOpen: 'Open `index.html` in your browser (or use the VS Code Live Server extension).',
    needs: 'You need **Node.js 18 or newer** installed.', two: 'You need two terminals: one for the server (API) and one for the site.',
    t1: 'Terminal 1 — server:', t2: 'Terminal 2 — site:',
    db: 'Connect PostgreSQL', dbCreate: 'Create a PostgreSQL database. It can be **local** (install PostgreSQL and create a database, e.g. `createdb my_app`) or **in the cloud** (Neon, Supabase, Render or Railway): copy the *connection string* the service shows.',
    dbEnv: f => `Copy \`${f}\` to \`${f.replace(/\.example$/, '')}\` and paste your connection string into \`DATABASE_URL\`. For cloud databases also set \`DATABASE_SSL=true\`.`,
    dbSetup: 'Create the tables and sample data:', dbPsql: f => `Or, if you have \`psql\`: \`psql "YOUR_DATABASE_URL" -f ${f}\``,
    dbCheck: url => `After starting the server (next step), test the connection at **${url}** — it should return \`{ ok: true }\`.`,
    dbSafe: ok => `Never push the \`.env\` file to GitHub: it holds the database password${ok ? ' (the project\'s `.gitignore` already ignores it)' : ' — add `.env` to `.gitignore`'}.`,
    env: 'Environment variables', envText: f => `Defined in \`${f}\`:`,
    structure: 'Main structure', more: n => `…and ${n} more file(s).`,
    next: 'Suggested next steps', ask: 'Want me to do any of these? Just ask.'
  }
};

const ROLE = {
  pt: [[/^package\.json$/, 'dependências e scripts'], [/^index\.html$/, 'página base'], [/^src\/main\.[jt]sx?$/, 'ponto de entrada do React'], [/^src\/App\.[jt]sx?$/, 'componente principal e rotas'],
    [/^src\/(?:pages|views|routes)\//, 'página'], [/^src\/components\//, 'componente'], [/^src\/(?:lib|services|api)\//, 'acesso à API/serviços'], [/^src\/(?:hooks)\//, 'hook'], [/^src\/(?:context|store|stores)\//, 'estado global'],
    [/\.css$/, 'estilos'], [/^server\/index\.[jt]s$/, 'servidor Express e rotas da API'], [/^server\/db\.[jt]s$/, 'conexão com o PostgreSQL'], [/^server\/(?:routes|controllers)\//, 'rotas da API'],
    [/schema\.sql$/, 'tabelas do banco'], [/seed\.sql$/, 'dados de exemplo'], [/setup-db\.[jt]s$/, 'cria as tabelas no banco'], [/\.env\.example$/, 'modelo das variáveis de ambiente'], [/README\.md$/i, 'documentação'],
    [/vite\.config/, 'configuração do Vite'], [/^script\.js$/, 'interações'], [/^style\.css$/, 'estilos']],
  es: null, en: null
};
const ROLE_T = {
  es: { 'dependências e scripts': 'dependencias y scripts', 'página base': 'página base', 'ponto de entrada do React': 'punto de entrada de React', 'componente principal e rotas': 'componente principal y rutas', 'página': 'página', 'componente': 'componente', 'acesso à API/serviços': 'acceso a la API/servicios', 'hook': 'hook', 'estado global': 'estado global', 'estilos': 'estilos', 'servidor Express e rotas da API': 'servidor Express y rutas de la API', 'conexão com o PostgreSQL': 'conexión con PostgreSQL', 'rotas da API': 'rutas de la API', 'tabelas do banco': 'tablas de la base', 'dados de exemplo': 'datos de ejemplo', 'cria as tabelas no banco': 'crea las tablas en la base', 'modelo das variáveis de ambiente': 'plantilla de variables de entorno', 'documentação': 'documentación', 'configuração do Vite': 'configuración de Vite', 'interações': 'interacciones' },
  en: { 'dependências e scripts': 'dependencies and scripts', 'página base': 'base page', 'ponto de entrada do React': 'React entry point', 'componente principal e rotas': 'main component and routes', 'página': 'page', 'componente': 'component', 'acesso à API/serviços': 'API/services access', 'hook': 'hook', 'estado global': 'global state', 'estilos': 'styles', 'servidor Express e rotas da API': 'Express server and API routes', 'conexão com o PostgreSQL': 'PostgreSQL connection', 'rotas da API': 'API routes', 'tabelas do banco': 'database tables', 'dados de exemplo': 'sample data', 'cria as tabelas no banco': 'creates the database tables', 'modelo das variáveis de ambiente': 'environment variables template', 'documentação': 'documentation', 'configuração do Vite': 'Vite config', 'interações': 'interactions' }
};
const roleOf = (p, lang) => { const r = ROLE.pt.find(([re]) => re.test(p))?.[1]; return r ? (lang === 'pt' ? r : ROLE_T[lang]?.[r] || r) : ''; };

function readJson(file) { try { return JSON.parse(file.content); } catch { return null; } }

/** Lê o projeto e descobre como rodá-lo (sem inventar nada que não esteja nos arquivos). */
export function analyzeRunInfo(files = []) {
  const byPath = new Map((files || []).filter(f => f?.path).map(f => [norm(f.path), f]));
  const rootPkg = byPath.has('package.json') ? readJson(byPath.get('package.json')) : null;
  const serverDir = ['server', 'backend', 'api'].find(d => byPath.has(`${d}/package.json`));
  const serverPkg = serverDir ? readJson(byPath.get(`${serverDir}/package.json`)) : null;
  const deps = { ...(rootPkg?.dependencies || {}), ...(rootPkg?.devDependencies || {}) };
  const kind = !rootPkg && byPath.has('index.html') ? 'static' : deps.next ? 'next' : deps.vite ? 'vite' : rootPkg ? 'node' : 'static';
  const viteCfg = [...byPath.keys()].find(p => /^vite\.config\.[jt]s$/.test(p));
  const vitePort = viteCfg && byPath.get(viteCfg).content.match(/port\s*:\s*(\d{2,5})/)?.[1];
  const frontUrl = kind === 'vite' ? `http://localhost:${vitePort || 5173}` : kind === 'next' ? 'http://localhost:3000' : null;
  const serverEntry = serverDir && [...byPath.keys()].find(p => new RegExp(`^${serverDir}/(?:index|server|app)\\.[jt]s$`).test(p));
  const serverPort = serverEntry && (byPath.get(serverEntry).content.match(/PORT\s*\|\|\s*(\d{2,5})/)?.[1] || byPath.get(serverEntry).content.match(/listen\(\s*(\d{2,5})/)?.[1]);
  const nodePort = kind === 'node' && [...byPath.entries()].find(([p, f]) => /^(?:index|server|app)\.[jt]s$/.test(p))?.[1].content.match(/PORT\s*\|\|\s*(\d{2,5})|listen\(\s*(\d{2,5})/)?.slice(1).find(Boolean);
  const envFiles = [...byPath.keys()].filter(p => /(?:^|\/)\.env\.example$/.test(p));
  const env = envFiles.map(f => ({ file: f, keys: byPath.get(f).content.split(/\r?\n/).map(l => l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1]).filter(Boolean) }));
  const schema = [...byPath.keys()].find(p => /(?:^|\/)schema\.sql$/i.test(p));
  return {
    kind, rootPkg, serverDir, serverPkg, frontUrl, serverPort: serverPort || (serverDir ? '3001' : null), nodePort,
    rootScript: rootPkg?.scripts?.dev ? 'dev' : rootPkg?.scripts?.start ? 'start' : null,
    serverScript: serverPkg?.scripts?.dev ? 'dev' : serverPkg?.scripts?.start ? 'start' : null,
    dbSetup: serverPkg?.scripts?.['db:setup'] ? 'db:setup' : rootPkg?.scripts?.['db:setup'] ? 'db:setup' : null,
    database: hasDatabaseCode(files), schema, env,
    health: serverEntry && /\/api\/health/.test(byPath.get(serverEntry).content),
    gitignoresEnv: [...byPath.entries()].some(([p, f]) => /(?:^|\/)\.gitignore$/.test(p) && /^\.env\b/m.test(f.content || ''))
  };
}

const run = script => script === 'start' ? 'npm start' : `npm run ${script}`;

function runSection(info, t) {
  const out = [];
  if (info.kind === 'static' && !info.serverDir) return [t.download, t.staticOpen];
  out.push(`${t.needs} ${t.download}`);
  if (info.serverDir) {
    out.push(t.two);
    out.push(`${t.t1}\n\`\`\`bash\ncd ${info.serverDir}\nnpm install\n${run(info.serverScript || 'start')}\n\`\`\``);
    if (info.rootPkg) out.push(`${t.t2}\n\`\`\`bash\nnpm install\n${run(info.rootScript || 'dev')}\n\`\`\``);
  } else {
    out.push(`${t.inFolder}\n\`\`\`bash\nnpm install\n${run(info.rootScript || 'start')}\n\`\`\``);
  }
  const url = info.frontUrl || (info.nodePort ? `http://localhost:${info.nodePort}` : null);
  if (url) out.push(t.open(url));
  return out;
}

function dbSection(info, t) {
  const envFile = info.env.find(e => e.keys.includes('DATABASE_URL'))?.file || `${info.serverDir || 'server'}/.env.example`;
  const steps = [t.dbCreate, t.dbEnv(envFile)];
  if (info.dbSetup) steps.push(`${t.dbSetup}\n\`\`\`bash\n${info.serverDir ? `cd ${info.serverDir}\n` : ''}npm install\nnpm run db:setup\n\`\`\`${info.schema ? `\n${t.dbPsql(info.schema)}` : ''}`);
  else if (info.schema) steps.push(`${t.dbSetup}\n\`\`\`bash\npsql "$DATABASE_URL" -f ${info.schema}\n\`\`\``);
  if (info.health) steps.push(t.dbCheck(`http://localhost:${info.serverPort || 3001}/api/health`));
  steps.push(t.dbSafe(info.gitignoresEnv));
  return steps;
}

function structure(files, lang, t) {
  const paths = (files || []).map(f => norm(f.path)).filter(p => !/(?:^|\/)(?:package-lock\.json|\.gitignore|\.env\.example|favicon|.*\.(?:svg|png|jpg|ico))$/.test(p));
  const ranked = paths.map(p => ({ p, role: roleOf(p, lang) })).sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || a.p.split('/').length - b.p.split('/').length);
  const shown = ranked.slice(0, 12).sort((a, b) => a.p.localeCompare(b.p));
  const lines = shown.map(({ p, role }) => `- \`${p}\`${role ? ` — ${role}` : ''}`);
  if (paths.length > shown.length) lines.push(t.more(paths.length - shown.length));
  return lines;
}

const bullets = text => String(text || '').split(/\r?\n|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map(s => s.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(s => s.length > 3).slice(0, 6);

/**
 * @param {object} o
 * @param {'create'|'edit'} o.mode
 */
export function projectDeliveryMessage({ files = [], name = 'Projeto', lang = 'pt', mode = 'create', version = 1, summary = '', suggestions = [], manifest = null }) {
  const t = L[lang] || L.pt;
  const info = analyzeRunInfo(files);
  const parts = [mode === 'edit' ? t.updated(name, version) : t.ready(name)];
  const done = bullets(summary);
  if (mode === 'edit') {
    const changed = manifest ? [...(manifest.created || []).map(p => `\`${p}\` (${t.created})`), ...(manifest.updated || []).map(p => `\`${p}\` (${t.updatedF})`), ...(manifest.deleted || []).map(p => `\`${p}\` (${t.deleted})`)] : [];
    if (done.length || changed.length) parts.push(`### ${t.changed}\n${[...done.map(d => `- ${d}`), ...(changed.length ? [`- ${changed.slice(0, 10).join(', ')}`] : [])].join('\n')}`);
    parts.push(info.database ? `${t.preview} ${t.previewDemo}` : t.preview);
  } else {
    if (done.length) parts.push(`### ${t.built}\n${done.map(d => `- ${d}`).join('\n')}`);
    parts.push(info.database ? `${t.preview} ${t.previewDemo}` : t.preview);
    // Com banco: primeiro conectar o PostgreSQL (o servidor precisa do .env para iniciar), depois rodar.
    if (info.database) parts.push(`### ${t.db}\n${dbSection(info, t).map((s, i) => `${i + 1}. ${s.replace(/\n/g, '\n   ')}`).join('\n')}`);
    parts.push(`### ${t.run}\n${runSection(info, t).map((s, i) => `${i + 1}. ${s.replace(/\n/g, '\n   ')}`).join('\n')}`);
    const envs = info.env.filter(e => e.keys.length);
    if (envs.length) parts.push(`### ${t.env}\n${envs.map(e => `${t.envText(e.file)} ${e.keys.map(k => `\`${k}\``).join(', ')}`).join('\n')}`);
    parts.push(`### ${t.structure}\n${structure(files, lang, t).join('\n')}`);
  }
  const next = (Array.isArray(suggestions) ? suggestions : []).map(s => String(s || '').replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(s => s.length > 8).slice(0, 4);
  if (next.length) parts.push(`### ${t.next}\n${next.map(s => `- ${s}`).join('\n')}\n\n${t.ask}`);
  return parts.join('\n\n');
}
