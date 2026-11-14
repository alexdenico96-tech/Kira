import { useEffect, useMemo, useState } from "react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
  SandpackLayout,
  useSandpack
} from "@codesandbox/sandpack-react";

function normalizePath(path) {
  return "/" + String(path || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

function parsePackage(files) {
  const packageFile = files.find(file => normalizePath(file.path) === "/package.json");
  if (!packageFile) return {};
  try {
    const parsed = JSON.parse(packageFile.content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function detectPreview(files) {
  const paths = new Set(files.map(file => normalizePath(file.path).toLowerCase()));
  const pkg = parsePackage(files);
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const hasTypeScript = [...paths].some(path => /\.(ts|tsx)$/.test(path));
  const hasVite = Boolean(deps.vite || paths.has("/vite.config.js") || paths.has("/vite.config.ts") || paths.has("/vite.config.mjs"));

  if (deps.next) return { supported: true, template: "nextjs", label: "Next.js" };
  if (deps["@sveltejs/kit"]) return { supported: false, template: null, label: "SvelteKit" };
  if (deps.astro) return { supported: true, template: "astro", label: "Astro" };
  if (deps["@angular/core"]) return { supported: true, template: "angular", label: "Angular" };
  if (deps.vue) {
    const template = hasVite ? (hasTypeScript ? "vite-vue-ts" : "vite-vue") : (hasTypeScript ? "vue-ts" : "vue");
    return { supported: true, template, label: hasTypeScript ? "Vue + TypeScript" : "Vue" };
  }
  if (deps.svelte) {
    const template = hasVite ? (hasTypeScript ? "vite-svelte-ts" : "vite-svelte") : "svelte";
    return { supported: true, template, label: hasTypeScript ? "Svelte + TypeScript" : "Svelte" };
  }
  if (deps.react || paths.has("/src/app.jsx") || paths.has("/src/app.tsx")) {
    const template = hasVite ? (hasTypeScript ? "vite-react-ts" : "vite-react") : (hasTypeScript ? "react-ts" : "react");
    return { supported: true, template, label: hasTypeScript ? "React + TypeScript" : "React" };
  }
  if (hasVite) return { supported: true, template: "vite", label: hasTypeScript ? "Vite + TypeScript" : "Vite" };
  if (paths.has("/index.html")) return { supported: true, template: hasTypeScript ? "vanilla-ts" : "vanilla", label: hasTypeScript ? "JavaScript/TypeScript" : "HTML / JavaScript" };
  return { supported: false, template: null, label: "Preview externo" };
}

function prepareFiles(files, template) {
  const result = {};
  for (const file of files || []) {
    if (!file?.path) continue;
    result[normalizePath(file.path)] = { code: String(file.content ?? "") };
  }

  const isReact = template === "react" || template === "react-ts";
  const isVanilla = template === "vanilla" || template === "vanilla-ts";
  if (isReact || isVanilla) {
    const typed = template.endsWith("-ts");
    const candidates = typed
      ? ["/src/main.tsx", "/src/main.ts", "/src/index.tsx", "/src/index.ts"]
      : ["/src/main.jsx", "/src/main.js", "/src/index.jsx", "/src/index.js"];
    const entry = candidates.map(path => result[path]).find(Boolean);
    const target = typed ? (isReact ? "/src/index.tsx" : "/src/index.ts") : "/src/index.js";
    if (entry && !result[target]) result[target] = { code: entry.code };
  }
  return result;
}

function ProjectDiagnostics({ onDiagnosticsChange }) {
  const { sandpack } = useSandpack();
  const [visibleError, setVisibleError] = useState("");
  const currentError = sandpack.error
    ? String(sandpack.error.message || sandpack.error)
    : "";

  useEffect(() => {
    if (currentError) setVisibleError(currentError);
    else if (sandpack.status === "idle" || sandpack.status === "running" || sandpack.status === "running-tests") setVisibleError("");
  }, [currentError, sandpack.status]);

  useEffect(() => {
    onDiagnosticsChange?.(visibleError);
  }, [visibleError, onDiagnosticsChange]);

  if (!visibleError) return null;
  return (
    <div className="border-t border-red-500/30 bg-red-950/30 p-3">
      <h3 className="mb-2 text-sm font-semibold text-red-300">Erros encontrados no preview</h3>
      <div className="rounded-lg border border-red-500/20 bg-black/30 p-3">
        <p className="whitespace-pre-wrap break-words font-mono text-xs text-red-200">{visibleError}</p>
      </div>
    </div>
  );
}

function UnsupportedPreview({ preview, files }) {
  const packageFile = files.find(file => normalizePath(file.path) === "/package.json");
  const scripts = parsePackage(files).scripts || {};
  const startCommand = scripts.dev ? "npm run dev" : scripts.start ? "npm start" : "npm run dev";
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center overflow-auto bg-[#06101f] p-5 text-slate-100">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-xl">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-cyan-300">{preview.label}</div>
        <h3 className="text-lg font-semibold">Preview não disponível neste ambiente</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          A Kira identificou esta stack e não vai tentar executá-la como React, para evitar mostrar uma prévia incorreta.
          {packageFile ? " Baixe o projeto e execute os comandos abaixo no diretório do package.json." : " Este projeto não contém package.json; verifique a documentação da stack para executá-lo."}
        </p>
        {packageFile && (
          <pre className="mt-4 overflow-auto rounded-lg border border-slate-700 bg-black/30 p-3 text-xs text-emerald-200">npm install{"\n"}{startCommand}</pre>
        )}
        <p className="mt-3 text-xs text-slate-400">O código e os arquivos continuam disponíveis no editor e no ZIP. Esta mensagem não significa que o projeto esteja com erro.</p>
      </div>
    </div>
  );
}

function PreviewStatus() {
  const { sandpack } = useSandpack();
  const label = sandpack.status === "running" ? "Compilando preview…"
    : sandpack.status === "idle" ? "Preview pronto"
    : sandpack.status === "timeout" ? "Tempo de inicialização excedido"
    : "Preparando ambiente…";
  return <div className="border-b border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-400">{label}</div>;
}

export default function ProjectRunner({ files = [], onDiagnosticsChange }) {
  const preview = useMemo(() => detectPreview(files), [files]);
  const projectFiles = useMemo(
    () => prepareFiles(files, preview.template),
    [files, preview.template]
  );
  const dependencies = useMemo(() => {
    const pkg = parsePackage(files);
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  }, [files]);

  if (!preview.supported) return <UnsupportedPreview preview={preview} files={files} />;

  return (
    <div className="h-full min-h-0 w-full overflow-auto bg-[#06101f]">
      <SandpackProvider
        template={preview.template}
        files={projectFiles}
        customSetup={{ dependencies }}
        options={{
          autorun: true,
          recompileMode: "delayed",
          recompileDelay: 500
        }}
        theme="dark"
      >
        <SandpackLayout>
          <div className="flex w-full flex-col">
            <PreviewStatus />
            <SandpackPreview
              showNavigator
              showRefreshButton
              showOpenInCodeSandbox={false}
              style={{ height: "65vh" }}
            />
            <ProjectDiagnostics onDiagnosticsChange={onDiagnosticsChange} />
            <SandpackConsole style={{ height: 160 }} />
          </div>
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
