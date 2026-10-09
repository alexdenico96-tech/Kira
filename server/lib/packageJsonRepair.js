// KIRA_PACKAGE_JSON_REPAIR_V1
// Repairs literal newline escapes ONLY outside JSON strings and ONLY if resulting JSON parses.
function decodeStructuralNewlines(source) {
  let quoted = false;
  let out = '';
  let count = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      out += ch;
      if (ch === '\\' && i + 1 < source.length) out += source[++i];
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; out += ch; continue; }
    if (ch === '\\' && source[i + 1] === 'n') { out += '\n'; i++; count++; continue; }
    if (ch === '\\' && source[i + 1] === 'r' && source.slice(i + 2, i + 4) === '\\n') { out += '\n'; i += 3; count++; continue; }
    out += ch;
  }
  return { content: out, count };
}

export function repairPackageJsonNewlines(files) {
  if (!Array.isArray(files)) return files;
  return files.map(file => {
    if (!/(^|\/)package\.json$/i.test(String(file?.path || '').replace(/\\/g, '/')) || typeof file.content !== 'string') return file;
    try { JSON.parse(file.content); return file; } catch { /* attempt safe repair */ }
    const candidate = decodeStructuralNewlines(file.content);
    if (!candidate.count) return file;
    try {
      const parsed = JSON.parse(candidate.content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return file;
      console.info(`[kira-package-json] repaired=1 structural_newlines=${candidate.count}`);
      return { ...file, content: candidate.content };
    } catch {
      console.warn('[kira-package-json] repair_skipped reason=still_invalid');
      return file;
    }
  });
}
