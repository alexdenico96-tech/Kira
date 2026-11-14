// KIRA_HTML_ARTIFACT_REPAIR_V1
// Corrige somente aspas escapadas indevidamente dentro de marcação HTML.
// Conteúdo de <script>, <style>, comentários e strings de JavaScript/CSS é preservado.
const HTML_FILE = /\.html?$/i;

function repairHtmlMarkup(source) {
  let changed = 0;
  let output = String(source ?? "");

  // Corrige um escape acidental antes do DOCTYPE, sem tocar em texto comum.
  output = output.replace(/(^|\n)([\t ]*)\\(<!doctype\b)/i, (_match, line, indent, doctype) => {
    changed++;
    return `${line}${indent}${doctype}`;
  });

  // Processa tags e preserva integralmente comentários e blocos raw-text.
  const tokenPattern = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<![^>]*>|<\?[^>]*>|<[^>]+>/gi;
  const repairTagQuotes = (tag) => tag.replace(/\\(["'])/g, (_match, quote) => {
    changed++;
    return quote;
  });

  output = output.replace(tokenPattern, (token) => {
    if (/^<!--/i.test(token)) return token;
    if (/^<(?:script|style)\b/i.test(token)) {
      // Corrige apenas a tag de abertura; não altera strings JS/CSS no corpo.
      const openingTag = token.match(/^<[^>]+>/)?.[0];
      return openingTag ? repairTagQuotes(openingTag) + token.slice(openingTag.length) : token;
    }
    return repairTagQuotes(token);
  });

  return { content: output, changed };
}

export function repairGeneratedHtml(files) {
  let repairedFiles = 0;
  let repairedEscapes = 0;
  const result = (Array.isArray(files) ? files : []).map((file) => {
    if (!file || typeof file.content !== "string" || !HTML_FILE.test(String(file.path || ""))) return file;
    const repaired = repairHtmlMarkup(file.content);
    if (!repaired.changed) return file;
    repairedFiles++;
    repairedEscapes += repaired.changed;
    return { ...file, content: repaired.content };
  });
  return { files: result, repairedFiles, repairedEscapes };
}

export { repairHtmlMarkup };
