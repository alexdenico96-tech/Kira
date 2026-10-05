import path from "path";

const COMPLEX_HINT=/\b(react|vite|next|typescript|dashboard|painel|app|aplicativo|saas|api|backend|fullstack|e-?commerce|loja|autentica|login|banco de dados|database|postgres|componentes|rotas|router)\b/i;

export function isComplexProjectRequest(message=""){
  return COMPLEX_HINT.test(String(message)) || String(message).length > 900;
}

export function detectRequestedStack(message=""){
  const m=String(message).toLowerCase();
  if(/\bnext(?:\.js)?\b/.test(m)) return "next";
  if(/\breact\b|\bvite\b/.test(m)) return "react-vite";
  if(/\btypescript\b|\btsx\b/.test(m)) return "typescript";
  if(/\bnode\b|\bexpress\b|\bapi\b|\bbackend\b/.test(m)) return "node";
  if(/\bhtml\b|\bcss\b|\bjavascript\b|\blanding\b|\bsite\b|\bwebsite\b/.test(m)) return "vanilla-web";
  return "auto";
}

export function buildProjectSpec(message=""){
  const stack=detectRequestedStack(message);
  const common=[
    "implementar integralmente os requisitos do usuário",
    "usar nomes de arquivos/imports/exports coerentes",
    "não criar arquivos vazios, stubs, TODOs ou pseudocódigo",
    "manter UI responsiva quando houver frontend",
    "incluir tratamento de estados e erros quando aplicável"
  ];
  const templates={
    "react-vite":[
      "package.json com scripts e dependências necessárias",
      "index.html",
      "src/main.jsx ou src/main.tsx",
      "src/App.jsx ou src/App.tsx",
      "componentes/páginas separados quando a complexidade justificar",
      "CSS real e responsivo"
    ],
    next:["package.json coerente com Next.js","estrutura app/ ou pages/ consistente","componentes reutilizáveis","estilos completos"],
    typescript:["package.json quando executável","tsconfig.json","tipos explícitos nos limites importantes","imports resolvíveis"],
    node:["package.json","entrypoint do servidor","rotas/módulos separados quando necessário","tratamento de erros"],
    "vanilla-web":["index.html","style.css","script.js","HTML/CSS/JS conectados entre si"],
    auto:["escolher a stack mais simples que cumpra integralmente o pedido","incluir configuração e dependências quando necessárias"]
  };
  return {stack,requirements:[...common,...templates[stack]]};
}

function norm(p){return String(p||"").replace(/\\/g,"/").replace(/^\.?\//,"");}
function exists(files,p){const n=norm(p);return files.some(f=>norm(f.path)===n);}
function resolveLocal(from,spec,files){
  if(!spec.startsWith(".")) return true;
  const base=path.posix.normalize(path.posix.join(path.posix.dirname(norm(from)),spec));
  const tries=[base,`${base}.js`,`${base}.jsx`,`${base}.ts`,`${base}.tsx`,`${base}.json`,`${base}/index.js`,`${base}/index.jsx`,`${base}/index.ts`,`${base}/index.tsx`];
  return tries.some(p=>exists(files,p));
}

export function analyzeProject(files=[],message=""){
  const issues=[], warnings=[];
  const clean=(files||[]).filter(f=>f?.path && typeof f.content==="string" && f.content.trim());
  const paths=clean.map(f=>norm(f.path));
  const duplicates=paths.filter((p,i)=>paths.indexOf(p)!==i);
  if(duplicates.length) issues.push(`arquivos duplicados: ${[...new Set(duplicates)].join(", ")}`);
  if(clean.some(f=>/\bTODO\b|YOUR_API_KEY|lorem ipsum|implement here|coming soon/i.test(f.content))) warnings.push("há placeholders/TODOs no projeto");

  const stack=detectRequestedStack(message);
  const pkg=clean.find(f=>norm(f.path)==="package.json");
  if(["react-vite","next","node","typescript"].includes(stack) && !pkg) issues.push("falta package.json para a stack solicitada");
  if(pkg){
    try{
      const parsed=JSON.parse(pkg.content);
      if(!parsed.scripts || !Object.keys(parsed.scripts).length) issues.push("package.json não possui scripts");
      if(stack==="react-vite" && !(parsed.dependencies?.react || parsed.devDependencies?.react)) issues.push("React não está declarado no package.json");
      if(stack==="react-vite" && !(parsed.dependencies?.vite || parsed.devDependencies?.vite)) issues.push("Vite não está declarado no package.json");
    }catch{issues.push("package.json contém JSON inválido");}
  }

  for(const f of clean.filter(f=>/\.(jsx?|tsx?)$/i.test(f.path))){
    const specs=[];
    const rx=/(?:import[\s\S]*?from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/g;
    let m; while((m=rx.exec(f.content))) specs.push(m[1]);
    for(const spec of specs) if(!resolveLocal(f.path,spec,clean)) issues.push(`${f.path}: import local não encontrado: ${spec}`);
  }

  if(stack==="react-vite"){
    if(!exists(clean,"index.html")) issues.push("falta index.html");
    if(!paths.some(p=>/^src\/main\.(jsx?|tsx?)$/.test(p))) issues.push("falta src/main.jsx/tsx");
    if(!paths.some(p=>/^src\/App\.(jsx?|tsx?)$/.test(p))) issues.push("falta src/App.jsx/tsx");
  }
  if(stack==="vanilla-web"){
    for(const p of ["index.html","style.css","script.js"]) if(!exists(clean,p)) issues.push(`falta ${p}`);
  }
  return {ok:issues.length===0,issues:[...new Set(issues)],warnings:[...new Set(warnings)],stack,files:clean};
}

export function developerPrompt(message,issues=[]){
  const spec=buildProjectSpec(message);
  return `${message}

MODO KIRA DEVELOPER AGENT
STACK DETECTADA: ${spec.stack}
CONTRATO DO PROJETO:
${spec.requirements.map(x=>`- ${x}`).join("\n")}

PROCESSO OBRIGATÓRIO ANTES DE CHAMAR create_document:
1. Planeje mentalmente arquitetura, árvore de arquivos, dependências e fluxo de dados.
2. Confirme que cada requisito do usuário tem implementação concreta.
3. Gere todos os arquivos completos do projeto, inclusive package.json/configuração quando a stack exigir.
4. Revise imports, exports, caminhos, nomes de componentes, scripts e dependências.
5. Faça uma revisão final procurando erros de sintaxe, arquivos ausentes e funcionalidades apenas decorativas.
6. Só então chame create_document com o projeto inteiro.
${issues.length?`\nA validação determinística encontrou estes erros na tentativa anterior:\n${issues.map(x=>`- ${x}`).join("\n")}\nCorrija TODOS eles e devolva novamente o projeto completo.`:""}

Não simplifique React/Next/TypeScript para HTML puro. Não troque a stack pedida. Não entregue explicações no lugar dos arquivos.`;
}
