// Conversão de valores vindos do modelo ("R$ 1.234,56", "15%", "2026-03-01", "=B4*C4").
export function parseNumber(raw) {
  let s = String(raw ?? '').trim().replace(/[R$€£\s]/g, '').replace(/%$/, '');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');      // 1.234,56
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '');  // 1,234.56
  else if (lastComma >= 0 && lastDot < 0) s = /,\d{3}$/.test(s) && !/^0,/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseCell(raw, type) {
  const s = String(raw ?? '').trim();
  if (s.startsWith('=') && s.length > 1) return { formula: s.slice(1) };
  if (!s) return null;
  if (['number', 'integer', 'currency', 'percent'].includes(type)) {
    let n = parseNumber(s);
    if (n == null) return s;
    if (type === 'percent' && (/%$/.test(s) || Math.abs(n) > 1)) n = n / 100;
    return type === 'integer' ? Math.round(n) : n;
  }
  if (type === 'date') {
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return s;
  }
  return s;
}
