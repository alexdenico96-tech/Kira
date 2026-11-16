// Lógica das fases de progresso (sem JSX, testável no Node).
// Fases como o servidor manda: o mesmo id atualiza a linha; um id novo conclui as anteriores.
export function mergeProgress(steps, event) {
  const next = steps.map(step =>
    step.id !== event.id && step.state === "active" ? { ...step, state: "done" } : step
  );
  const index = next.findIndex(step => step.id === event.id);
  const item = { id: event.id, label: event.label, detail: event.detail || "", state: event.state || "active", ...(event.icons?.length ? { icons: event.icons } : {}) };
  if (index >= 0) next[index] = { ...next[index], ...item };
  else next.push(item);
  return next;
}

export function modeFromStep(id, current) {
  if (["understand", "design", "build", "verify", "fix", "quality", "images", "save"].includes(id)) return "project";
  if (["read", "edit"].includes(id)) return "edit";
  if (id === "plan" || /^(render|check)(-\d+)?$/.test(id)) return "image";
  if (id === "look") return "vision";
  if (id === "search" || id === "write") return "search";
  if (String(id).startsWith("file-")) return "file";
  if (id === "listen") return "audio";
  return current;
}

export function formatSeconds(seconds) {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}min ${String(seconds % 60).padStart(2, "0")}s`;
}
