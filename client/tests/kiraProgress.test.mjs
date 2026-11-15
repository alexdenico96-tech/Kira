import test from "node:test";
import assert from "node:assert/strict";
import { mergeProgress, modeFromStep, formatSeconds } from "../src/lib/progress.js";

test("novo id conclui a fase anterior; mesmo id atualiza a linha", () => {
  let steps = mergeProgress([], { id: "build", label: "Construindo o projeto" });
  steps = mergeProgress(steps, { id: "build", label: "Fase 1 finalizada", detail: "9 arquivos", state: "done" });
  steps = mergeProgress(steps, { id: "verify", label: "Verificando" });
  steps = mergeProgress(steps, { id: "fix", label: "Fase 2" });
  assert.deepEqual(steps.map(s => [s.id, s.state]), [["build", "done"], ["verify", "done"], ["fix", "active"]]);
  assert.equal(steps[0].label, "Fase 1 finalizada");
});

test("modo da tela segue as fases do servidor", () => {
  assert.equal(modeFromStep("build", "chat"), "project");
  assert.equal(modeFromStep("render-2", "chat"), "image");
  assert.equal(modeFromStep("edit", "chat"), "edit");
  assert.equal(modeFromStep("think", "vision"), "vision");
  assert.equal(formatSeconds(75), "1min 15s");
});

import { nextBoundary, revealSpeed, safePartialMarkdown, linkCitations } from "../src/lib/typewriter.js";

test("escrita avança por palavras e fecha bloco de código aberto", () => {
  assert.equal(nextBoundary("Olá mundo bonito", 1), 4);
  assert.equal(safePartialMarkdown("Veja:\n```js\nconst a"), "Veja:\n```js\nconst a\n```");
  assert.equal(revealSpeed(100), 75);
  assert.equal(revealSpeed(4000), 500);
});

test("citações [n] viram links da fonte", () => {
  const out = linkCitations("Fato [1] e outro [3].", [{ url: "https://a.com", domain: "a.com" }]);
  assert.equal(out, 'Fato [1](https://a.com "fonte:a.com") e outro [3].');
});

test("fase de pesquisa guarda os ícones dos sites", async () => {
  const { mergeProgress, modeFromStep } = await import("../src/lib/progress.js");
  const steps = mergeProgress([], { id: "search", label: "3 fontes", state: "done", icons: ["g1.globo.com"] });
  assert.deepEqual(steps[0].icons, ["g1.globo.com"]);
  assert.equal(modeFromStep("search", "chat"), "search");
});
