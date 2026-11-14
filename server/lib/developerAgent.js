const COMPLEX_HINT = /\b(react|vite|next|vue|angular|svelte|astro|typescript|dashboard|painel|app|aplicativo|saas|api|backend|fullstack|e-?commerce|loja|autentica|login|banco de dados|database|postgres|componentes|rotas|router)\b/i;

export function isComplexProjectRequest(message = '') {
  return COMPLEX_HINT.test(String(message)) || String(message).length > 900;
}

export function detectRequestedStack(message = '') {
  const value = String(message).toLowerCase();
  if (/\bnext(?:\.js)?\b/.test(value)) return 'next';
  if (/\bvue(?:\.js)?\b/.test(value)) return 'vue';
  if (/\bsvelte(?:kit)?\b/.test(value)) return 'svelte';
  if (/\bangular\b/.test(value)) return 'angular';
  if (/\bastro\b/.test(value)) return 'astro';
  if (/\breact\b|\bvite\b/.test(value)) return 'react-vite';
  if (/\btypescript\b|\btsx\b/.test(value)) return 'typescript';
  if (/\bnode\b|\bexpress\b|\bapi\b|\bbackend\b/.test(value)) return 'node';
  if (/\bhtml\b|\bcss\b|\bjavascript\b|\blanding\b|\bsite\b|\bwebsite\b/.test(value)) return 'vanilla-web';
  return 'auto';
}

export function buildProjectSpec(message = '') {
  const stack = detectRequestedStack(message);
  const common = [
    'implementar integralmente os requisitos do usuário',
    'usar nomes de arquivos, imports e exports coerentes',
    'não criar arquivos vazios, stubs, TODOs ou pseudocódigo',
    'manter UI responsiva quando houver frontend',
    'incluir estados de carregamento, vazio, sucesso e erro quando aplicável',
    'garantir acessibilidade básica: labels, foco visível, semântica e navegação por teclado',
    'não inventar endpoints, credenciais ou integrações que não foram fornecidos'
  ];
  const templates = {
    'react-vite': [
      'package.json com scripts dev/build e dependências necessárias',
      'index.html, vite.config e src/main.jsx ou src/main.tsx',
      'src/App.jsx ou src/App.tsx',
      'componentes e páginas separados conforme a complexidade',
      'estilos reais, responsivos e consistentes'
    ],
    next: [
      'package.json com scripts dev/build/start e dependências Next/React',
      'estrutura app/ ou pages/ consistente com a versão escolhida',
      'layout, páginas, componentes e estilos completos',
      'distinguir corretamente componentes de servidor e cliente quando aplicável'
    ],
    vue: [
      'package.json com Vue e ferramenta de build escolhida',
      'index.html, src/main.js ou src/main.ts e src/App.vue',
      'componentes .vue e estilos completos'
    ],
    svelte: [
      'package.json e configuração Svelte/SvelteKit coerentes',
      'entrypoints e rotas conforme Svelte ou SvelteKit escolhido',
      'componentes .svelte completos e estilos necessários'
    ],
    angular: [
      'package.json e angular.json coerentes',
      'src/main.ts e estrutura src/app completa',
      'componentes, módulos/rotas e estilos necessários'
    ],
    astro: [
      'package.json e astro.config coerentes',
      'src/pages/index.astro e layouts/componentes necessários',
      'ilhas interativas apenas quando necessárias'
    ],
    typescript: [
      'package.json com scripts e dependências necessárias',
      'tsconfig.json',
      'tipos explícitos nos limites importantes',
      'imports e exports resolvíveis'
    ],
    node: [
      'package.json com scripts e dependências necessárias',
      'entrypoint do servidor',
      'rotas/módulos separados quando necessário',
      'validação de entrada e tratamento de erros'
    ],
    'vanilla-web': [
      'index.html, style.css e script.js',
      'HTML/CSS/JS conectados entre si',
      'interações funcionais, sem botões decorativos'
    ],
    auto: ['escolher a stack mais simples que cumpra integralmente o pedido', 'incluir configuração e dependências quando necessárias']
  };
  return { stack, requirements: [...common, ...(templates[stack] || templates.auto)] };
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

function resolveLocal(from, specifier, files) {
  if (!specifier.startsWith('.')) return true;
  const base = normalizePath(`${from.split('/').slice(0, -1).join('/')}/${specifier}`)
    .split('/')
    .reduce((parts, part) => {
      if (!part || part === '.') return parts;
      if (part === '..') parts.pop();
      else parts.push(part);
      return parts;
    }, []).join('/');
  const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.vue', '.svelte', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
  return extensions.some(extension => files.has(base + extension));
}

export function analyzeProject(files = [], message = '') {
  const issues = [], warnings = [];
  const clean = (files || []).filter(file => file?.path && typeof file.content === 'string' && file.content.trim());
  const byPath = new Map();
  for (const file of clean) {
    const filePath = normalizePath(file.path);
    if (byPath.has(filePath)) issues.push(`arquivo duplicado: ${filePath}`);
    else byPath.set(filePath, file);
  }
  if (!clean.length) return { ok: false, issues: ['nenhum arquivo válido'], warnings, stack: detectRequestedStack(message) };
  if (clean.some(file => /\bTODO\b|YOUR_API_KEY|lorem ipsum|implement here|coming soon/i.test(file.content))) {
    warnings.push('há placeholders/TODOs que precisam ser revisados');
  }

  const requestedStack = detectRequestedStack(message);
  const packageFile = byPath.get('package.json');
  let pkg = null;
  if (packageFile) {
    try { pkg = JSON.parse(packageFile.content); }
    catch { issues.push('package.json contém JSON inválido'); }
  }
  let stack = requestedStack;
  if (stack === 'auto' && pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) stack = 'next';
    else if (deps.vue) stack = 'vue';
    else if (deps.svelte || deps['@sveltejs/kit']) stack = 'svelte';
    else if (deps['@angular/core']) stack = 'angular';
    else if (deps.astro) stack = 'astro';
    else if (deps.react && deps.vite) stack = 'react-vite';
  }

  const needsPackage = ['react-vite', 'next', 'vue', 'svelte', 'angular', 'astro', 'node', 'typescript'].includes(stack);
  if (needsPackage && !packageFile) issues.push('falta package.json para a stack solicitada');
  if (pkg && typeof pkg === 'object' && !Array.isArray(pkg)) {
    if (!pkg.scripts || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts)) warnings.push('package.json não define scripts de execução');
    const scripts = pkg.scripts || {};
    if (['react-vite', 'vue', 'svelte', 'astro'].includes(stack) && !scripts.dev) warnings.push('package.json não define script "dev"');
    if (['react-vite', 'vue', 'svelte', 'astro', 'next', 'angular'].includes(stack) && !scripts.build) warnings.push('package.json não define script "build"');
    if (stack === 'react-vite' && !(pkg.dependencies?.react || pkg.devDependencies?.react)) issues.push('React não está declarado no package.json');
    if (stack === 'react-vite' && !(pkg.dependencies?.vite || pkg.devDependencies?.vite)) issues.push('Vite não está declarado no package.json');
    if (stack === 'next' && !(pkg.dependencies?.next || pkg.devDependencies?.next)) issues.push('Next.js não está declarado no package.json');
    if (stack === 'vue' && !(pkg.dependencies?.vue || pkg.devDependencies?.vue)) issues.push('Vue não está declarado no package.json');
  }

  for (const file of clean.filter(item => /\.(?:jsx?|tsx?|mjs|cjs)$/i.test(item.path))) {
    const pattern = /(?:import[\s\S]*?from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
    let match;
    while ((match = pattern.exec(file.content))) {
      if (match[1].startsWith('.') && !resolveLocal(file.path, match[1], byPath)) {
        issues.push(`${file.path}: import local não encontrado: ${match[1]}`);
      }
    }
  }

  const paths = [...byPath.keys()];
  if (stack === 'react-vite') {
    if (!byPath.has('index.html')) issues.push('falta index.html');
    if (!paths.some(filePath => /^src\/main\.(jsx?|tsx?)$/.test(filePath))) issues.push('falta src/main.jsx/tsx');
    if (!paths.some(filePath => /^src\/App\.(jsx?|tsx?)$/.test(filePath))) issues.push('falta src/App.jsx/tsx');
  }
  if (stack === 'next' && !paths.some(filePath => /^(app|src\/app|pages|src\/pages)\/(page|index)\.(jsx?|tsx?)$/.test(filePath))) {
    issues.push('falta página inicial em app/ ou pages/ para Next.js');
  }
  if (stack === 'vue' && !paths.some(filePath => /^src\/App\.vue$/.test(filePath))) issues.push('falta src/App.vue');
  if (stack === 'svelte' && !paths.some(filePath => /\.(svelte)$/.test(filePath))) issues.push('nenhum componente .svelte encontrado');
  if (stack === 'astro' && !paths.some(filePath => /^src\/pages\/.+\.astro$/.test(filePath))) issues.push('falta página .astro em src/pages');
  if (stack === 'angular' && !paths.some(filePath => /^src\/main\.ts$/.test(filePath))) issues.push('falta src/main.ts para Angular');
  if (stack === 'vanilla-web') {
    for (const filePath of ['index.html', 'style.css', 'script.js']) if (!byPath.has(filePath)) issues.push(`falta ${filePath}`);
  }

  return { ok: issues.length === 0, issues: [...new Set(issues)], warnings: [...new Set(warnings)], stack };
}

export function developerPrompt(message, issues = []) {
  const spec = buildProjectSpec(message);
  return `${message}

MODO KIRA DEVELOPER AGENT
STACK DETECTADA: ${spec.stack}
CONTRATO DO PROJETO:
${spec.requirements.map(item => `- ${item}`).join('\n')}

PROCESSO OBRIGATÓRIO ANTES DE ENTREGAR:
1. Converta o pedido em uma lista de requisitos verificáveis e implemente cada um.
2. Planeje a árvore de arquivos, dependências, entrypoints, rotas e fluxo de dados.
3. Gere todos os arquivos completos do projeto, inclusive package.json/configuração quando a stack exigir.
4. Revise imports, exports, caminhos relativos, nomes de componentes, scripts e dependências.
5. Verifique se todos os botões, formulários, filtros, links e ações pedidos têm comportamento real.
6. Revise responsividade, acessibilidade básica, estados vazios/carregamento/erro e consistência visual.
7. Não afirme que executou build ou testes. A Kira fará verificações estáticas e de preview separadamente.
8. Só então entregue o projeto inteiro em um único artifact.
${issues.length ? `\nA validação determinística encontrou estes erros na tentativa anterior:\n${issues.map(item => `- ${item}`).join('\n')}\nCorrija TODOS eles e devolva novamente o projeto completo.` : ''}

Não simplifique React/Next/Vue/Svelte/Angular/TypeScript para HTML puro. Não troque a stack pedida. Não entregue explicações no lugar dos arquivos.`;
}
