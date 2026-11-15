// Efeito de escrita sem streaming: a resposta chega inteira e é revelada aos poucos no navegador.
// Avança por palavras (não por letras soltas) e fecha blocos de código abertos para o Markdown não quebrar.

// Velocidade: textos curtos ~75 caracteres/s; textos longos aceleram para terminar em até ~8s.
export function revealSpeed(length) {
  return Math.max(75, Math.ceil(length / 8));
}

// Próximo ponto de corte: fim da palavra/pontuação a partir de "target".
export function nextBoundary(text, target) {
  if (target >= text.length) return text.length;
  const rest = text.slice(target);
  const match = rest.match(/^\S*\s*/);
  return Math.min(text.length, target + (match ? match[0].length : 1));
}

// Markdown parcial seguro: fecha ``` aberto e remove marcador de lista/título solto no fim.
export function safePartialMarkdown(partial) {
  let text = partial;
  const fences = (text.match(/```/g) || []).length;
  if (fences % 2 === 1) text += "\n```";
  return text.replace(/(^|\n)(#{1,6}|[-*+]|\d+\.)\s*$/, "$1");
}

// Citações [1] viram links para a fonte (o componente de Markdown desenha como selo).
export function linkCitations(text, sources = []) {
  if (!sources?.length) return text;
  return String(text).replace(/\[(\d{1,2})\](?!\()/g, (match, n) => {
    const source = sources[Number(n) - 1];
    return source ? `[${n}](${source.url} "fonte:${source.domain}")` : match;
  });
}
