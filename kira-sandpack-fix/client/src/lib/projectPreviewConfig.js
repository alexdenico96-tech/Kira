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

export function buildSandpackPreviewConfig(files = []) {
  const pkg = readPackage(files);
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
