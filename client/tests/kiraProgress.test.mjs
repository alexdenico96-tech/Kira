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
