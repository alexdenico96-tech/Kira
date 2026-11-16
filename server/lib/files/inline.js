// Markdown inline mínimo (**negrito**, *itálico*) → trechos com estilo, usado por Word e PDF.
export function inlineRuns(text = '') {
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__)/g;
  let last = 0;
  let m;
  const src = String(text);
  while ((m = re.exec(src))) {
    if (m.index > last) runs.push({ text: src.slice(last, m.index) });
    if (m[2] || m[4]) runs.push({ text: m[2] || m[4], bold: true });
    else runs.push({ text: m[3], italic: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  return runs.length ? runs : [{ text: '' }];
}
