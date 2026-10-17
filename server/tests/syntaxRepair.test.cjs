const test = require("node:test");
const assert = require("node:assert/strict");

const original = [
  {
    path: "src/App.jsx",
    content: "export default function App(){return <div>Erro</span>}"
  },
  {
    path: "src/utils.js",
    content: "export const soma = (a, b) => a + b;"
  }
];

const corrected = "export default function App(){return <div>Corrigido</div>}";

const syntax = {
  issues: ["src/App.jsx: fechamento JSX incorreto"],
  skipped: 0
};

test("aceita correção válida e preserva outros arquivos", async () => {
  const { repairProjectSyntax } = await import("../lib/syntaxRepair.js");

  const result = await repairProjectSyntax({
    files: original,
    syntax,
    requestRepair: async () => ({
      changes: [
        { action: "update", path: "src/App.jsx", content: corrected }
      ]
    }),
    inspectSyntax: files => ({
      issues: files[0].content === corrected ? [] : ["erro"],
      skipped: 0
    }),
    inspectQuality: () => ({ ok: true })
  });

  assert.equal(result.repaired, true);
  assert.equal(result.files[0].content, corrected);
  assert.equal(result.files[1].content, original[1].content);
});

test("rejeita correção que continua inválida", async () => {
  const { repairProjectSyntax } = await import("../lib/syntaxRepair.js");

  const result = await repairProjectSyntax({
    files: original,
    syntax,
    requestRepair: async () => ({
      changes: [
        { action: "update", path: "src/App.jsx", content: "JSX inválido" }
      ]
    }),
    inspectSyntax: () => ({
      issues: ["erro de sintaxe"],
      skipped: 0
    }),
    inspectQuality: () => ({ ok: true })
  });

  assert.equal(result.repaired, false);
  assert.deepEqual(result.files, original);
});

test("rejeita alteração em arquivo não autorizado", async () => {
  const { repairProjectSyntax } = await import("../lib/syntaxRepair.js");

  const result = await repairProjectSyntax({
    files: original,
    syntax,
    requestRepair: async () => ({
      changes: [
        {
          action: "update",
          path: "src/utils.js",
          content: "export const soma = () => 0;"
        }
      ]
    }),
    inspectSyntax: () => ({ issues: [], skipped: 0 }),
    inspectQuality: () => ({ ok: true })
  });

  assert.equal(result.repaired, false);
  assert.deepEqual(result.files, original);
});