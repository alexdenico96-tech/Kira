import test from "node:test";
import assert from "node:assert/strict";
import { buildSandpackPreviewConfig } from "../src/lib/projectPreviewConfig.js";

const viteReactFiles = [
  { path: "package.json", content: JSON.stringify({
    scripts: { dev: "vite", build: "vite build" },
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
    devDependencies: {
      vite: "^5.4.9",
      "@vitejs/plugin-react": "^4.3.1",
      tailwindcss: "^3.4.4"
    }
  }) },
  { path: "index.html", content: '<div id="root"></div><script type="module" src="/src/main.jsx"></script>' },
  { path: "src/main.jsx", content: 'import App from "./App";' },
  { path: "src/App.jsx", content: "export default function App(){ return <h1>OK</h1> }" }
];

test("Vite + React selects the Vite React Sandpack template", () => {
  const result = buildSandpackPreviewConfig(viteReactFiles);
  assert.equal(result.template, "vite-react");
});

test("does not pass generated package.json as a sandbox file", () => {
  const result = buildSandpackPreviewConfig(viteReactFiles);
  assert.equal(Object.hasOwn(result.files, "/package.json"), false);
});

test("leaves Nodebox Vite/esbuild packages to the Vite preset", () => {
  const result = buildSandpackPreviewConfig(viteReactFiles);
  assert.equal(result.customSetup.devDependencies.vite, undefined);
  assert.equal(result.customSetup.devDependencies["@vitejs/plugin-react"], undefined);
  assert.equal(result.customSetup.devDependencies.tailwindcss, "^3.4.4");
});

test("preserves project source paths without inventing an index alias", () => {
  const result = buildSandpackPreviewConfig(viteReactFiles);
  assert.equal(result.files["/src/main.jsx"].code, 'import App from "./App";');
  assert.equal(result.files["/src/index.js"], undefined);
});

test("selects the Vite Vue TypeScript template", () => {
  const files = [
    { path: "package.json", content: JSON.stringify({ dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^5.4.0" } }) },
    { path: "src/main.ts", content: "" },
    { path: "src/App.vue", content: "" }
  ];
  assert.equal(buildSandpackPreviewConfig(files).template, "vite-vue-ts");
});
