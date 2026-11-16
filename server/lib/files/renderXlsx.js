// Excel com título, cabeçalho fixo e filtro, formatos (R$, %, data), zebra, fórmulas e linha de total.
import ExcelJS from 'exceljs';
import { themeOf, tint } from './themes.js';
import { parseCell } from './values.js';
import { langOf, CURRENCIES } from './language.js';

const BASE_FORMATS = { percent: '0.0%', integer: '#,##0', number: '#,##0.00' };
const colLetter = n => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export async function renderXlsx(spec) {
  const t = themeOf(spec.theme);
  const L = langOf(spec.lang);
  const FORMATS = { ...BASE_FORMATS, currency: CURRENCIES[spec.currency] || CURRENCIES[L.defaultCurrency], date: L.dateFmt };
  const wb = new ExcelJS.Workbook();
  wb.creator = spec.author || 'Kira';
  wb.title = spec.title;
  wb.created = new Date();
  let totalRows = 0;

  for (const sheet of spec.sheets) {
    const cols = sheet.columns;
    const n = Math.max(1, cols.length);
    const ws = wb.addWorksheet(sheet.name, { properties: { tabColor: { argb: `FF${t.primary}` } }, views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    const last = colLetter(n - 1);

    ws.mergeCells(`A1:${last}1`);
    Object.assign(ws.getCell('A1'), { value: spec.sheets.length > 1 ? `${spec.title} — ${sheet.name}` : spec.title });
    ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${t.primary}` } };
    ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 32;

    ws.mergeCells(`A2:${last}2`);
    ws.getCell('A2').value = sheet.description || spec.subtitle || '';
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: `FF${t.muted}` } };
    ws.getCell('A2').alignment = { vertical: 'middle', indent: 1, wrapText: true };
    ws.getRow(2).height = sheet.description || spec.subtitle ? 22 : 8;

    const header = ws.getRow(3);
    cols.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${t.dark}` } };
      cell.alignment = { vertical: 'middle', horizontal: ['text', 'date'].includes(c.type) ? 'left' : 'right', wrapText: true };
    });
    header.height = 24;

    const border = { style: 'thin', color: { argb: `FF${tint(t.primary, 0.8)}` } };
    sheet.rows.forEach((r, ri) => {
      const row = ws.getRow(4 + ri);
      cols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = parseCell(r[ci], c.type);
        if (FORMATS[c.type]) cell.numFmt = FORMATS[c.type];
        cell.border = { bottom: border };
        cell.alignment = { vertical: 'middle', wrapText: c.type === 'text' };
        if (ri % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${tint(t.primary, 0.95)}` } };
      });
      row.height = 20;
    });
    totalRows += sheet.rows.length;

    const lastData = 3 + sheet.rows.length;
    if (sheet.totals && sheet.rows.length) {
      const row = ws.getRow(lastData + 1);
      cols.forEach((c, ci) => {
        const cell = row.getCell(ci + 1);
        if (ci === 0) cell.value = L.total;
        else if (['number', 'integer', 'currency'].includes(c.type)) {
          cell.value = { formula: `SUM(${colLetter(ci)}4:${colLetter(ci)}${lastData})` };
          cell.numFmt = FORMATS[c.type];
        }
        cell.font = { bold: true, color: { argb: `FF${t.dark}` } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${tint(t.accent, 0.8)}` } };
        cell.border = { top: { style: 'medium', color: { argb: `FF${t.primary}` } } };
      });
      row.height = 22;
    }

    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, lastData), column: n } };
    cols.forEach((c, i) => {
      const longest = Math.max(c.header.length, ...sheet.rows.slice(0, 200).map(r => (String(r[i] ?? '').startsWith('=') ? 10 : String(r[i] ?? '').length)));
      ws.getColumn(i + 1).width = c.width || Math.min(50, Math.max(c.type === 'date' ? 12 : 10, longest + 3));
    });
    ws.pageSetup = { orientation: n > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' };
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const sheets = spec.sheets.length;
  return { buffer, summary: `${sheets} ${sheets === 1 ? 'aba' : 'abas'} · ${totalRows} linhas` };
}
