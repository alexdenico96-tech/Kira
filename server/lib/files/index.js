// KIRA_FILES_V1 — ponto único para gerar qualquer arquivo a partir da especificação.
import { FORMATS, normalizeSpec, specProblems } from './spec.js';
import { renderPptx } from './renderPptx.js';
import { renderDocx } from './renderDocx.js';
import { renderPdf } from './renderPdf.js';
import { renderXlsx } from './renderXlsx.js';
import { renderCsv } from './renderCsv.js';

export { FORMATS, CREATE_FILE_TOOL, detectFileRequest, filePlannerPrompt, normalizeSpec, specProblems } from './spec.js';
export { detectLanguage, detectCurrency, langOf } from './language.js';
export { inspectFileSpec, requestedCounts } from './quality.js';

const RENDERERS = { pptx: renderPptx, docx: renderDocx, pdf: renderPdf, xlsx: renderXlsx, csv: renderCsv };

export async function renderFile(rawSpec, format, options = {}) {
  if (!FORMATS[format]) throw new Error(`Formato não suportado: ${format}`);
  const spec = normalizeSpec(rawSpec, format, { lang: options.lang, currency: options.currency });
  const problems = specProblems(spec);
  if (problems.length) { const e = new Error(`Conteúdo insuficiente: ${problems.join('; ')}`); e.code = 'file_spec_invalid'; throw e; }
  const { buffer, summary } = await RENDERERS[format](spec, options);
  return { buffer, summary, spec, fileName: spec.fileName, mime: FORMATS[format].mime, format, label: FORMATS[format].label };
}
