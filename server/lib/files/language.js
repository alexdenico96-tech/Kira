// KIRA_FILES_LANG_V1 — o arquivo sai no idioma em que o pedido foi feito.
// Detecção determinística (palavras e acentos típicos) para não depender do "bom senso" do modelo.

const WORDS = {
  pt: ['você', 'voce', 'não', 'nao', 'uma', 'um', 'para', 'com', 'sobre', 'crie', 'faça', 'faca', 'gere', 'quero', 'preciso', 'apresentação', 'apresentacao', 'planilha', 'também', 'tambem', 'então', 'entao', 'isso', 'esse', 'essa', 'meu', 'minha', 'são', 'sao', 'está', 'esta', 'pelo', 'pela', 'dos', 'das', 'muito', 'mais', 'fazer', 'arquivo', 'seções', 'páginas', 'ção', 'ções'],
  es: ['usted', 'tú', 'una', 'un', 'para', 'con', 'sobre', 'crea', 'haz', 'genera', 'quiero', 'necesito', 'presentación', 'presentacion', 'hoja', 'cálculo', 'calculo', 'también', 'tambien', 'entonces', 'esto', 'ese', 'esa', 'mi', 'son', 'está', 'del', 'los', 'las', 'muy', 'más', 'hacer', 'archivo', 'secciones', 'páginas', 'por favor', 'y', 'el', 'que', 'ción', 'ciones', 'diapositivas'],
  en: ['you', 'the', 'a', 'an', 'for', 'with', 'about', 'create', 'make', 'generate', 'want', 'need', 'presentation', 'spreadsheet', 'also', 'then', 'this', 'that', 'my', 'are', 'is', 'of', 'and', 'very', 'more', 'file', 'sections', 'pages', 'please', 'slides', 'report']
};

export function detectLanguage(text = '', fallback = 'pt') {
  const t = ` ${String(text).toLowerCase()} `;
  const score = { pt: 0, es: 0, en: 0 };
  if (/[ãõ]|ç[ãõa]|ção|ções/.test(t)) score.pt += 4;
  if (/[ñ¿¡]|ción\b|ciones\b/.test(t)) score.es += 4;
  for (const [lang, words] of Object.entries(WORDS)) {
    for (const w of words) {
      const re = w.length <= 4 && !/[^a-z]/.test(w) ? new RegExp(`\\b${w}\\b`, 'g') : new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      score[lang] += (t.match(re) || []).length;
    }
  }
  // Palavras iguais em pt/es ("para", "com/con") empatam; o desempate vem dos marcadores fortes acima.
  const best = Object.entries(score).sort((a, b) => b[1] - a[1]);
  return best[0][1] >= 2 && best[0][1] > best[1][1] ? best[0][0] : fallback;
}

export const LANG = {
  pt: { code: 'pt', name: 'português do Brasil', locale: 'pt-BR', thanks: 'Obrigado!', total: 'Total', sheet: 'Planilha', column: 'Coluna', document: 'Documento', continued: '(cont.)', csvSep: ';', decimal: ',', dateFmt: 'dd/mm/yyyy', defaultCurrency: 'BRL' },
  es: { code: 'es', name: 'español', locale: 'es-ES', thanks: '¡Gracias!', total: 'Total', sheet: 'Hoja', column: 'Columna', document: 'Documento', continued: '(cont.)', csvSep: ';', decimal: ',', dateFmt: 'dd/mm/yyyy', defaultCurrency: 'EUR' },
  en: { code: 'en', name: 'English', locale: 'en-US', thanks: 'Thank you!', total: 'Total', sheet: 'Sheet', column: 'Column', document: 'Document', continued: '(cont.)', csvSep: ',', decimal: '.', dateFmt: 'mm/dd/yyyy', defaultCurrency: 'USD' }
};

export const langOf = code => LANG[code] || LANG.pt;

export const CURRENCIES = { BRL: '"R$" #,##0.00', USD: '"US$" #,##0.00', EUR: '#,##0.00 "€"', MXN: '"MX$" #,##0.00', ARS: '"AR$" #,##0.00', COP: '"COL$" #,##0', CLP: '"CLP$" #,##0', PEN: '"S/" #,##0.00', UYU: '"$U" #,##0.00', GBP: '"£" #,##0.00' };

// Moeda citada no pedido; senão, a padrão do idioma (ex.: pedido em português → R$).
export function detectCurrency(text = '', lang = 'pt') {
  const t = String(text);
  if (/R\$|reais?\b|real brasileiro/i.test(t)) return 'BRL';
  if (/US\$|USD|d[oó]lar(?:es)?(?! canadense)|dollars?/i.test(t)) return 'USD';
  if (/€|EUR\b|euros?\b/i.test(t)) return 'EUR';
  if (/MXN|pesos? mexicanos?/i.test(t)) return 'MXN';
  if (/ARS|pesos? argentinos?/i.test(t)) return 'ARS';
  if (/COP|pesos? colombianos?/i.test(t)) return 'COP';
  if (/CLP|pesos? chilenos?/i.test(t)) return 'CLP';
  if (/\bS\/|soles?\b|PEN\b/i.test(t)) return 'PEN';
  if (/£|GBP|libras?/i.test(t)) return 'GBP';
  return langOf(lang).defaultCurrency;
}

// Confere se o conteúdo gerado está no idioma pedido (amostra dos textos do arquivo).
export function specLanguage(spec) {
  const sample = [spec.title, spec.subtitle,
    ...spec.blocks.slice(0, 30).flatMap(b => [b.text, ...b.items.slice(0, 5)]),
    ...spec.slides.slice(0, 15).flatMap(s => [s.title, s.subtitle, ...s.bullets, s.notes]),
    ...spec.sheets.slice(0, 3).flatMap(s => [s.name, s.description, ...s.columns.map(c => c.header), ...s.rows.slice(0, 10).flat()])
  ].filter(Boolean).join(' ').slice(0, 6000);
  return detectLanguage(sample, null);
}
