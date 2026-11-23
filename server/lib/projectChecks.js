// KIRA_PROJECT_INTEGRITY_V1
// Erros que quebram projetos complexos e que a análise de sintaxe não pega:
//  - import local para arquivo que não existe;
//  - pacote importado que não está no package.json mais próximo (quebra o preview e o npm install);
//  - projetos com PostgreSQL sem schema, sem .env.example, com SQL montado por interpolação
//    (SQL injection) ou com senha de banco escrita no código.
import path from 'node:path';
import { builtinModules } from 'node:module';

const CODE = /\.(?:jsx?|tsx?|mjs|cjs)$/i;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
const LOCAL_EXT = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.vue', '.svelte',
  '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

// Versões estáveis para os pacotes mais usados (o resto recebe "latest").
const KNOWN_VERSIONS = {
  react: '^18.3.1', 'react-dom': '^18.3.1', 'react-router-dom': '^6.28.0', 'react-router': '^6.28.0', 'lucide-react': '^0.460.0', axios: '^1.7.9',
  'framer-motion': '^11.11.0', recharts: '^2.13.0', zustand: '^5.0.1', clsx: '^2.1.1', 'date-fns': '^4.1.0', 'react-icons': '^5.3.0',
  '@tanstack/react-query': '^5.59.0', 'react-hook-form': '^7.53.0', zod: '^3.23.8', 'chart.js': '^4.4.6', 'react-chartjs-2': '^5.2.0',
  uuid: '^11.0.3', 'react-hot-toast': '^2.4.1', 'swiper': '^11.1.14',
  express: '^4.21.1', pg: '^8.13.1', cors: '^2.8.5', dotenv: '^16.4.5', bcryptjs: '^2.4.3', jsonwebtoken: '^9.0.2', helmet: '^8.0.0', morgan: '^1.10.0',
  'express-rate-limit': '^7.4.1', multer: '^1.4.5-lts.1', nodemon: '^3.1.7', prisma: '^5.22.0', '@prisma/client': '^5.22.0'
};
const DEV_ONLY = new Set(['vite', '@vitejs/plugin-react', 'nodemon', 'typescript', 'tailwindcss', 'postcss', 'autoprefixer', 'eslint']);

const norm = p => String(p || '').replaceAll('\\', '/').replace(/^\.\//, '');
const packageName = spec => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

function importsOf(content) {
  const out = [];
  const re = /(?:^|[^\w.$])(?:import\s+(?:[\w*{}\s,$]+?\s+from\s+)?|export\s+[\w*{}\s,$]+?\s+from\s+|import\s*\(\s*|require\s*\(\s*)["'`]([^"'`\n]+)["'`]/g;
  let m;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}

/** package.json mais próximo de um arquivo (o de server/ vale para server/**). */
function nearestPackage(filePath, packages) {
  let dir = path.posix.dirname(filePath);
  while (true) {
    const key = dir === '.' ? 'package.json' : `${dir}/package.json`;
    if (packages.has(key)) return key;
    if (dir === '.' || dir === '' || dir === '/') return null;
    dir = path.posix.dirname(dir);
  }
}

function aliases(byPath) {
  const out = [];
  for (const [p, f] of byPath) {
    if (!/(?:^|\/)(?:vite\.config\.[jt]s|tsconfig\.json|jsconfig\.json)$/.test(p)) continue;
    for (const m of f.content.matchAll(/["'`]?(@|~|#)[\w-]*\/?\*?["'`]?\s*:/g)) out.push(m[1]);
  }
  return new Set(out);
}

export function detectDatabaseRequest(text = '') {
  return /\b(banco de dados|base de dados|base de datos|database|postgres(?:ql)?|psql|sql\b|supabase|neon\b|persist[eêi]|persist[aã]ncia|salvar (?:os dados|no banco)|backend|back-end|api rest|crud|servidor (?:node|express)|express\b|prisma)\b/i.test(String(text));
}

export function hasDatabaseCode(files = []) {
  return (files || []).some(f => /(?:^|\/)(?:schema|migrations?\/.*)\.sql$/i.test(norm(f.path)) || (/package\.json$/.test(norm(f.path)) && /"pg"\s*:/.test(f.content || '')));
}

function parsePackages(byPath) {
  const packages = new Map();
  for (const [p, f] of byPath) {
    if (!/(?:^|\/)package\.json$/.test(p)) continue;
    try { packages.set(p, JSON.parse(f.content)); } catch { /* JSON inválido é tratado em outro lugar */ }
  }
  return packages;
}

/**
 * Acrescenta ao package.json certo os pacotes importados e não declarados (reparo determinístico, sem IA).
 * @returns {{ files, added: string[] }}
 */
export function repairMissingDependencies(files = []) {
  const list = Array.isArray(files) ? files : [];
  const byPath = new Map(list.map(f => [norm(f.path), f]));
  const packages = parsePackages(byPath);
  if (!packages.size) return { files: list, added: [] };
  const alias = aliases(byPath);
  const additions = new Map(); // package.json → Set(nomes)
  for (const [p, f] of byPath) {
    if (!CODE.test(p) || typeof f.content !== 'string') continue;
    const pkgPath = nearestPackage(p, packages);
    if (!pkgPath) continue;
    const pkg = packages.get(pkgPath);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}) };
    for (const spec of importsOf(f.content)) {
      if (/^[./]/.test(spec) || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0]) || /^(?:virtual:|https?:|data:|\$)/.test(spec)) continue;
      if (alias.has(spec[0]) && spec[1] === '/') continue;
      if (/^[@~#]\//.test(spec)) continue;
      const name = packageName(spec);
      if (!name || deps[name] || /[^\w@./-]/.test(name)) continue;
      if (!additions.has(pkgPath)) additions.set(pkgPath, new Set());
      additions.get(pkgPath).add(name);
    }
  }
  if (!additions.size) return { files: list, added: [] };
  const added = [];
  const next = list.map(f => {
    const p = norm(f.path);
    if (!additions.has(p)) return f;
    const pkg = JSON.parse(f.content);
    for (const name of additions.get(p)) {
      const field = DEV_ONLY.has(name) ? 'devDependencies' : 'dependencies';
      pkg[field] = { ...(pkg[field] || {}), [name]: KNOWN_VERSIONS[name] || 'latest' };
      added.push(`${p}:${name}`);
    }
    return { ...f, content: JSON.stringify(pkg, null, 2) + '\n' };
  });
  return { files: next, added };
}

/**
 * Integridade do projeto.
 * blocking: quebra o projeto (import local inexistente) — precisa ser corrigido.
 * soft: deixa o projeto incompleto/inseguro (banco de dados) — corrigido quando possível, não impede salvar.
 */
export function inspectProjectIntegrity(files = [], { database = false } = {}) {
  const blocking = [], soft = [];
  const byPath = new Map((files || []).filter(f => f?.path && typeof f.content === 'string').map(f => [norm(f.path), f]));
  const hasPackage = [...byPath.keys()].some(p => /(?:^|\/)package\.json$/.test(p));

  if (hasPackage) {
    for (const [p, f] of byPath) {
      if (!CODE.test(p) || f.content.length > 300 * 1024) continue;
      for (const spec of importsOf(f.content)) {
        if (!spec.startsWith('.')) continue;
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(p), spec.split(/[?#]/)[0]));
        if (!LOCAL_EXT.some(ext => byPath.has(base + ext))) blocking.push(`${p}: importa "${spec}", mas esse arquivo não existe no projeto`);
      }
    }
  }

  const needsDb = database || hasDatabaseCode(files);
  if (needsDb) {
    const paths = [...byPath.keys()];
    const serverFiles = paths.filter(p => CODE.test(p) && /(?:^|\/)(?:server|api|backend)\//.test(p));
    const all = paths.filter(p => CODE.test(p));
    const code = p => byPath.get(p).content;
    const creates = paths.filter(p => /\.sql$/i.test(p) && /create\s+table/i.test(byPath.get(p).content));
    const schema = paths.find(p => /(?:^|\/)schema\.sql$/i.test(p));
    if (!creates.length) soft.push(schema ? `${schema} não cria nenhuma tabela (CREATE TABLE IF NOT EXISTS)` : 'projeto com banco de dados sem server/schema.sql (CREATE TABLE IF NOT EXISTS ... das tabelas usadas)');
    const pgPkg = paths.find(p => /(?:^|\/)package\.json$/.test(p) && /"pg"\s*:/.test(byPath.get(p).content));
    if (!pgPkg) soft.push('nenhum package.json declara o driver "pg" do PostgreSQL (crie server/package.json com express, pg, cors e dotenv)');
    if (!all.some(p => /process\.env\.DATABASE_URL/.test(code(p)))) soft.push('a conexão com o banco deve vir de process.env.DATABASE_URL (Pool do pg com connectionString)');
    if (!paths.some(p => /(?:^|\/)\.env\.example$/.test(p) && /DATABASE_URL\s*=/.test(byPath.get(p).content))) soft.push('falta server/.env.example com DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_do_banco e PORT');
    if (!paths.some(p => /(?:^|\/)README\.md$/i.test(p))) soft.push('falta README.md explicando como criar o banco, rodar o schema e iniciar servidor e frontend');
    for (const p of serverFiles.length ? serverFiles : all) {
      const c = code(p);
      if (/\b(?:query|execute|sql|raw)\s*\(\s*`[^`]*\$\{/.test(c)) soft.push(`${p}: SQL montado com \${...} dentro da query (risco de SQL injection); use parâmetros $1, $2 e passe os valores no array`);
      if (/\b(?:query|execute)\s*\(\s*["'][^"']*["']\s*\+/.test(c)) soft.push(`${p}: SQL montado por concatenação de strings (risco de SQL injection); use parâmetros $1, $2`);
    }
    for (const p of paths) {
      if (/(?:^|\/)(?:\.env\.example|README\.md)$/i.test(p) || /\.md$/i.test(p)) continue;
      const m = byPath.get(p).content.match(/postgres(?:ql)?:\/\/([^:\s/@'"]+):([^@\s'"]+)@/i);
      if (m && !/^(?:usuario|user|senha|password|\$\{)/i.test(m[1] + m[2])) soft.push(`${p}: senha do banco escrita no código; leia de process.env.DATABASE_URL`);
    }
    if (paths.some(p => /(?:^|\/)\.env$/.test(p))) soft.push('não inclua o arquivo .env no projeto (só .env.example)');
  }
  return { blocking: [...new Set(blocking)].slice(0, 20), soft: [...new Set(soft)].slice(0, 20) };
}

/** Instruções extras para o modelo quando o projeto precisa de banco de dados. */
export function databaseProjectPrompt() {
  return `
PROJETO COM BANCO DE DADOS POSTGRESQL (obrigatório seguir esta estrutura):
- Frontend React + Vite na raiz (package.json da raiz, index.html, src/). Backend Node em server/ com o PRÓPRIO server/package.json ("type": "module"; dependências express, pg, cors, dotenv; scripts "dev": "node --watch index.js", "start": "node index.js", "db:setup": "node scripts/setup-db.js").
- server/db.js: import pg from "pg"; Pool com connectionString: process.env.DATABASE_URL e ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false. Exporte uma função query(text, params).
- server/index.js: import "dotenv/config"; Express com cors, express.json, rotas REST em /api/... (listar, buscar por id, criar, atualizar, excluir) para cada entidade pedida; valide a entrada (400 com mensagem clara), 404 quando não existir, try/catch com 500 genérico; app.listen(process.env.PORT || 3001). Inclua GET /api/health que faz SELECT 1.
- TODA query usa parâmetros ($1, $2...) com os valores no array. NUNCA monte SQL com \${} ou concatenação.
- server/schema.sql: CREATE TABLE IF NOT EXISTS para cada entidade (id SERIAL ou UUID PRIMARY KEY, colunas com tipos e NOT NULL corretos, chaves estrangeiras com ON DELETE, created_at TIMESTAMPTZ DEFAULT NOW(), índices nas colunas de busca).
- server/seed.sql: dados de exemplo realistas (INSERT ... ON CONFLICT DO NOTHING).
- server/scripts/setup-db.js: lê schema.sql e seed.sql e executa no banco (assim o usuário não precisa do psql instalado).
- server/.env.example: DATABASE_URL=postgresql://usuario:senha@localhost:5432/nome_do_banco, DATABASE_SSL=false, PORT=3001. Nunca coloque senhas reais nem um arquivo .env.
- Frontend: src/lib/api.js com const API = import.meta.env.VITE_API_URL || "/api" e funções para cada rota; vite.config.js com server.proxy { "/api": "http://localhost:3001" }. Se o servidor não responder (ex.: na pré-visualização da Kira), use dados de demonstração em memória com a MESMA forma dos dados reais e mostre um aviso discreto "Modo demonstração — conecte o servidor para salvar no banco". Estados de carregando, vazio e erro em todas as telas.
- .gitignore na raiz com node_modules, dist e .env.
- README.md com: requisitos (Node 18+, PostgreSQL), como criar o banco (local ou serviço na nuvem), copiar server/.env.example para server/.env, npm install e npm run db:setup dentro de server/, npm run dev no server e na raiz (dois terminais), e as rotas da API.`;
}
