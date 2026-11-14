// KIRA_DESIGN_DIRECTION_V1
// Camada determinística que transforma o pedido do usuário em uma direção visual concreta
// (paleta, tipografia, raio, sombras, seções e imagens) antes de chamar o modelo.
// Sem isso o modelo cai em "tema genérico" (gradiente roxo, Inter, cards iguais).

const DOMAINS = [
  {
    id: 'automotivo',
    test: /\b(carros?|ve[ií]culos?|concession[aá]ria|automotiv\w*|seminovos?|oficina|mec[aâ]nica|motos?)\b/i,
    mood: 'premium automotivo, confiante, alto contraste',
    palette: { bg: '#0b0d10', surface: '#151a21', text: '#f3f5f7', muted: '#9aa4b2', primary: '#e63946', accent: '#f1c40f' },
    fonts: { display: 'Barlow Condensed', body: 'Inter' },
    radius: '10px',
    sections: ['header fixo com logo e CTA', 'hero com foto grande do veículo destaque e busca rápida', 'filtros (marca, preço, ano)', 'grid de veículos com foto, preço, km, ano e câmbio', 'diferenciais (financiamento, garantia, troca)', 'depoimentos', 'contato com mapa/WhatsApp', 'footer'],
    imagery: 'professional automotive photography, studio or urban setting, glossy reflections'
  },
  {
    id: 'restaurante',
    test: /\b(restaurante|pizzaria|hamburgueria|lanchonete|bistr[oô]|card[aá]pio|menu|sushi|churrascaria|gastronomia|delivery de comida)\b/i,
    mood: 'acolhedor, apetitoso, editorial gastronômico',
    palette: { bg: '#fbf7f2', surface: '#ffffff', text: '#2b1d14', muted: '#7a6a5d', primary: '#c2410c', accent: '#3f6212' },
    fonts: { display: 'Playfair Display', body: 'DM Sans' },
    radius: '14px',
    sections: ['header com reservas', 'hero com foto do prato principal', 'sobre a casa', 'cardápio por categorias com preços', 'galeria', 'horários e localização', 'reserva/pedido', 'footer'],
    imagery: 'appetizing food photography, natural window light, shallow depth of field, rustic table'
  },
  {
    id: 'cafe',
    test: /\b(caf[eé]|cafeteria|padaria|confeitaria|doceria|bolos?|brigadeiros?)\b/i,
    mood: 'aconchegante, artesanal, quente',
    palette: { bg: '#f6f0e8', surface: '#fffaf3', text: '#3b2a20', muted: '#8a7565', primary: '#8b5e3c', accent: '#d4a373' },
    fonts: { display: 'Fraunces', body: 'Nunito Sans' },
    radius: '18px',
    sections: ['header', 'hero com foto do produto', 'produtos em destaque', 'história/artesanal', 'cardápio', 'depoimentos', 'localização', 'footer'],
    imagery: 'cozy cafe photography, warm tones, latte art, pastries, soft morning light'
  },
  {
    id: 'saude',
    test: /\b(cl[ií]nica|m[eé]dic[oa]|sa[uú]de|odonto\w*|dentista|psic[oó]log\w*|fisioterap\w*|nutricionista|hospital|consult[oó]rio)\b/i,
    mood: 'confiável, calmo, limpo, humano',
    palette: { bg: '#f7fbfc', surface: '#ffffff', text: '#0f2a3a', muted: '#5b7283', primary: '#0e7490', accent: '#22c55e' },
    fonts: { display: 'Plus Jakarta Sans', body: 'Inter' },
    radius: '16px',
    sections: ['header com agendamento', 'hero com profissional e CTA de agendamento', 'especialidades', 'equipe', 'convênios', 'depoimentos', 'FAQ', 'contato', 'footer'],
    imagery: 'bright modern clinic photography, friendly healthcare professional, soft natural light'
  },
  {
    id: 'juridico',
    test: /\b(advocacia|advogad[oa]s?|escrit[oó]rio de advocacia|jur[ií]dic\w*|contabilidade|contador|consultoria)\b/i,
    mood: 'sóbrio, autoritativo, elegante',
    palette: { bg: '#f8f7f4', surface: '#ffffff', text: '#1c1f26', muted: '#646a75', primary: '#1e3a5f', accent: '#b08d57' },
    fonts: { display: 'Cormorant Garamond', body: 'Source Sans 3' },
    radius: '6px',
    sections: ['header', 'hero institucional', 'áreas de atuação', 'sobre/equipe', 'números/resultados', 'depoimentos', 'contato', 'footer'],
    imagery: 'elegant law office photography, books, wood, professional portraits, muted tones'
  },
  {
    id: 'fitness',
    test: /\b(academia|fitness|crossfit|personal trainer|treino|muscula[cç][aã]o|pilates|yoga|esporte)\b/i,
    mood: 'energético, ousado, motivacional',
    palette: { bg: '#0a0a0a', surface: '#161616', text: '#fafafa', muted: '#a3a3a3', primary: '#a3e635', accent: '#f97316' },
    fonts: { display: 'Anton', body: 'Manrope' },
    radius: '8px',
    sections: ['header', 'hero com foto de treino e CTA', 'modalidades', 'planos e preços', 'estrutura', 'professores', 'resultados/depoimentos', 'contato', 'footer'],
    imagery: 'dramatic gym photography, athletes training, high contrast, moody lighting'
  },
  {
    id: 'imobiliaria',
    test: /\b(imobili[aá]ria|im[oó]veis|im[oó]vel|apartamentos?|casas? (?:à|a) venda|corretor|aluguel)\b/i,
    mood: 'sofisticado, espaçoso, confiável',
    palette: { bg: '#f9fafb', surface: '#ffffff', text: '#111827', muted: '#6b7280', primary: '#0f766e', accent: '#d97706' },
    fonts: { display: 'Outfit', body: 'Inter' },
    radius: '14px',
    sections: ['header', 'hero com busca de imóveis', 'imóveis em destaque com foto, preço, quartos e m²', 'bairros', 'como funciona', 'depoimentos', 'contato', 'footer'],
    imagery: 'architectural real estate photography, bright interiors, wide angle, golden hour exteriors'
  },
  {
    id: 'moda',
    test: /\b(moda|roupas?|boutique|loja de roupas|vestu[aá]rio|cal[cç]ados|t[eê]nis|acess[oó]rios|joias?|semijoias)\b/i,
    mood: 'editorial de moda, minimalista, refinado',
    palette: { bg: '#ffffff', surface: '#f5f5f4', text: '#111111', muted: '#71717a', primary: '#111111', accent: '#be123c' },
    fonts: { display: 'Bodoni Moda', body: 'Jost' },
    radius: '2px',
    sections: ['barra de anúncio', 'header com busca e carrinho', 'hero editorial', 'categorias', 'grid de produtos com preço e botão', 'lookbook', 'newsletter', 'footer'],
    imagery: 'fashion editorial photography, clean studio background, model, soft diffused light'
  },
  {
    id: 'beleza',
    test: /\b(sal[aã]o|barbearia|est[eé]tica|beleza|manicure|cabeleireir\w*|spa|maquiagem|cosm[eé]ticos?)\b/i,
    mood: 'delicado, premium, sensorial',
    palette: { bg: '#fdf8f6', surface: '#ffffff', text: '#2d1f24', muted: '#8c7179', primary: '#9d4b63', accent: '#c9a96e' },
    fonts: { display: 'Marcellus', body: 'Lato' },
    radius: '20px',
    sections: ['header com agendamento', 'hero', 'serviços com preços', 'antes e depois/galeria', 'equipe', 'depoimentos', 'agendamento', 'footer'],
    imagery: 'beauty salon photography, soft pastel light, elegant interior, close-up details'
  },
  {
    id: 'saas',
    test: /\b(saas|startup|software|plataforma|dashboard|painel|analytics|crm|fintech|ia\b|intelig[eê]ncia artificial|tecnologia|tech)\b/i,
    mood: 'moderno, preciso, produto digital',
    palette: { bg: '#0b1020', surface: '#121a2f', text: '#e6e9f2', muted: '#8b93a7', primary: '#4f7cff', accent: '#2dd4bf' },
    fonts: { display: 'Space Grotesk', body: 'Inter' },
    radius: '12px',
    sections: ['header', 'hero com headline de valor e mockup do produto', 'logos de clientes', 'features com ícones', 'como funciona', 'planos', 'depoimentos', 'FAQ', 'CTA final', 'footer'],
    imagery: 'clean product UI screenshots, abstract tech gradients, people collaborating in modern office'
  },
  {
    id: 'portfolio',
    test: /\b(portf[oó]lio|curr[ií]culo|cv|freelancer|designer|fot[oó]grafo|desenvolvedor pessoal|p[aá]gina pessoal)\b/i,
    mood: 'autoral, minimalista, tipografia forte',
    palette: { bg: '#fafaf9', surface: '#ffffff', text: '#18181b', muted: '#71717a', primary: '#18181b', accent: '#ea580c' },
    fonts: { display: 'Syne', body: 'Inter' },
    radius: '10px',
    sections: ['header minimal', 'hero com nome e proposta', 'projetos selecionados com imagem', 'sobre', 'habilidades/serviços', 'contato', 'footer'],
    imagery: 'creative workspace photography, project mockups, minimal composition'
  },
  {
    id: 'educacao',
    test: /\b(escola|curso|educa[cç][aã]o|faculdade|ensino|aulas?|professor|treinamento|mentoria)\b/i,
    mood: 'amigável, claro, motivador',
    palette: { bg: '#f8fafc', surface: '#ffffff', text: '#0f172a', muted: '#64748b', primary: '#2563eb', accent: '#f59e0b' },
    fonts: { display: 'Poppins', body: 'Nunito Sans' },
    radius: '16px',
    sections: ['header', 'hero com CTA de matrícula', 'cursos', 'metodologia', 'professores', 'depoimentos', 'planos', 'FAQ', 'footer'],
    imagery: 'bright education photography, students learning, laptops, friendly atmosphere'
  },
  {
    id: 'viagem',
    test: /\b(viage(?:m|ns)|turismo|hotel|pousada|ag[eê]ncia de viagem|resort|hospedagem|passeios?)\b/i,
    mood: 'inspirador, luminoso, aspiracional',
    palette: { bg: '#f7fafc', surface: '#ffffff', text: '#0c2533', muted: '#5f7686', primary: '#0284c7', accent: '#f97316' },
    fonts: { display: 'DM Serif Display', body: 'DM Sans' },
    radius: '18px',
    sections: ['header', 'hero com foto de destino em tela cheia e busca', 'destinos/pacotes com preço', 'experiências', 'galeria', 'depoimentos', 'reserva', 'footer'],
    imagery: 'breathtaking travel photography, golden hour landscapes, turquoise water, vivid colors'
  },
  {
    id: 'games',
    test: /\b(jogos?|games?|gamer|e-?sports?|streamer|twitch)\b/i,
    mood: 'imersivo, neon, intenso',
    palette: { bg: '#07060d', surface: '#12101f', text: '#f4f2ff', muted: '#9a94b8', primary: '#a855f7', accent: '#22d3ee' },
    fonts: { display: 'Orbitron', body: 'Rajdhani' },
    radius: '6px',
    sections: ['header', 'hero com arte grande', 'destaques', 'features', 'galeria/trailer', 'comunidade', 'CTA', 'footer'],
    imagery: 'cinematic game key art, neon lighting, dramatic atmosphere'
  }
];

const DEFAULT_DOMAIN = {
  id: 'geral',
  mood: 'moderno, limpo, profissional',
  palette: { bg: '#fafafa', surface: '#ffffff', text: '#18181b', muted: '#6b7280', primary: '#2563eb', accent: '#f59e0b' },
  fonts: { display: 'Plus Jakarta Sans', body: 'Inter' },
  radius: '12px',
  sections: ['header', 'hero', 'seções de conteúdo pedidas', 'prova social quando fizer sentido', 'CTA', 'footer'],
  imagery: 'high quality editorial photography matching the subject'
};

// Estilos explícitos sobrescrevem partes do preset do domínio.
const STYLES = [
  { id: 'dark', test: /\b(dark|escur[oa]|modo escuro|preto|black)\b/i, apply: d => ({ ...d, palette: darken(d.palette) }) },
  { id: 'light', test: /\b(claro|light|branco|clean)\b/i, apply: d => ({ ...d, palette: lighten(d.palette) }) },
  { id: 'minimal', test: /\b(minimalista|minimal|simples e elegante|clean)\b/i, apply: d => ({ ...d, mood: `${d.mood}; minimalista: muito espaço em branco, poucas cores, sem sombras pesadas` }) },
  { id: 'luxo', test: /\b(luxo|luxuos[oa]|premium|sofisticad[oa]|elegante|high.?end)\b/i, apply: d => ({ ...d, mood: `${d.mood}; luxo: serifas elegantes, dourado discreto, espaçamento generoso`, fonts: { display: 'Cormorant Garamond', body: d.fonts.body }, palette: { ...d.palette, accent: '#c9a227' } }) },
  { id: 'futurista', test: /\b(futurista|neon|cyberpunk|sci-?fi|tecnol[oó]gico)\b/i, apply: d => ({ ...d, mood: `${d.mood}; futurista: brilhos neon sutis, grid técnico, bordas finas luminosas`, fonts: { display: 'Space Grotesk', body: d.fonts.body }, palette: darken({ ...d.palette, primary: '#22d3ee', accent: '#a855f7' }) }) },
  { id: 'retro', test: /\b(retr[oô]|vintage|anos ?(?:70|80|90))\b/i, apply: d => ({ ...d, mood: `${d.mood}; retrô: texturas, cores quentes saturadas, tipografia display marcante`, fonts: { display: 'Righteous', body: d.fonts.body } }) },
  { id: 'brutalista', test: /\b(brutalist\w*|neo-?brutal\w*)\b/i, apply: d => ({ ...d, mood: `${d.mood}; neo-brutalista: bordas pretas 2-3px, sombras sólidas deslocadas, cores chapadas`, radius: '0px' }) },
  { id: 'glass', test: /\b(glass\w*|vidro|fosco|frosted)\b/i, apply: d => ({ ...d, mood: `${d.mood}; glassmorphism: superfícies translúcidas com backdrop-filter: blur, bordas 1px rgba claras` }) },
  { id: 'colorido', test: /\b(colorid[oa]|vibrante|alegre|divertid[oa]|infantil)\b/i, apply: d => ({ ...d, mood: `${d.mood}; vibrante: cores saturadas, formas arredondadas, ilustrações`, radius: '22px' }) }
];

const COLOR_NAMES = {
  azul: '#2563eb', 'azul marinho': '#1e3a8a', 'azul claro': '#38bdf8', vermelho: '#dc2626', verde: '#16a34a',
  'verde escuro': '#14532d', amarelo: '#facc15', laranja: '#f97316', roxo: '#7c3aed', 'lilás': '#a78bfa', lilas: '#a78bfa',
  rosa: '#ec4899', dourado: '#c9a227', ouro: '#c9a227', prata: '#a8a29e', preto: '#0a0a0a', branco: '#ffffff',
  cinza: '#6b7280', marrom: '#7c4a2d', bege: '#e7dcc8', vinho: '#7f1d1d', turquesa: '#14b8a6', ciano: '#06b6d4',
  blue: '#2563eb', red: '#dc2626', green: '#16a34a', yellow: '#facc15', orange: '#f97316', purple: '#7c3aed',
  pink: '#ec4899', gold: '#c9a227', black: '#0a0a0a', white: '#ffffff', gray: '#6b7280', grey: '#6b7280'
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex) {
  if (!/^#(?:[0-9a-f]{3}){1,2}$/i.test(String(hex || ''))) return null;
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function darken(p) {
  if ((luminance(p.bg) ?? 1) < 0.1) return p;
  return { ...p, bg: '#0b0d12', surface: '#151922', text: '#f1f3f7', muted: '#9aa3b2' };
}
function lighten(p) {
  if ((luminance(p.bg) ?? 0) > 0.5) return p;
  return { ...p, bg: '#fafafa', surface: '#ffffff', text: '#18181b', muted: '#6b7280' };
}

// Cores pedidas explicitamente: "#ff6600", "azul e dourado", "cores verde e preto".
export function extractRequestedColors(message = '') {
  const text = String(message).toLowerCase();
  const hex = [...text.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(m => m[0]);
  const named = [];
  // Só considera nomes de cor logo após palavras de contexto ("cores azul e dourado",
  // "paleta verde", "em tons de vinho"), para não confundir "carro vermelho" com paleta.
  const windows = [...text.matchAll(/\b(?:cor(?:es)?|colors?|paleta|tons? de|tema|predomin\w*)\b([^.;\n]{0,60})/gi)].map(m => m[1]);
  if (windows.length) {
    const names = Object.keys(COLOR_NAMES).sort((a, b) => b.length - a.length);
    let rest = windows.join(' | ');
    for (const name of names) {
      const re = new RegExp(`\\b${name}\\b`, 'i');
      const found = re.exec(rest);
      if (found) {
        named.push({ name, hex: COLOR_NAMES[name], at: found.index });
        rest = rest.slice(0, found.index) + ' '.repeat(found[0].length) + rest.slice(found.index + found[0].length);
      }
    }
    // Ordem em que o usuário citou: a primeira cor vira --primary, a segunda --accent.
    named.sort((a, b) => a.at - b.at).forEach(item => delete item.at);
  }
  return { hex: [...new Set(hex)], named };
}

// Referências de marcas: inspiração de estilo, nunca cópia de logo/marca.
function extractReferences(message = '') {
  const refs = [];
  const re = /\b(?:estilo|parecid[oa] com|igual (?:a|ao|à)|inspirad[oa] (?:no|na|em)|tipo (?:o|a)?|como (?:o|a) site d[oa])\s+([A-Z][\w.&-]+(?:\s+[A-Z][\w.&-]+)?)/g;
  let match;
  while ((match = re.exec(String(message)))) refs.push(match[1]);
  return [...new Set(refs)];
}

export function detectDomain(message = '') {
  return DOMAINS.find(d => d.test.test(String(message))) || DEFAULT_DOMAIN;
}

export function buildDesignBrief(message = '') {
  const text = String(message);
  let design = { ...detectDomain(text) };
  design.palette = { ...design.palette };
  const appliedStyles = [];
  for (const style of STYLES) {
    if (style.test.test(text)) {
      design = style.apply(design);
      appliedStyles.push(style.id);
    }
  }
  const colors = extractRequestedColors(text);
  const requested = [...colors.hex, ...colors.named.map(c => c.hex)];
  if (requested[0]) design.palette = { ...design.palette, primary: requested[0] };
  if (requested[1]) design.palette = { ...design.palette, accent: requested[1] };

  // Garante legibilidade mínima do texto sobre o fundo.
  if ((contrastRatio(design.palette.text, design.palette.bg) ?? 21) < 7) {
    design.palette.text = (luminance(design.palette.bg) ?? 1) > 0.4 ? '#111111' : '#f5f5f5';
  }
  return {
    domain: design.id,
    styles: appliedStyles,
    mood: design.mood,
    palette: design.palette,
    fonts: design.fonts,
    radius: design.radius,
    sections: design.sections,
    imagery: design.imagery,
    requestedColors: colors,
    references: extractReferences(text)
  };
}

export function projectImageUrl(prompt, width = 1200, height = 800, seed = 1) {
  const encoded = encodeURIComponent(String(prompt || '').slice(0, 400));
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

function googleFontsHref(fonts) {
  const fam = [fonts.display, fonts.body]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .map(f => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
}

export function designBriefPrompt(message = '', stack = 'vanilla-web') {
  const b = buildDesignBrief(message);
  const p = b.palette;
  const userColors = [...b.requestedColors.hex, ...b.requestedColors.named.map(c => `${c.name} (${c.hex})`)];
  const sampleImg = projectImageUrl(`${b.imagery}, <descreva a cena exata em inglês>`, 1200, 800, 7);
  const styleTarget = stack === 'vanilla-web' || stack === 'auto'
    ? 'style.css'
    : 'o CSS global do projeto (ex.: src/index.css ou src/styles.css) importado no entrypoint';

  return `
DIREÇÃO VISUAL (siga com fidelidade — o usuário vai julgar o resultado pela aparência):
- Segmento detectado: ${b.domain}. Clima: ${b.mood}.
${b.styles.length ? `- Estilos pedidos pelo usuário: ${b.styles.join(', ')}. Eles têm prioridade sobre o preset.\n` : ''}${userColors.length ? `- CORES PEDIDAS PELO USUÁRIO (obrigatórias, usar como cor primária/destaque): ${userColors.join(', ')}.\n` : ''}${b.references.length ? `- Referências citadas: ${b.references.join(', ')}. Reproduza a linguagem visual (layout, ritmo, tipografia, espaçamento), mas não copie logotipos nem marcas registradas.\n` : ''}- Se o pedido descrever algo visual específico (cor, fonte, layout, seção, quantidade de itens, ordem), isso vence qualquer item desta direção.

DESIGN TOKENS — declare em :root em ${styleTarget} e use SEMPRE via var(), nunca cores soltas:
  --bg: ${p.bg}; --surface: ${p.surface}; --text: ${p.text}; --muted: ${p.muted};
  --primary: ${p.primary}; --accent: ${p.accent};
  --radius: ${b.radius}; --shadow-sm: 0 1px 2px rgb(0 0 0 / .06), 0 1px 3px rgb(0 0 0 / .08);
  --shadow-lg: 0 10px 30px -10px rgb(0 0 0 / .25);
  --font-display: '${b.fonts.display}', system-ui, sans-serif; --font-body: '${b.fonts.body}', system-ui, sans-serif;
  --space-1: .25rem; --space-2: .5rem; --space-3: 1rem; --space-4: 1.5rem; --space-5: 2.5rem; --space-6: 4rem; --space-7: 6rem;
- Tipografia: carregue as fontes com <link href="${googleFontsHref(b.fonts)}" rel="stylesheet"> (com preconnect para fonts.googleapis.com e fonts.gstatic.com). Títulos com --font-display, texto com --font-body. Escala fluida com clamp(): h1 clamp(2.4rem, 5vw, 4.5rem), h2 clamp(1.8rem, 3.2vw, 2.8rem), corpo 1rem–1.125rem, line-height 1.6 no corpo e 1.1 nos títulos, letter-spacing levemente negativo em títulos grandes.

ESTRUTURA DE PÁGINA RECOMENDADA (adapte ao pedido, sem remover nada que o usuário pediu): ${b.sections.join(' → ')}.

REGRAS DE ACABAMENTO VISUAL:
1. Layout: container max-width 1200px centralizado com padding lateral; seções com padding vertical var(--space-6)–var(--space-7); grids com CSS Grid (repeat(auto-fit, minmax(280px, 1fr))) e gap consistente.
2. Hierarquia: um único h1 forte no hero; cada seção com eyebrow (rótulo pequeno em caixa alta), título e subtítulo em --muted; CTAs primário (fundo --primary) e secundário (contorno).
3. Componentes: cards com fundo --surface, borda 1px sutil, --radius, --shadow-sm e no hover translateY(-4px) + --shadow-lg; botões com padding .875rem 1.5rem, peso 600, transições 200ms ease; inputs com altura ≥ 44px e foco visível (outline 2px var(--primary) com offset).
4. Estados: :hover, :focus-visible e :active em TODOS os elementos clicáveis; header com fundo sólido/blur ao rolar; menu mobile funcional (hamburger) abaixo de 768px.
5. Responsividade: mobile-first com @media (min-width: 640px), (min-width: 960px); nada pode estourar horizontalmente em 375px; imagens com max-width:100%, aspect-ratio definido e object-fit: cover.
6. Imagens: NÃO invente URLs do Unsplash/Pexels (quase sempre quebram) nem caminhos locais inexistentes. Para cada imagem de conteúdo use uma URL gerada com a descrição exata da cena, em inglês, no formato:
   ${sampleImg}
   Troque o texto do prompt por uma descrição específica do item (ex.: o carro exato, o prato exato), ajuste width/height à proporção usada no layout e use um seed diferente por imagem. Sempre com alt descritivo, loading="lazy" (exceto no hero), width/height ou aspect-ratio.
7. Ícones: SVG inline simples (stroke="currentColor", 24x24) — sem emojis como ícones e sem bibliotecas de ícones não declaradas.
8. Conteúdo: textos reais e específicos do negócio em português (nomes, preços em R$, horários, endereços plausíveis); nada de lorem ipsum, "Título aqui" ou "Item 1".
9. Contraste: texto sobre fundo com contraste WCAG AA (≥ 4.5:1); texto sobre fotos sempre com overlay gradiente escuro.
10. Detalhes que elevam a qualidade: scroll-behavior: smooth, ::selection com --primary, animação de entrada discreta (IntersectionObserver ou @keyframes com prefers-reduced-motion respeitado), favicon em SVG inline via data URI.
11. Evite clichês genéricos de IA (gradiente roxo-azul em tudo, todos os cards idênticos, hero centralizado sem imagem) a menos que o usuário peça.`;
}

// Usado na edição: lembra o modelo de manter o sistema visual existente.
export function designEditGuidance(request = '') {
  const visual = /\b(cor|cores|color|fonte|font|tipografia|layout|visual|design|estilo|bonit\w*|moderno|elegante|espa[cç]amento|hero|bot[aã]o|card|responsiv\w*|anima\w*|imagem|imagens|foto|tema|dark|escuro|claro)\b/i.test(String(request));
  if (!visual) return '';
  const colors = extractRequestedColors(request);
  const wanted = [...colors.hex, ...colors.named.map(c => `${c.name} (${c.hex})`)];
  return `
REGRAS DE EDIÇÃO VISUAL:
- Preserve o sistema visual existente (variáveis CSS em :root, fontes, raio, espaçamentos). Para mudar cores/fontes, altere os TOKENS em :root em vez de espalhar valores novos pelo CSS.
- Se o projeto ainda não tiver tokens, crie-os em :root e passe a usá-los nas regras que você editar.
- Mantenha responsividade, estados :hover/:focus-visible e contraste AA em tudo que alterar.
- Imagens novas: use https://image.pollinations.ai/prompt/<descrição em inglês>?width=W&height=H&seed=N&nologo=true, com alt.
${wanted.length ? `- Cores pedidas: ${wanted.join(', ')} — aplique exatamente estas.\n` : ''}`;
}
