const WEB_HINT = /\b(site|website|landing\s*page|p[aá]gina|html|css|javascript|js|frontend|loja|portf[oó]lio)\b/i;
const FRAMEWORK_HINT = /\b(react|vite|next(?:\.js)?|vue|angular|svelte|typescript|tsx)\b/i;

export function isWebProjectRequest(message=""){
  return WEB_HINT.test(String(message)) && !FRAMEWORK_HINT.test(String(message));
}

function getFile(files, name){
  return files.find(f => String(f.path||"").toLowerCase() === name.toLowerCase());
}

export function validateArtifact(files, message=""){
  const issues=[];
  const clean=Array.isArray(files)?files.filter(f=>f?.path && typeof f.content==="string" && f.content.trim()):[];
  if(!clean.length) return {ok:false,issues:["nenhum arquivo válido"],files:clean};

  if(isWebProjectRequest(message)){
    const html=getFile(clean,"index.html");
    const css=getFile(clean,"style.css");
    const js=getFile(clean,"script.js");

    if(!html) issues.push("falta index.html");
    if(!css) issues.push("falta style.css");
    if(!js) issues.push("falta script.js");

    if(html){
      const h=html.content;
      if(h.length < 700) issues.push("index.html está curto/incompleto");
      if(css && !/href\s*=\s*["'][^"']*style\.css/i.test(h)) issues.push("index.html não conecta style.css");
      if(js && !/src\s*=\s*["'][^"']*script\.js/i.test(h)) issues.push("index.html não conecta script.js");
      if(!/<main[\s>]/i.test(h) && !/<section[\s>]/i.test(h)) issues.push("HTML sem estrutura de conteúdo suficiente");
    }
    if(css){
      if(css.content.length < 500) issues.push("style.css está curto/incompleto");
      const blocks=(css.content.match(/\{[^{}]*\}/g)||[]).length;
      const declarations=(css.content.match(/[a-z-]+\s*:\s*[^;{}]+[;}]/gi)||[]).length;
      if(blocks < 6 || declarations < 12) issues.push("style.css não possui estilização suficiente");
      if(!/(display|grid|flex|padding|margin|background|color|font)/i.test(css.content)) issues.push("style.css parece inválido ou sem layout");
    }
    if(js){
      if(js.content.length < 120) issues.push("script.js está curto/incompleto");
      if(!/(addEventListener|querySelector|getElementById|function\s|=>)/.test(js.content)) issues.push("script.js não contém comportamento utilizável");
    }

    // Respeita pedidos explícitos de quantidade de carros/produtos quando detectáveis.
    const carMatch=String(message).match(/(?:pelo\s+menos|ao\s+menos|mínimo(?:\s+de)?|minimo(?:\s+de)?|menos)\s+(\d+)\s+(?:carros?|ve[ií]culos?)/i);
    if(carMatch && html){
      const requested=Number(carMatch[1]);
      const cards=(html.content.match(/<(?:article|li)\b/gi)||[]).length
        + (html.content.match(/class=["'][^"']*(?:car-card|vehicle-card|product-card|carro|veiculo|veículo)[^"']*["']/gi)||[]).length;
      if(requested>=4 && cards < Math.ceil(requested/2)) issues.push(`o HTML não parece conter os ${requested} veículos solicitados`);
    }
  }
  return {ok:issues.length===0,issues,files:clean};
}

export function repairWebConnections(files){
  const next=files.map(f=>({...f}));
  const html=getFile(next,"index.html");
  const css=getFile(next,"style.css");
  const js=getFile(next,"script.js");
  if(!html) return next;

  let h=html.content;
  if(css && !/href\s*=\s*["'][^"']*style\.css/i.test(h)){
    const tag='  <link rel="stylesheet" href="style.css">';
    h=/<\/head>/i.test(h)?h.replace(/<\/head>/i,`${tag}\n</head>`):`${tag}\n${h}`;
  }
  if(js && !/src\s*=\s*["'][^"']*script\.js/i.test(h)){
    const tag='  <script src="script.js" defer></script>';
    h=/<\/body>/i.test(h)?h.replace(/<\/body>/i,`${tag}\n</body>`):`${h}\n${tag}`;
  }
  html.content=h;
  return next;
}

export function artifactSuccessReply(files){
  const names=(files||[]).map(f=>`\`${f.path}\``).join(", ");
  return `Criei os arquivos ${names} conforme solicitado por você. Dá uma olhadinha e me fale se precisa arrumar alguma coisa.`;
}

export function artifactQualityPrompt(message, issues=[]){
  return `${message}

REQUISITOS DE QUALIDADE OBRIGATÓRIOS:
- Entregue um projeto completo e utilizável, não uma demonstração mínima.
- Se for site HTML/CSS/JavaScript puro, crie index.html, style.css e script.js.
- Se o usuário pedir React/Vite/Next/TypeScript ou outra framework, PRESERVE a stack e crie a estrutura real dela; não force style.css/script.js na raiz.
- index.html deve importar style.css com <link rel="stylesheet" href="style.css">.
- index.html deve importar script.js com <script src="script.js" defer></script>.
- Todos os seletores/classes/IDs usados entre HTML, CSS e JS devem ser coerentes.
- Não coloque CSS ou JavaScript inline se existem arquivos separados.
- Implemente todas as seções, textos, botões e interações pedidas.
- Use conteúdo completo e visualmente apresentável; não entregue arquivos vazios, placeholders ou código excessivamente curto.
- CSS deve realmente estilizar a página: layout responsivo, tipografia, espaçamento, cores, cards, botões, estados hover e navegação quando aplicável.
- JavaScript deve implementar as interações pedidas; carrinho/login/filtros não podem ser apenas botões decorativos quando foram solicitados.
- Se o usuário pedir uma quantidade mínima (ex.: 10 carros), cumpra a quantidade integralmente.
- Para imagens remotas, use URLs HTTPS válidas e inclua alt text; não invente caminhos locais para imagens inexistentes.
- Antes de responder, revise mentalmente os imports, caminhos, seletores, IDs e dependências entre os arquivos.
${issues.length?`A tentativa anterior falhou nestes pontos: ${issues.join("; ")}. Corrija todos eles.`:""}
Use create_document e devolva TODOS os arquivos necessários no mesmo artifact.`;
}
