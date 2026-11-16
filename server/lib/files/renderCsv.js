// CSV para abrir direto no Excel em português: separador ";", vírgula decimal e BOM UTF-8.
import { parseCell } from './values.js';
import { langOf } from './language.js';

export async function renderCsv(spec) {
  const sheet = spec.sheets[0] || { columns: [], rows: [] };
  const L = langOf(spec.lang);
  const sep = L.csvSep;
  const quote = v => {
    const s = String(v ?? '');
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const format = (raw, type) => {
    const v = parseCell(raw, type);
    if (v && typeof v === 'object' && 'formula' in v) return '';
    if (v instanceof Date) { const [y, m, d] = v.toISOString().slice(0, 10).split('-'); return L.code === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`; }
    if (typeof v === 'number') return String(type === 'percent' ? +(v * 100).toFixed(4) : v).replace('.', L.decimal) + (type === 'percent' ? '%' : '');
    return v ?? '';
  };
  const lines = [
    sheet.columns.map(c => quote(c.header)).join(sep),
    ...sheet.rows.map(r => sheet.columns.map((c, i) => quote(format(r[i], c.type))).join(sep))
  ];
  return { buffer: Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8'), summary: `${sheet.rows.length} linhas · ${sheet.columns.length} colunas` };
}
