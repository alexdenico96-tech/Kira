// KIRA_ARTIFACT_NEWLINE_REPAIR_V1
// Converts literal backslash-n tokens only in JavaScript lexical code positions.
// A repair is accepted only when the existing Syntax Gate reports fewer issues.
const JS_FILE = /\.(?:js|mjs|cjs|jsx)$/i;

function decodeOutsideStrings(source) {
  let state = 'code';
  let output = '';
  let changed = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (state === 'code') {
      if (ch === '"' || ch === "'" || ch === '`') { state = ch; output += ch; continue; }
      if (ch === '/' && next === '/') { state = 'linecomment'; output += '//'; i++; continue; }
      if (ch === '/' && next === '*') { state = 'blockcomment'; output += '/*'; i++; continue; }
      if (ch === '\\' && next === 'n') { output += '\n'; i++; changed++; continue; }
      output += ch;
    } else if (state === 'linecomment') {
      if (ch === '\\' && next === 'n') { output += '\n'; i++; changed++; state = 'code'; continue; }
      output += ch;
      if (ch === '\n') state = 'code';
    } else if (state === 'blockcomment') {
      output += ch;
      if (ch === '*' && next === '/') { output += '/'; i++; state = 'code'; }
    } else {
      output += ch;
      if (ch === '\\' && i + 1 < source.length) { output += source[++i]; continue; }
      if (ch === state) state = 'code';
    }
  }
  return { content: output, changed };
}

export function repairArtifactNewlines(files, inspectProjectSyntax) {
  let fixed = 0, tokens = 0;
  const result = files.map(file => {
    if (!JS_FILE.test(file.path || '') || typeof file.content !== 'string') return file;
    if (!file.content.includes('\\n')) return file;
    // This targets single-line / flattened code, not normally formatted files.
    const actualLines = file.content.split('\n').length;
    const encodedLines = (file.content.match(/\\n/g) || []).length;
    if (encodedLines < 2 || actualLines > Math.max(3, encodedLines / 2)) return file;
    const candidate = decodeOutsideStrings(file.content);
    if (!candidate.changed) return file;
    try {
      const before = inspectProjectSyntax([file]).issues.length;
      const after = inspectProjectSyntax([{ ...file, content: candidate.content }]).issues.length;
      if (before > after && after === 0) {
        fixed++;
        tokens += candidate.changed;
        return { ...file, content: candidate.content };
      }
    } catch { /* retain original if syntax inspection is unavailable */ }
    return file;
  });
  return { files: result, fixed, tokens };
}
