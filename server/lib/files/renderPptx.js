// PowerPoint 16:9 com 10 layouts e tema. Textos curtos no slide; o detalhe vai nas anotações.
import pptxgen from 'pptxgenjs';
import { themeOf, tint } from './themes.js';
import { langOf } from './language.js';

const W = 13.333;
const H = 7.5;
const M = 0.65; // margem

const sizeFor = (text, base, steps) => {
  const len = String(text || '').length;
  let size = base;
  for (const [limit, s] of steps) if (len > limit) size = s;
  return size;
};

export async function renderPptx(spec, { resolveImage } = {}) {
  const t = themeOf(spec.theme);
  const L = langOf(spec.lang);
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = spec.title;
  pptx.subject = spec.subtitle || spec.title;
  pptx.author = spec.author || 'Kira';
  pptx.company = 'Gerado pela Kira';

  const total = spec.slides.length;
  const head = { fontFace: t.headFont, color: t.dark };
  const body = { fontFace: t.bodyFont, color: t.text };
  let sectionIndex = 0;
  let imagesLeft = 3;

  const footer = (slide, index, dark = false) => {
    slide.addText(spec.title, { x: M, y: H - 0.5, w: 8, h: 0.3, fontFace: t.bodyFont, fontSize: 10, color: dark ? 'CBD5E1' : t.muted });
    slide.addText(`${index + 1} / ${total}`, { x: W - M - 1.5, y: H - 0.5, w: 1.5, h: 0.3, fontFace: t.bodyFont, fontSize: 10, color: dark ? 'CBD5E1' : t.muted, align: 'right' });
  };

  const titleBlock = (slide, s, { x = M, w = W - 2 * M, dark = false } = {}) => {
    slide.addText(s.title, { ...head, x, y: 0.42, w, h: 0.85, fontSize: sizeFor(s.title, 30, [[50, 26], [80, 22]]), bold: true, color: dark ? 'FFFFFF' : t.dark, valign: 'bottom', fit: 'shrink' });
    slide.addShape(pptx.ShapeType.rect, { x, y: 1.36, w: 0.95, h: 0.07, fill: { color: t.accent }, line: { color: t.accent } });
    if (s.subtitle) slide.addText(s.subtitle, { ...body, x, y: 1.5, w, h: 0.5, fontSize: 15, color: dark ? 'CBD5E1' : t.muted, fit: 'shrink' });
    return s.subtitle ? 2.15 : 1.75;
  };

  const bulletList = (slide, items, { x, y, w, h, fontSize = 18, color = t.text, marker = t.accent }) => {
    if (!items.length) return;
    const rows = items.map(text => ({ text, options: { bullet: { code: '25A0', indent: 22 }, paraSpaceAfter: 10, color } }));
    slide.addText(rows, { ...body, x, y, w, h, fontSize, color, valign: 'top', fit: 'shrink', lineSpacingMultiple: 1.1 });
    void marker;
  };

  for (const [index, s] of spec.slides.entries()) {
    const slide = pptx.addSlide();
    if (s.notes) slide.addNotes(s.notes);

    switch (s.layout) {
      case 'title': {
        slide.background = { color: t.dark };
        slide.addShape(pptx.ShapeType.ellipse, { x: W - 5.2, y: -1.6, w: 7, h: 7, fill: { color: t.primary, transparency: 35 }, line: { color: t.primary, transparency: 100 } });
        slide.addShape(pptx.ShapeType.ellipse, { x: W - 3.2, y: 3.9, w: 4.6, h: 4.6, fill: { color: t.accent, transparency: 55 }, line: { color: t.accent, transparency: 100 } });
        slide.addShape(pptx.ShapeType.rect, { x: M, y: 2.2, w: 0.12, h: 2.4, fill: { color: t.accent }, line: { color: t.accent } });
        slide.addText(s.title || spec.title, { ...head, x: M + 0.4, y: 2.05, w: 8.4, h: 1.9, fontSize: sizeFor(s.title, 44, [[40, 38], [70, 32]]), bold: true, color: 'FFFFFF', valign: 'bottom', fit: 'shrink' });
        if (s.subtitle || spec.subtitle) slide.addText(s.subtitle || spec.subtitle, { ...body, x: M + 0.4, y: 4.0, w: 8.4, h: 0.9, fontSize: 20, color: 'CBD5E1', valign: 'top', fit: 'shrink' });
        const by = [spec.author, new Intl.DateTimeFormat(L.locale, { month: 'long', year: 'numeric' }).format(new Date())].filter(Boolean).join('  ·  ');
        slide.addText(by, { ...body, x: M + 0.4, y: H - 1.2, w: 8, h: 0.4, fontSize: 13, color: t.accent, bold: true });
        break;
      }
      case 'section': {
        sectionIndex += 1;
        slide.background = { color: t.primary };
        slide.addText(String(sectionIndex).padStart(2, '0'), { ...head, x: M, y: 1.2, w: 4, h: 2, fontSize: 120, bold: true, color: 'FFFFFF', transparency: 70 });
        slide.addText(s.title, { ...head, x: M, y: 3.3, w: W - 2 * M, h: 1.2, fontSize: sizeFor(s.title, 40, [[50, 32]]), bold: true, color: 'FFFFFF', fit: 'shrink' });
        if (s.subtitle) slide.addText(s.subtitle, { ...body, x: M, y: 4.5, w: W - 2 * M, h: 0.8, fontSize: 18, color: tint(t.primary, 0.7) });
        slide.addShape(pptx.ShapeType.rect, { x: M, y: 3.15, w: 1.2, h: 0.08, fill: { color: t.accent }, line: { color: t.accent } });
        footer(slide, index, true);
        break;
      }
      case 'two-column': {
        const top = titleBlock(slide, s);
        const colW = (W - 2 * M - 0.4) / 2;
        const longest = Math.max(s.left.length, s.right.length, 1);
        const cardH = Math.min(H - top - 0.85, 1.35 + longest * 0.62);
        [[s.leftTitle, s.left, M, t.primary], [s.rightTitle, s.right, M + colW + 0.4, t.accent]].forEach(([title, items, x, color]) => {
          slide.addShape(pptx.ShapeType.roundRect, { x, y: top, w: colW, h: cardH, fill: { color: tint(color, 0.92) }, line: { color: tint(color, 0.75), width: 1 }, rectRadius: 0.12 });
          slide.addShape(pptx.ShapeType.rect, { x, y: top, w: colW, h: 0.09, fill: { color }, line: { color } });
          if (title) slide.addText(title, { ...head, x: x + 0.3, y: top + 0.25, w: colW - 0.6, h: 0.55, fontSize: 20, bold: true, color });
          bulletList(slide, items, { x: x + 0.3, y: top + (title ? 0.9 : 0.35), w: colW - 0.6, h: cardH - (title ? 1.05 : 0.5), fontSize: 18 });
        });
        footer(slide, index);
        break;
      }
      case 'stats': {
        const top = titleBlock(slide, s);
        const stats = s.stats.length ? s.stats : s.bullets.slice(0, 4).map(b => ({ value: '•', label: b }));
        const n = Math.max(1, stats.length);
        const gap = 0.35;
        const cardW = (W - 2 * M - gap * (n - 1)) / n;
        stats.forEach((st, i) => {
          const x = M + i * (cardW + gap);
          const y = top + 0.4;
          slide.addShape(pptx.ShapeType.roundRect, { x, y, w: cardW, h: 3.2, fill: { color: i % 2 ? tint(t.accent, 0.9) : tint(t.primary, 0.92) }, line: { color: 'FFFFFF', width: 0 }, rectRadius: 0.15 });
          slide.addText(st.value, { ...head, x: x + 0.2, y: y + 0.45, w: cardW - 0.4, h: 1.4, fontSize: sizeFor(st.value, 48, [[6, 40], [10, 30]]), bold: true, color: i % 2 ? t.accent : t.primary, align: 'center', valign: 'middle', fit: 'shrink' });
          slide.addText(st.label, { ...body, x: x + 0.25, y: y + 1.9, w: cardW - 0.5, h: 1.1, fontSize: 15, color: t.text, align: 'center', valign: 'top', fit: 'shrink' });
        });
        if (s.bullets.length && s.stats.length) slide.addText(s.bullets.join('   ·   '), { ...body, x: M, y: H - 1.25, w: W - 2 * M, h: 0.5, fontSize: 13, color: t.muted, align: 'center' });
        footer(slide, index);
        break;
      }
      case 'timeline': {
        const top = titleBlock(slide, s);
        const steps = s.steps.length ? s.steps : s.bullets.slice(0, 6).map((b, i) => ({ title: `Etapa ${i + 1}`, text: b }));
        const n = Math.max(1, steps.length);
        const span = W - 2 * M;
        const lineY = top + 1.0;
        slide.addShape(pptx.ShapeType.rect, { x: M + 0.3, y: lineY - 0.02, w: span - 0.6, h: 0.05, fill: { color: tint(t.primary, 0.6) }, line: { color: tint(t.primary, 0.6) } });
        steps.forEach((st, i) => {
          const cx = M + (span / n) * (i + 0.5);
          slide.addShape(pptx.ShapeType.ellipse, { x: cx - 0.32, y: lineY - 0.32, w: 0.64, h: 0.64, fill: { color: i % 2 ? t.accent : t.primary }, line: { color: 'FFFFFF', width: 3 } });
          slide.addText(String(i + 1), { ...head, x: cx - 0.32, y: lineY - 0.32, w: 0.64, h: 0.64, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
          slide.addText(st.title, { ...head, x: cx - span / n / 2 + 0.08, y: lineY + 0.55, w: span / n - 0.16, h: 0.6, fontSize: 16, bold: true, color: t.dark, align: 'center', fit: 'shrink' });
          slide.addText(st.text, { ...body, x: cx - span / n / 2 + 0.08, y: lineY + 1.15, w: span / n - 0.16, h: 2.2, fontSize: 15, color: t.muted, align: 'center', valign: 'top', fit: 'shrink' });
        });
        footer(slide, index);
        break;
      }
      case 'table': {
        const top = titleBlock(slide, s);
        const headers = s.headers.length ? s.headers : (s.rows[0] || []);
        const rows = s.headers.length ? s.rows : s.rows.slice(1);
        const cols = Math.max(1, headers.length);
        const tableRows = [
          headers.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: t.primary }, fontFace: t.headFont } })),
          ...rows.map((r, i) => Array.from({ length: cols }, (_, c) => ({ text: r[c] ?? '', options: { fill: { color: i % 2 ? tint(t.primary, 0.94) : 'FFFFFF' } } })))
        ];
        slide.addTable(tableRows, { x: M, y: top + 0.1, w: W - 2 * M, colW: Array(cols).fill((W - 2 * M) / cols), fontFace: t.bodyFont, fontSize: rows.length > 6 ? 13 : 16, rowH: rows.length > 6 ? 0.42 : 0.55, color: t.text, border: { type: 'solid', pt: 0.75, color: tint(t.primary, 0.8) }, valign: 'middle', margin: 0.08, autoPage: false });
        footer(slide, index);
        break;
      }
      case 'quote': {
        slide.background = { color: tint(t.primary, 0.94) };
        slide.addText('“', { ...head, x: M, y: 0.3, w: 2, h: 2, fontSize: 160, color: t.accent, bold: true });
        slide.addText(s.quote || s.title, { ...head, x: M + 0.6, y: 1.9, w: W - 2 * M - 1.2, h: 3.2, fontSize: sizeFor(s.quote, 30, [[160, 26], [260, 22]]), italic: true, color: t.dark, valign: 'middle', fit: 'shrink' });
        if (s.author) slide.addText(`— ${s.author}`, { ...body, x: M + 0.6, y: 5.3, w: W - 2 * M - 1.2, h: 0.5, fontSize: 16, bold: true, color: t.primary });
        footer(slide, index);
        break;
      }
      case 'image': {
        let image = null;
        if (s.imagePrompt && imagesLeft > 0 && typeof resolveImage === 'function') {
          imagesLeft -= 1;
          try { image = await resolveImage(s.imagePrompt); } catch { image = null; }
        }
        const imgW = 5.9;
        if (image) {
          slide.addImage({ data: `data:${image.mimeType};base64,${image.bytes.toString('base64')}`, x: 0, y: 0, w: imgW, h: H, sizing: { type: 'cover', w: imgW, h: H } });
        } else {
          slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: imgW, h: H, fill: { color: t.primary }, line: { color: t.primary } });
          slide.addShape(pptx.ShapeType.ellipse, { x: 1.2, y: 1.8, w: 3.6, h: 3.6, fill: { color: t.accent, transparency: 40 }, line: { color: t.accent, transparency: 100 } });
        }
        slide.addShape(pptx.ShapeType.rect, { x: imgW, y: 0, w: 0.1, h: H, fill: { color: t.accent }, line: { color: t.accent } });
        titleBlock(slide, s, { x: imgW + 0.6, w: W - imgW - 1.2 });
        bulletList(slide, s.bullets, { x: imgW + 0.6, y: s.subtitle ? 2.3 : 1.9, w: W - imgW - 1.2, h: 4.3, fontSize: 17 });
        break;
      }
      case 'closing': {
        slide.background = { color: t.dark };
        slide.addShape(pptx.ShapeType.ellipse, { x: -2, y: 3.4, w: 6, h: 6, fill: { color: t.primary, transparency: 40 }, line: { color: t.primary, transparency: 100 } });
        slide.addText(s.title || L.thanks, { ...head, x: M, y: 1.8, w: W - 2 * M, h: 1.4, fontSize: 48, bold: true, color: 'FFFFFF', align: 'center', fit: 'shrink' });
        slide.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.6, y: 3.25, w: 1.2, h: 0.08, fill: { color: t.accent }, line: { color: t.accent } });
        if (s.subtitle) slide.addText(s.subtitle, { ...body, x: M + 1, y: 3.5, w: W - 2 * M - 2, h: 0.9, fontSize: 20, color: 'CBD5E1', align: 'center', fit: 'shrink' });
        if (s.bullets.length) slide.addText(s.bullets.join('\n'), { ...body, x: M + 2, y: 4.5, w: W - 2 * M - 4, h: 1.6, fontSize: 15, color: 'E2E8F0', align: 'center', valign: 'top', fit: 'shrink' });
        break;
      }
      default: { // bullets
        const top = titleBlock(slide, s);
        const items = s.bullets.length ? s.bullets : [s.subtitle].filter(Boolean);
        const twoCols = items.length > 5;
        const colW = twoCols ? (W - 2 * M - 0.5) / 2 : W - 2 * M;
        const perCol = twoCols ? Math.ceil(items.length / 2) : items.length;
        const rowH = Math.min(items.length <= 4 ? 1.15 : 1.0, (H - top - 0.9) / Math.max(1, perCol));
        items.forEach((text, i) => {
          const col = twoCols && i >= perCol ? 1 : 0;
          const row = col ? i - perCol : i;
          const x = M + col * (colW + 0.5);
          const y = top + 0.1 + row * rowH;
          slide.addShape(pptx.ShapeType.roundRect, { x, y: y + 0.08, w: 0.46, h: 0.46, fill: { color: i % 2 ? t.accent : t.primary }, line: { color: 'FFFFFF', width: 0 }, rectRadius: 0.1 });
          slide.addText(String(i + 1), { ...head, x, y: y + 0.08, w: 0.46, h: 0.46, fontSize: 14, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' });
          slide.addText(text, { ...body, x: x + 0.65, y, w: colW - 0.7, h: rowH - 0.05, fontSize: sizeFor(text, twoCols ? 16 : (items.length <= 4 ? 22 : 20), [[90, twoCols ? 14 : 17], [160, 14]]), valign: 'top', fit: 'shrink' });
        });
        footer(slide, index);
      }
    }
  }

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return { buffer: Buffer.from(buffer), summary: `${total} ${total === 1 ? 'slide' : 'slides'}` };
}
