// PDF A4 com capa, títulos no tema, listas, tabelas que quebram página repetindo o cabeçalho,
// citações, destaques, cabeçalho e numeração de páginas.
import PDFDocument from 'pdfkit';
import { themeOf, tint, hex } from './themes.js';
import { inlineRuns } from './inline.js';

// Fontes padrão do PDF usam WinAnsi: troca o que não existe nelas por equivalentes.
const clean = s => String(s || '')
  .replace(/[→➜➡]/g, '->').replace(/←/g, '<-').replace(/[✓✔✅]/g, 'v')
  .replace(/[⭐★]/g, '*').replace(/[  ]/g, ' ')
  .replace(/[^\u0000-ÿ–—‘’“”•…€]/g, '');

const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique' };
const fontFor = (bold, italic) => (bold && italic ? FONT.boldItalic : bold ? FONT.bold : italic ? FONT.italic : FONT.regular);

export async function renderPdf(spec) {
  const t = themeOf(spec.theme);
  const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: 58, right: 58 }, bufferPages: true, info: { Title: spec.title, Author: spec.author || 'Kira', Subject: spec.subtitle || spec.title, Creator: 'Kira' } });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(resolve => doc.on('end', resolve));

  const PW = doc.page.width;
  const PH = doc.page.height;
  const left = doc.page.margins.left;
  const width = PW - left - doc.page.margins.right;
  const bottom = () => PH - doc.page.margins.bottom;
  const ensure = h => { if (doc.y + h > bottom()) doc.addPage(); };

  const richText = (text, { size = 11, color = t.text, x = left, w = width, italic = false, bold = false, gap = 3.2 } = {}) => {
    const parts = inlineRuns(clean(text));
    doc.fillColor(hex(color)).fontSize(size);
    doc.text('', x, doc.y, { width: w, continued: true });
    parts.forEach((p, i) => {
      doc.font(fontFor(bold || p.bold, italic || p.italic)).text(p.text, { width: w, continued: i < parts.length - 1, lineGap: gap });
    });
  };

  // ---------- capa ----------
  doc.rect(0, 0, PW, PH * 0.56).fill(hex(t.dark));
  doc.circle(PW - 40, 120, 170).fillOpacity(0.35).fill(hex(t.primary)).fillOpacity(1);
  doc.circle(PW - 120, PH * 0.56, 90).fillOpacity(0.5).fill(hex(t.accent)).fillOpacity(1);
  doc.rect(left, PH * 0.26, 6, 120).fill(hex(t.accent));
  doc.font(FONT.bold).fontSize(32).fillColor('#FFFFFF').text(clean(spec.title), left + 24, PH * 0.26, { width: width - 90, lineGap: 2 });
  if (spec.subtitle) doc.moveDown(0.5).font(FONT.regular).fontSize(14).fillColor('#CBD5E1').text(clean(spec.subtitle), left + 24, doc.y, { width: width - 90 });
  const date = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  doc.font(FONT.bold).fontSize(11).fillColor(hex(t.primary)).text(clean([spec.author, date].filter(Boolean).join('   ·   ')), left, PH * 0.62, { width });
  doc.addPage();

  // ---------- conteúdo ----------
  for (const b of spec.blocks) {
    switch (b.type) {
      case 'heading': {
        const size = [20, 15, 12.5][b.level - 1];
        ensure(size * 3 + 30);
        doc.moveDown(b.level === 1 ? 0.9 : 0.6);
        doc.font(FONT.bold).fontSize(size).fillColor(hex(b.level === 2 ? t.dark : t.primary)).text(clean(b.text.replace(/\*\*/g, '')), left, doc.y, { width });
        if (b.level === 1) { const y = doc.y + 4; doc.rect(left, y, 42, 3).fill(hex(t.accent)); doc.y = y + 12; } else doc.moveDown(0.3);
        break;
      }
      case 'bullets':
      case 'numbered':
        b.items.forEach((item, i) => {
          ensure(30);
          const y = doc.y;
          if (b.type === 'numbered') doc.font(FONT.bold).fontSize(11).fillColor(hex(t.primary)).text(`${i + 1}.`, left + 4, y, { width: 18 });
          else doc.circle(left + 8, y + 6.5, 2.6).fill(hex(t.accent));
          doc.y = y;
          richText(item, { x: left + 22, w: width - 22 });
          doc.moveDown(0.35);
        });
        doc.moveDown(0.3);
        break;
      case 'table': {
        const headers = b.headers.length ? b.headers : (b.rows[0] || []);
        const rows = b.headers.length ? b.rows : b.rows.slice(1);
        const cols = Math.max(1, headers.length);
        const colW = width / cols;
        const pad = 6;
        const rowHeight = (cells, font, size) => Math.max(...cells.map(c => doc.font(font).fontSize(size).heightOfString(clean(c), { width: colW - pad * 2 }))) + pad * 2;
        const drawRow = (cells, { header = false, fill } = {}) => {
          const font = header ? FONT.bold : FONT.regular;
          const h = rowHeight(cells, font, 9.5);
          const y = doc.y;
          if (fill) doc.rect(left, y, width, h).fill(hex(fill));
          cells.forEach((c, i) => doc.font(font).fontSize(9.5).fillColor(header ? '#FFFFFF' : hex(t.text)).text(clean(c), left + i * colW + pad, y + pad, { width: colW - pad * 2 }));
          doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.5).strokeColor(hex(tint(t.primary, 0.75))).stroke();
          doc.y = y + h;
        };
        doc.moveDown(0.4);
        ensure(rowHeight(headers, FONT.bold, 9.5) * 2 + 10);
        drawRow(headers, { header: true, fill: t.primary });
        rows.forEach((r, i) => {
          const cells = Array.from({ length: cols }, (_, c) => r[c] ?? '');
          if (doc.y + rowHeight(cells, FONT.regular, 9.5) > bottom()) { doc.addPage(); drawRow(headers, { header: true, fill: t.primary }); }
          drawRow(cells, { fill: i % 2 ? tint(t.primary, 0.94) : undefined });
        });
        doc.x = left;
        doc.moveDown(0.8);
        break;
      }
      case 'quote': {
        const h = doc.font(FONT.italic).fontSize(13).heightOfString(clean(b.text), { width: width - 30 }) + 16;
        ensure(h + 10);
        doc.moveDown(0.4);
        const y = doc.y;
        doc.rect(left, y, 4, h).fill(hex(t.accent));
        doc.y = y + 8;
        richText(b.text, { x: left + 20, w: width - 30, size: 13, italic: true, color: t.dark });
        doc.y = y + h + 8;
        break;
      }
      case 'callout': {
        const color = { info: t.primary, success: '15803D', warning: 'B45309' }[b.tone];
        const h = doc.font(FONT.regular).fontSize(11).heightOfString(clean(b.text), { width: width - 36 }) + 24;
        ensure(h + 10);
        doc.moveDown(0.4);
        const y = doc.y;
        doc.roundedRect(left, y, width, h, 6).fill(hex(tint(color, 0.9)));
        doc.rect(left, y, 4, h).fill(hex(color));
        doc.y = y + 12;
        richText(b.text, { x: left + 18, w: width - 36, color: t.dark });
        doc.y = y + h + 8;
        break;
      }
      case 'pagebreak':
        doc.addPage();
        break;
      default:
        if (!b.text) break;
        ensure(40);
        richText(b.text, { x: left, w: width });
        doc.moveDown(0.7);
    }
    doc.x = left;
  }

  // ---------- cabeçalho e rodapé (todas as páginas, menos a capa) ----------
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(FONT.regular).fontSize(8.5).fillColor(hex(t.muted));
    doc.text(clean(spec.title), left, 30, { width: width * 0.7, lineBreak: false });
    doc.moveTo(left, 46).lineTo(left + width, 46).lineWidth(0.5).strokeColor(hex(tint(t.primary, 0.8))).stroke();
    doc.text(`${i} / ${range.count - 1}`, left, PH - 40, { width, align: 'center', lineBreak: false });
    doc.page.margins.bottom = keep;
  }

  doc.end();
  await done;
  const pages = range.count;
  return { buffer: Buffer.concat(chunks), summary: `${pages} ${pages === 1 ? 'página' : 'páginas'}` };
}
