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

test("Vite + React roda no empacotador do navegador com a entrada do projeto", () => {
  const result = buildSandpackPreviewConfig(viteReactFiles);
  assert.equal(result.template, "react");
  assert.equal(result.customSetup.entry, "/src/main.jsx");
});

test("não envia package.json nem configs de build ao preview", () => {
  const files = [...viteReactFiles, { path: "vite.config.js", content: "import { defineConfig } from 'vite'" }];
  const result = buildSandpackPreviewConfig(files);
  assert.equal(Object.hasOwn(result.files, "/package.json"), false);
  assert.equal(Object.hasOwn(result.files, "/vite.config.js"), false);
});

test("remove pacotes só de build e mantém os de runtime", () => {
  const result = buildSandpackPreviewConfig(viteReactFiles);
  const deps = result.customSetup.dependencies;
  assert.equal(deps.vite, undefined);
  assert.equal(deps["@vitejs/plugin-react"], undefined);
  assert.equal(deps.tailwindcss, undefined);
  assert.equal(deps.react, "^18.3.1");
});

test("move index.html para public, tira o script do Vite e injeta Tailwind", () => {
  const html = buildSandpackPreviewConfig(viteReactFiles).files["/public/index.html"].code;
  assert.match(html, /id="root"/);
  assert.doesNotMatch(html, /src\/main\.jsx/);
  assert.match(html, /cdn\.tailwindcss\.com/);
});

test("CSS com diretivas Tailwind vai para o Tailwind do navegador (v4)", () => {
  const files = [
    { path: "package.json", content: JSON.stringify({ dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" }, devDependencies: { vite: "^6", tailwindcss: "^4.0.0", "@tailwindcss/vite": "^4.0.0" } }) },
    { path: "index.html", content: '<html><head></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>' },
    { path: "src/main.jsx", content: 'import "./index.css"; import App from "./App";' },
    { path: "src/App.jsx", content: "export default () => <h1/>" },
    { path: "src/index.css", content: '@import "tailwindcss";\n@theme { --color-brand: #f97316; }' }
  ];
  const result = buildSandpackPreviewConfig(files);
  assert.match(result.files["/public/index.html"].code, /@tailwindcss\/browser@4/);
  assert.match(result.files["/public/index.html"].code, /--color-brand/);
  assert.doesNotMatch(result.files["/src/index.css"].code, /@import/);
});

test("converte alias @/ e import.meta.env para o preview", () => {
  const files = [
    ...viteReactFiles.filter(f => f.path !== "src/App.jsx"),
    { path: "src/App.jsx", content: 'import Card from "@/components/Card";\nconst api = import.meta.env.VITE_API;\nexport default function App(){ return <Card/> }' },
    { path: "src/components/Card.jsx", content: "export default () => null" }
  ];
  const code = buildSandpackPreviewConfig(files).files["/src/App.jsx"].code;
  assert.match(code, /from "\.\/components\/Card"/);
  assert.match(code, /const api = undefined/);
});

test("TypeScript usa o template react-ts", () => {
  const files = [
    { path: "package.json", content: JSON.stringify({ dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" } }) },
    { path: "src/main.tsx", content: 'import App from "./App";' },
    { path: "src/App.tsx", content: "export default function App(){ return <h1/> }" }
  ];
  const result = buildSandpackPreviewConfig(files);
  assert.equal(result.template, "react-ts");
  assert.equal(result.customSetup.entry, "/src/main.tsx");
});

test("selects the Vite Vue TypeScript template", () => {
  const files = [
    { path: "package.json", content: JSON.stringify({ dependencies: { vue: "^3.5.0" }, devDependencies: { vite: "^5.4.0" } }) },
    { path: "src/main.ts", content: "" },
    { path: "src/App.vue", content: "" }
  ];
  assert.equal(buildSandpackPreviewConfig(files).template, "vite-vue-ts");
});
