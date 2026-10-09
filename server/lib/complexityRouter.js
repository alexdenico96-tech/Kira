// Camada conservadora: não altera as intenções do Intent Router v1.
const advanced = /\b(?:arquiteto|arquitetura|architecture|architect|senior|s[eé]nior|api\s*rest|postgres(?:ql)?|banco de dados|database|seguran[cç]a|security|autentica[cç][aã]o|authentication|refator(?:ar|e|ing)|refactor|debug|depur(?:ar|a[cç][aã]o)|revise criticamente|revis[aã]o cr[ií]tica|review|auditoria|audit|escalabilidade|scalability|microservi[cç]os|microservices|depend[eê]ncias|dependencies|deploy|migra[cç][aã]o|migration|estrutura de pastas|folder structure|c[oó]digo base|codebase)\b/i;
const simple = /^(?:oi|ol[aá]|hola|hello|hey|bom dia|boa tarde|boa noite|good morning)[!.\s?]*$/i;
export function classifyKiraComplexity(message, intentKind='chat') {
  if(intentKind==='project_create'||intentKind==='project_edit')return 'project';
  const s=String(message||'').trim();
  if(simple.test(s))return 'simple';
  if(advanced.test(s))return 'advanced';
  // Solicitações de múltiplos arquivos ou execução completa exigem modelo avançado.
  if(/\b(?:arquivos completos|files? completos?|full (?:source )?code|c[oó]digo completo|complete code|pronto para (?:rodar|executar)|production.ready)\b/i.test(s))return 'advanced';
  return 'simple';
}
