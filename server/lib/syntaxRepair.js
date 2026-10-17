// Reparo controlado de sintaxe para projetos gerados pela Kira.
// Não salva arquivos nem executa o código do projeto.

export async function repairProjectSyntax({
  files,
  syntax,
  requestRepair,
  inspectSyntax,
  inspectQuality,
  maxFiles = 5,
  maxBytes = 16000
}) {
  const rejected = { repaired: false, files };

  if (
    !Array.isArray(files) ||
    !syntax?.issues?.length ||
    syntax.skipped !== 0
  ) {
    return rejected;
  }

  const affectedFiles = files.filter(file =>
    syntax.issues.some(issue =>
      issue.startsWith(`${file.path}:`)
    )
  );

  if (
    affectedFiles.length === 0 ||
    affectedFiles.length > maxFiles ||
    affectedFiles.reduce(
      (total, file) =>
        total + Buffer.byteLength(file.content, "utf8"),
      0
    ) > maxBytes
  ) {
    return rejected;
  }

  const allowedPaths = new Set(
    affectedFiles.map(file => file.path)
  );

  const message = [
    "Corrija SOMENTE os erros de sintaxe dos arquivos fornecidos.",
    "Retorne operações update com o conteúdo completo dos arquivos corrigidos.",
    "Não crie, exclua ou modifique outros arquivos.",
    "Preserve a lógica, a stack e os caminhos.",
    "Erros encontrados:",
    ...syntax.issues.slice(0, 10),
    "",
    "Arquivos:",
    ...affectedFiles.map(file =>
      JSON.stringify({
        path: file.path,
        content: file.content
      })
    )
  ].join("\n");

  const patch = await requestRepair(message);

  if (
    !Array.isArray(patch?.changes) ||
    patch.changes.length === 0 ||
    !patch.changes.every(change =>
      change.action === "update" &&
      allowedPaths.has(change.path) &&
      typeof change.content === "string" &&
      change.content.length > 0
    )
  ) {
    return rejected;
  }

  const replacements = new Map(
    patch.changes.map(change => [
      change.path,
      change.content
    ])
  );

  const candidate = files.map(file =>
    replacements.has(file.path)
      ? { ...file, content: replacements.get(file.path) }
      : file
  );

  const newSyntax = inspectSyntax(candidate);
  const newQuality = inspectQuality(candidate);

  if (
    newSyntax.issues.length > 0 ||
    newSyntax.skipped !== 0 ||
    !newQuality.ok
  ) {
    return rejected;
  }

  return {
    repaired: true,
    files: candidate
  };
}