import path from 'node:path';
import { builtinModules } from 'node:module';

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const extensions = [
  '', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.css', '.scss',
  '.sass', '.less', '.vue', '.svelte', '.astro', '.svg', '.png', '.jpg', '.jpeg',
  '.webp', '.gif', '.woff', '.woff2', '.ttf', '.otf', '/index.js', '/index.jsx',
  '/index.ts', '/index.tsx', '/index.vue', '/index.svelte'
];

const normalizePath = value => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
const cleanPath = value => path.posix.normalize(normalizePath(value));
const isSafe = value => value && !value.startsWith('/') && !value.startsWith('../') && value !== '..' && !/^[a-z]:/i.test(value) && !value.includes('\0');
const packageName = value => value.startsWith('@') ? value.split('/').slice(0, 2).join('/') : value.split('/')[0];

function resolveLocalImport(from, specifier, files) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const target = cleanPath(path.posix.join(path.posix.dirname(from), cleanSpecifier));
  if (!isSafe(target)) return { safe: false, found: false };
  return {
    safe: true,
    found: extensions.some(extension => files.has(target + extension))
  };
}

function extractImportSpecifiers(source) {
  const imports = new Set();
  const patterns = [
    /\bimport\s*(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/g,
    /\bexport\s+(?:\*|\{[^}]*\})\s+from\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) imports.add(match[1]);
  }
  return imports;
}

export function inspectProjectFiles(files = []) {
  const issues = [], warnings = [];
  if (!Array.isArray(files)) return { ok: false, issues: ['Lista de arquivos inválida'], warnings, filesChecked: 0 };

  const map = new Map();
  for (const file of files) {
    const original = normalizePath(file?.path).trim();
    const normalized = cleanPath(original);
    if (!isSafe(normalized) || normalized === '.') {
      issues.push(`Caminho inseguro: ${String(file?.path || '').slice(0, 120)}`);
      continue;
    }
    if (map.has(normalized)) {
      issues.push(`Arquivo duplicado: ${normalized}`);
      continue;
    }
    if (typeof file?.content !== 'string') {
      issues.push(`${normalized}: conteúdo do arquivo inválido`);
      continue;
    }
    if (!file.content.trim()) warnings.push(`${normalized}: arquivo vazio`);
    map.set(normalized, file.content);
  }

  let pkg = null;
  if (map.has('package.json')) {
    try {
      pkg = JSON.parse(map.get('package.json'));
      if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
        issues.push('package.json não é um objeto JSON');
        pkg = null;
      }
    } catch {
      issues.push('package.json contém JSON inválido');
    }
  }

  const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies'];
  const declared = new Set();
  for (const section of dependencySections) {
    const values = pkg?.[section];
    if (values == null) continue;
    if (typeof values !== 'object' || Array.isArray(values)) {
      issues.push(`package.json: ${section} precisa ser um objeto`);
      continue;
    }
    for (const name of Object.keys(values)) declared.add(name);
  }

  // KIRA_PROJECT_INTEGRITY_V1: cada arquivo usa o package.json mais próximo (server/ tem o próprio em projetos full-stack).
  const nestedDeclared = new Map();
  for (const [name, content] of map) {
    if (!/\/package\.json$/.test(name)) continue;
    try {
      const nested = JSON.parse(content);
      nestedDeclared.set(name.slice(0, -'package.json'.length - 1), new Set(dependencySections.flatMap(section => Object.keys(nested?.[section] || {}))));
    } catch { issues.push(`${name} contém JSON inválido`); }
  }
  const declaredFor = filename => {
    for (let dir = filename.includes('/') ? filename.slice(0, filename.lastIndexOf('/')) : ''; dir; dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '') {
      if (nestedDeclared.has(dir)) return nestedDeclared.get(dir);
    }
    return pkg ? declared : null;
  };

  for (const [filename, content] of map) {
    if (!/\.(?:[cm]?js|jsx|ts|tsx|vue|svelte|astro)$/i.test(filename)) continue;
    const fileDeclared = declaredFor(filename);
    for (const specifier of extractImportSpecifiers(content)) {
      if (specifier.startsWith('.')) {
        const result = resolveLocalImport(filename, specifier, map);
        if (!result.safe) issues.push(`${filename}: import sai da pasta do projeto: ${specifier}`);
        else if (!result.found) issues.push(`${filename}: arquivo importado não encontrado: ${specifier}`);
        continue;
      }

      if (specifier.startsWith('/') || specifier.startsWith('#') || specifier.startsWith('node:') ||
          /^https?:\/\//i.test(specifier) || specifier.startsWith('@/') || specifier.startsWith('~/') ||
          specifier.startsWith('virtual:') || specifier.startsWith('vite/') ||
          specifier.startsWith('react/jsx-runtime') || specifier.startsWith('react/jsx-dev-runtime')) continue;

      const root = specifier.split('/')[0];
      if (builtins.has(root)) continue;
      if (fileDeclared && !fileDeclared.has(packageName(specifier))) {
        issues.push(`${filename}: dependência externa não declarada no package.json: ${packageName(specifier)}`);
      } else if (!fileDeclared) {
        warnings.push(`${filename}: dependência externa encontrada sem package.json: ${packageName(specifier)}`);
      }
    }
  }

  if (pkg?.scripts != null) {
    if (typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts)) {
      issues.push('package.json: scripts precisa ser um objeto');
    } else {
      for (const [name, command] of Object.entries(pkg.scripts)) {
        if (typeof command !== 'string' || !command.trim()) issues.push(`package.json: script ${name} inválido`);
      }
    }
  }

  const hasVite = Boolean(pkg?.dependencies?.vite || pkg?.devDependencies?.vite);
  const hasNext = Boolean(pkg?.dependencies?.next || pkg?.devDependencies?.next);
  if (hasVite && !pkg?.scripts?.build) warnings.push('projeto Vite sem script "build" no package.json');
  if (hasNext && !pkg?.scripts?.build) warnings.push('projeto Next.js sem script "build" no package.json');

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    warnings: [...new Set(warnings)],
    filesChecked: map.size
  };
}
