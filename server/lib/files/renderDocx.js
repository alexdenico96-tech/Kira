// Word com capa, estilos de título no tema, listas, tabelas zebradas, citações, destaques e numeração de páginas.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, LevelFormat, LineRuleType, Packer, PageBreak, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType
} from 'docx';
import { themeOf, tint } from './themes.js';
import { inlineRuns } from './inline.js';
import { langOf } from './language.js';

const runs = (text, extra = {}) => inlineRuns(text).map(r => new TextRun({ text: r.text, bold: r.bold || extra.bold, italics: r.italic || extra.italics, color: extra.color, size: extra.size }));

export async function renderDocx(spec) {
  const t = themeOf(spec.theme);
  const children = [];
  const date = new Intl.DateTimeFormat(langOf(spec.lang).locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  // Capa
  children.push(
    new Paragraph({ spacing: { before: 2400, line: 264, lineRule: LineRuleType.AUTO }, border: { left: { style: BorderStyle.SINGLE, size: 48, color: t.accent, space: 18 } }, children: [new TextRun({ text: spec.title, bold: true, size: 64, color: t.dark, font: t.headFont })] }),
    ...(spec.subtitle ? [new Paragraph({ spacing: { before: 240 }, border: { left: { style: BorderStyle.SINGLE, size: 48, color: t.accent, space: 18 } }, children: [new TextRun({ text: spec.subtitle, size: 30, color: t.muted })] })] : []),
    new Paragraph({ spacing: { before: 3600 }, children: [new TextRun({ text: [spec.author, date].filter(Boolean).join('  ·  '), size: 22, color: t.primary, bold: true })] }),
    new Paragraph({ children: [new PageBreak()] })
  );

  for (const b of spec.blocks) {
    switch (b.type) {
      case 'heading':
        children.push(new Paragraph({ heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1], children: runs(b.text) }));
        break;
      case 'bullets':
      case 'numbered':
        for (const item of b.items) children.push(new Paragraph({ numbering: { reference: b.type === 'numbered' ? 'kira-numbers' : 'kira-bullets', level: 0 }, spacing: { after: 80 }, children: runs(item) }));
        break;
      case 'table': {
        const headers = b.headers.length ? b.headers : (b.rows[0] || []);
        const rows = b.headers.length ? b.rows : b.rows.slice(1);
        const cols = Math.max(1, headers.length);
        const cell = (text, opts = {}) => new TableCell({
          shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: runs(text, { bold: opts.bold, color: opts.color, size: 20 }) })]
        });
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.SINGLE, size: 4, color: tint(t.primary, 0.7) }, bottom: { style: BorderStyle.SINGLE, size: 4, color: tint(t.primary, 0.7) }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: tint(t.primary, 0.82) }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
          rows: [
            new TableRow({ tableHeader: true, children: headers.map(h => cell(h, { fill: t.primary, color: 'FFFFFF', bold: true })) }),
            ...rows.map((r, i) => new TableRow({ children: Array.from({ length: cols }, (_, c) => cell(r[c] ?? '', { fill: i % 2 ? tint(t.primary, 0.94) : undefined })) }))
          ]
        }));
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
        break;
      }
      case 'quote':
        children.push(new Paragraph({ indent: { left: 480 }, spacing: { before: 200, after: 200 }, border: { left: { style: BorderStyle.SINGLE, size: 24, color: t.accent, space: 14 } }, children: runs(b.text, { italics: true, color: t.dark, size: 26 }) }));
        break;
      case 'callout': {
        const color = { info: t.primary, success: '15803D', warning: 'B45309' }[b.tone];
        children.push(new Paragraph({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(color, 0.9) }, border: { left: { style: BorderStyle.SINGLE, size: 24, color, space: 10 } }, spacing: { before: 160, after: 160 }, indent: { left: 200, right: 200 }, children: runs(b.text, { color: t.dark }) }));
        break;
      }
      case 'pagebreak':
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      default:
        if (b.text) children.push(new Paragraph({ spacing: { after: 160 }, children: runs(b.text) }));
    }
  }

  const doc = new Document({
    creator: spec.author || 'Kira',
    title: spec.title,
    description: spec.subtitle,
    styles: {
      default: { document: { run: { font: t.bodyFont, size: 23, color: t.text }, paragraph: { spacing: { line: 300, lineRule: LineRuleType.AUTO } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: t.headFont, size: 36, bold: true, color: t.primary }, paragraph: { spacing: { before: 360, after: 160 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: t.accent, space: 4 } } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: t.headFont, size: 28, bold: true, color: t.dark }, paragraph: { spacing: { before: 280, after: 120 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: t.headFont, size: 24, bold: true, color: t.primary }, paragraph: { spacing: { before: 200, after: 80 } } }
      ]
    },
    numbering: {
      config: [
        { reference: 'kira-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 260 } }, run: { color: t.accent } } }] },
        { reference: 'kira-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } }, run: { color: t.primary, bold: true } } }] }
      ]
    },
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 1200, left: 1300, right: 1300 } }, titlePage: true },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: spec.title, size: 16, color: t.muted })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: t.muted }), new TextRun({ text: ' / ', size: 18, color: t.muted }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: t.muted })] })] }) },
      children
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  const sections = spec.blocks.filter(b => b.type === 'heading' && b.level === 1).length;
  return { buffer, summary: sections ? `${sections} ${sections === 1 ? 'seção' : 'seções'}` : 'documento' };
}
