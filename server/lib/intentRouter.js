// Regras determinísticas: perguntas educativas nunca acionam o workspace.
const educational = /\b(?:como|como funciona|quais|qual|porque|por que|por qué|cu[aá]les|cu[aá]l|explica|explique|expl[ií]came|indica(?:me)?|liste|lista|dicas|conselhos|melhores pr[aá]ticas|best practices|what|why|how|tips|steps|pasos)\b/i;
const action = /\b(?:crie|cria|criar|gere|gera|gerar|fa[cç]a|monte|desenvolva|construa|implemente|crea|crear|genera|haz|construye|desarrolla|build|create|generate|make|implement)\b/i;
const project = /\b(?:projeto|proyectos?|project|projects|workspace|site|sitio|website|webapp|aplica[cç][aã]o|aplicaci[oó]n|app|dashboard|landing page|sistema|arquivos?|files?|carpeta|pasta)\b/i;
const code = /\b(?:c[oó]digo|code|fun[cç][aã]o|funci[oó]n|function|script|snippet|componente|component)\b/i;
const edit = /\b(?:altere|alterar|edite|editar|modifique|modificar|corrija|corrigir|atualize|atualizar|substitua|substituir|adicione|adicionar|remova|remover|mude|mudar|ajuste|ajustar|conserte|consertar|cambia|modifica|corrige|edita|actualiza|arregla|change|edit|fix|update|modify|remove)\b/i;
export function classifyKiraIntent(message, hasExistingProject=false) {
  const text=String(message||'').trim();
  if (!text) return {kind:'chat',editingArtifact:false,wantsArtifact:false};
  const question=(educational.test(text) || /indicame|indícame|melhores pr[aá]ticas|mejores pr[aá]cticas/i.test(text)) && !/\b(?:crie|crea|gere|genera|fa[cç]a|haz|build|generate)\b/i.test(text);
  const editingArtifact=Boolean(hasExistingProject && edit.test(text) && !question);
  const wantsArtifact=Boolean(!question && !editingArtifact && action.test(text) && project.test(text));
  const kind=editingArtifact?'project_edit':wantsArtifact?'project_create':!question&&action.test(text)&&code.test(text)?'code_chat':'chat';
  return {kind,editingArtifact,wantsArtifact};
}
