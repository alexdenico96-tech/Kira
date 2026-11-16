// Temas visuais compartilhados por PDF, Word, Excel e PowerPoint (cores em hex sem #).
export const THEMES = {
  corporativo: { name: 'Corporativo', primary: '1E3A8A', accent: '3B82F6', dark: '0F172A', text: '1E293B', muted: '64748B', light: 'F1F5F9', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Calibri', bodyFont: 'Calibri', darkSlides: false },
  executivo: { name: 'Executivo', primary: '0B1020', accent: 'F59E0B', dark: '0B1020', text: '1F2937', muted: '6B7280', light: 'F5F3EE', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Georgia', bodyFont: 'Calibri', darkSlides: true },
  moderno: { name: 'Moderno', primary: '6D28D9', accent: '14B8A6', dark: '1E1B4B', text: '1F2937', muted: '6B7280', light: 'F5F3FF', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Segoe UI', bodyFont: 'Segoe UI', darkSlides: false },
  natureza: { name: 'Natureza', primary: '166534', accent: '84CC16', dark: '14281D', text: '1C2A22', muted: '5F6F65', light: 'F0FDF4', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Georgia', bodyFont: 'Calibri', darkSlides: false },
  criativo: { name: 'Criativo', primary: 'E11D48', accent: 'F59E0B', dark: '3B0A1E', text: '2A1B22', muted: '7C6A72', light: 'FFF1F2', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Trebuchet MS', bodyFont: 'Calibri', darkSlides: false },
  minimalista: { name: 'Minimalista', primary: '111827', accent: 'DC2626', dark: '111827', text: '111827', muted: '6B7280', light: 'F3F4F6', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Calibri Light', bodyFont: 'Calibri', darkSlides: false },
  oceano: { name: 'Oceano', primary: '0E7490', accent: 'F97316', dark: '083344', text: '0F2A33', muted: '5B7380', light: 'ECFEFF', surface: 'FFFFFF', bg: 'FFFFFF', headFont: 'Segoe UI', bodyFont: 'Segoe UI', darkSlides: true }
};

export const THEME_NAMES = Object.keys(THEMES);
export const themeOf = name => THEMES[String(name || '').toLowerCase()] || THEMES.corporativo;
export const hex = c => `#${c}`;

// Tons claros derivados da cor principal (para faixas zebradas, fundos de destaque).
export function tint(color, amount = 0.88) {
  const n = parseInt(color, 16);
  const mix = v => Math.round(v + (255 - v) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
