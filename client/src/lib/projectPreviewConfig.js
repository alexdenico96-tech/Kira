const PREVIEW_MANAGED_PACKAGES = new Set([
  "vite",
  "esbuild",
  "esbuild-wasm",
  "@vitejs/plugin-react",
  "@vitejs/plugin-react-swc",
  "@vitejs/plugin-vue",
  "@sveltejs/vite-plugin-svelte"
]);

export function normalizeProjectPath(value) {
  return "/" + String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

function readPackage(files) {
  const packageFile = (files || []).find(
    file => normalizeProjectPath(file?.path) === "/package.json"
  );
  if (!packageFile || typeof packageFile.content !== "string") return {};

  try {
    return JSON.parse(packageFile.content);
  } catch {
    return {};
  }
}

function hasPackage(pkg, name) {
  return Boolean(
    pkg.dependencies?.[name] ||
    pkg.devDependencies?.[name] ||
    pkg.optionalDependencies?.[name]
  );
}

function isTypeScriptProject(files) {
  return (files || []).some(file => /\.(?:ts|tsx)$/i.test(file?.path || ""));
}

function hasVite(files, pkg) {
  const scripts = Object.values(pkg.scripts || {}).join(" ");
  return hasPackage(pkg, "vite") || /\bvite(?:\s|$|\/)/i.test(scripts) ||
    (files || []).some(file => /(^|\/)vite\.config\.[cm]?[jt]s$/i.test(file?.path || ""));
}

function selectTemplate(files, pkg) {
  const ts = isTypeScriptProject(files);
  const vite = hasVite(files, pkg);

  if (vite && hasPackage(pkg, "react")) return ts ? "vite-react-ts" : "vite-react";
  if (vite && hasPackage(pkg, "vue")) return ts ? "vite-vue-ts" : "vite-vue";
  if (vite && hasPackage(pkg, "svelte")) return ts ? "vite-svelte-ts" : "vite-svelte";
  if (vite) return "vite";

  if (hasPackage(pkg, "next")) return "nextjs";
  if (hasPackage(pkg, "react")) return ts ? "react-ts" : "react";
  if (hasPackage(pkg, "vue")) return ts ? "vue-ts" : "vue";
  if (hasPackage(pkg, "svelte")) return "svelte";
  if ((files || []).some(file => /\.(?:html|css|js)$/i.test(file?.path || ""))) return "vanilla";
  return "static";
}

function withoutPreviewManagedPackages(source = {}) {
  return Object.fromEntries(
    Object.entries(source).filter(([name, version]) =>
      typeof version === "string" && !PREVIEW_MANAGED_PACKAGES.has(name)
    )
  );
}

// KIRA_REACT_BROWSER_PREVIEW_V1
// Projetos React (com ou sem Vite) rodam no empacotador nativo do Sandpack em vez do
// Vite emulado no Nodebox, que é lento e quebra com Tailwind, aliases e import.meta.env.
// Os arquivos do usuário não mudam: só a cópia enviada ao preview é adaptada.
const BUILD_ONLY_PACKAGE = /^(?:vite|vite-.*|@vitejs\/.*|esbuild(?:-wasm)?|tailwindcss|@tailwindcss\/.*|postcss.*|autoprefixer|typescript|eslint.*|@eslint\/.*|@typescript-eslint\/.*|@types\/.*|prettier.*|vitest|@vitest\/.*|@testing-library\/.*|jsdom|globals|react-scripts)$/;
const CONFIG_FILE = /^\/(?:vite|vitest|tailwind|postcss|eslint|prettier)\.config\.[cm]?[jt]s$|^\/(?:tsconfig.*|jsconfig|\.eslintrc.*|\.prettierrc.*)(?:\.json)?$|^\/\.eslintrc$/;
const CODE_FILE = /\.(?:[cm]?jsx?|tsx?)$/i;
const ENTRY_CANDIDATES = ["/src/main.jsx", "/src/main.tsx", "/src/main.js", "/src/main.ts", "/src/index.jsx", "/src/index.tsx", "/src/index.js", "/src/index.ts", "/main.jsx", "/index.jsx", "/main.tsx", "/index.tsx"];
const TAILWIND_DIRECTIVE = /@tailwind\b|@apply\b|@theme\b|@layer\s+(?:base|components|utilities)\b|@import\s+["']tailwindcss|@plugin\b|@config\b/;

function isReactBrowserProject(pkg) {
  return hasPackage(pkg, "react") && !hasPackage(pkg, "next") && !hasPackage(pkg, "@remix-run/react");
}

function findEntry(files, html) {
  const fromHtml = html?.match(/<script[^>]*type=["']module["'][^>]*src=["']\.?\/?([^"']+)["']/i)?.[1];
  if (fromHtml) {
    const candidate = normalizeProjectPath(fromHtml);
    if (files[candidate]) return candidate;
  }
  return ENTRY_CANDIDATES.find(path => files[path]) || null;
}

function relativeImport(fromFile, targetPath) {
  const from = fromFile.split("/").slice(1, -1);
  const to = targetPath.split("/").slice(1);
  while (from.length && to.length > 1 && from[0] === to[0]) { from.shift(); to.shift(); }
  const prefix = from.length ? "../".repeat(from.length) : "./";
  return prefix + to.join("/");
}

function adaptCode(path, code) {
  return code
    // Aliases do Vite/TS ("@/components/X", "~/lib/y") viram caminhos relativos.
    .replace(/(from\s*|import\s*\(\s*|import\s+)(["'])[@~]\/([^"']+)\2/g,
      (match, lead, quote, rest) => `${lead}${quote}${relativeImport(path, `/src/${rest}`)}${quote}`)
    // import.meta.env não existe no empacotador do navegador.
    .replace(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g, (m, key) =>
      key === "DEV" ? "true" : key === "PROD" ? "false" : key === "MODE" ? '"development"' : key === "BASE_URL" ? '"/"' : "undefined")
    .replace(/import\.meta\.env/g, '({ MODE: "development", DEV: true, PROD: false, BASE_URL: "/" })');
}

function tailwindHead(projectFiles, pkg, tailwindCss) {
  const version = String(pkg.devDependencies?.tailwindcss || pkg.dependencies?.tailwindcss || "");
  const v4 = /^\D*4/.test(version) || hasPackage(pkg, "@tailwindcss/vite") || /@import\s+["']tailwindcss/.test(tailwindCss);
  const css = tailwindCss
    .replace(/@tailwind\s+[\w-]+\s*;?/g, "")
    .replace(/@import\s+["']tailwindcss[^;]*;?/g, "")
    .replace(/@config\s+[^;]+;?/g, "")
    .replace(/@plugin\s+[^;]+;?/g, "");
  if (v4) {
    return `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\n<style type="text/tailwindcss">${css}</style>`;
  }
  const configFile = Object.keys(projectFiles).find(path => /^\/tailwind\.config\.[cm]?[jt]s$/.test(path));
  let config = "";
  if (configFile) {
    const body = projectFiles[configFile].code
      .replace(/^\s*import\s.*$/gm, "")
      .replace(/\/\*\*?[\s\S]*?\*\//g, "")
      .replace(/\bplugins\s*:\s*\[[\s\S]*?\]\s*,?/g, "")
      .replace(/\bsatisfies\s+\w+/g, "")
      .replace(/\bexport\s+default\b|\bmodule\.exports\s*=/, "tailwind.config =");
    if (/tailwind\.config =/.test(body) && !/\brequire\s*\(/.test(body)) config = `<script>try{${body}}catch(e){console.warn("tailwind.config ignorado no preview",e)}</script>`;
  }
  return `<script src="https://cdn.tailwindcss.com"></script>\n${config}\n<style type="text/tailwindcss">${css}</style>`;
}

// KIRA_FULLSTACK_PREVIEW_V1: o preview roda só o frontend. Backend (server/ com o próprio package.json,
// Express, pg, scripts Node), SQL e .env não rodam no navegador e travavam o empacotador (TIME_OUT).
const BACKEND_DIR = /^\/(?:server|backend|api-server)\//i;
const NON_FRONTEND_FILE = /\.(?:sql|md|ya?ml|toml|lock)$|(?:^|\/)(?:\.env(?:\..*)?|\.gitignore|\.dockerignore|Dockerfile|Procfile|package-lock\.json)$/i;
export function frontendFilesOnly(files = []) {
  const list = Array.isArray(files) ? files : [];
  const nestedPackageDirs = list
    .map(file => normalizeProjectPath(file?.path))
    .filter(path => /\/package\.json$/.test(path) && path !== "/package.json")
    .map(path => path.slice(0, -"package.json".length));
  return list.filter(file => {
    const path = normalizeProjectPath(file?.path);
    if (path === "/package.json") return true;
    if (BACKEND_DIR.test(path) || NON_FRONTEND_FILE.test(path)) return false;
    return !nestedPackageDirs.some(dir => path.startsWith(dir));
  });
}

// Sem servidor na pré-visualização, "/api/..." devolveria o index.html (200) e o JSON.parse quebrava
// ("Unexpected token '<'"). Aqui a chamada falha como se o servidor estivesse desligado, e o projeto
// entra no modo demonstração que ele mesmo implementa.
const API_OFFLINE_SHIM = `<script>(function(){var f=window.fetch;if(!f)return;var told=false;window.fetch=function(input,init){try{var raw=typeof input==="string"?input:(input&&input.url)||"";var u=new URL(raw,location.href);if(u.origin===location.origin&&/^\\/api(\\/|$)/.test(u.pathname)){if(!told){told=true;console.info("[Kira] Pré-visualização sem servidor: as chamadas a /api usam o modo demonstração do projeto. Rode o servidor no seu computador para usar o banco de dados.");}return Promise.reject(new TypeError("Failed to fetch (servidor da API não está rodando na pré-visualização)"));}}catch(e){}return f.apply(this,arguments);};})();</script>`;

function buildReactBrowserPreview(files, pkg, { backend = false } = {}) {
  const typescript = isTypeScriptProject(files);
  const projectFiles = {};
  for (const file of files || []) {
    if (!file?.path) continue;
    projectFiles[normalizeProjectPath(file.path)] = { code: String(file.content ?? "") };
  }
  const htmlPath = ["/index.html", "/public/index.html"].find(path => projectFiles[path]);
  const html = htmlPath ? projectFiles[htmlPath].code : "";
  const entry = findEntry(projectFiles, html);
  if (!entry) return null;

  const usesTailwind = hasPackage(pkg, "tailwindcss") || hasPackage(pkg, "@tailwindcss/vite") ||
    Object.keys(projectFiles).some(path => /^\/tailwind\.config\./.test(path));
  const previewFiles = {};
  let tailwindCss = "";
  for (const [path, file] of Object.entries(projectFiles)) {
    if (path === "/package.json" || path === htmlPath || CONFIG_FILE.test(path)) continue;
    if (CODE_FILE.test(path)) previewFiles[path] = { code: adaptCode(path, file.code) };
    else if (/\.css$/i.test(path) && usesTailwind && TAILWIND_DIRECTIVE.test(file.code)) {
      // CSS com diretivas do Tailwind é processado pelo Tailwind do navegador; o import continua válido.
      tailwindCss += `\n/* ${path} */\n${file.code}`;
      previewFiles[path] = { code: `/* ${path}: processado pelo Tailwind no preview */` };
    } else previewFiles[path] = file;
  }

  let page = html || '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root"></div></body></html>';
  page = page.replace(/<script[^>]*type=["']module["'][^>]*src=["'](?!https?:)[^"']*["'][^>]*>\s*<\/script>/gi, "");
  if (!/id=["'](?:root|app)["']/.test(page)) page = page.replace(/<body([^>]*)>/i, '<body$1>\n<div id="root"></div>');
  if (backend) page = /<head[^>]*>/i.test(page) ? page.replace(/<head([^>]*)>/i, `<head$1>\n${API_OFFLINE_SHIM}`) : `${API_OFFLINE_SHIM}\n${page}`;
  if (usesTailwind) {
    const head = tailwindHead(projectFiles, pkg, tailwindCss);
    page = /<\/head>/i.test(page) ? page.replace(/<\/head>/i, `${head}\n</head>`) : `${head}\n${page}`;
  }
  previewFiles["/public/index.html"] = { code: page };

  const dependencies = {};
  for (const section of [pkg.dependencies, pkg.devDependencies]) {
    for (const [name, version] of Object.entries(section || {})) {
      if (typeof version === "string" && !BUILD_ONLY_PACKAGE.test(name) && !/^(?:file|link|workspace):/.test(version)) dependencies[name] = version;
    }
  }
  dependencies.react ||= "^18.3.1";
  dependencies["react-dom"] ||= dependencies.react;

  return {
    template: typescript ? "react-ts" : "react",
    files: previewFiles,
    customSetup: { entry, dependencies }
  };
}

export function buildSandpackPreviewConfig(allFiles = []) {
  const files = frontendFilesOnly(allFiles);
  const backend = files.length < (Array.isArray(allFiles) ? allFiles.filter(f => !/\.(?:md|sql)$|\.env|\.gitignore$/i.test(String(f?.path || ""))).length : 0);
  const pkg = readPackage(files);
  if (isReactBrowserProject(pkg)) {
    const browserPreview = buildReactBrowserPreview(files, pkg, { backend });
    if (browserPreview) return browserPreview;
  }
  const template = selectTemplate(files, pkg);
  const viteTemplate = template.startsWith("vite-") || template === "vite";
  const projectFiles = {};

  for (const file of files || []) {
    if (!file?.path || normalizeProjectPath(file.path) === "/package.json") continue;
    projectFiles[normalizeProjectPath(file.path)] = {
      code: String(file.content ?? "")
    };
  }

  const dependencies = viteTemplate
    ? withoutPreviewManagedPackages(pkg.dependencies)
    : { ...pkg.dependencies };
  const devDependencies = viteTemplate
    ? withoutPreviewManagedPackages(pkg.devDependencies)
    : { ...pkg.devDependencies };

  return {
    template,
    files: projectFiles,
    customSetup: {
      ...(Object.keys(dependencies).length ? { dependencies } : {}),
      ...(Object.keys(devDependencies).length ? { devDependencies } : {})
    }
  };
}
