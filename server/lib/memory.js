// KIRA_MEMORY_V1
// 1. Conversas longas: as mensagens antigas viram um RESUMO salvo na conversa; o modelo recebe
//    resumo + as mensagens recentes (antes: só as 8 últimas, cortadas em 2.000 caracteres).
// 2. Memória do usuário: fatos duradouros (nome, preferências, projetos recorrentes) usados em
//    qualquer conversa. O usuário vê, apaga e pode desligar. Dados sensíveis nunca são guardados.

export const RECENT_MESSAGES = Number(process.env.KIRA_HISTORY_RECENT || 12);
const SUMMARY_EVERY = 6; // resume de novo a cada 6 mensagens que saem da janela recente

const clip = (text, max) => {
  const t = String(text || '');
  return t.length > max ? `${t.slice(0, Math.floor(max * 0.7))}\n[…]\n${t.slice(-Math.floor(max * 0.25))}` : t;
};

// Histórico para o modelo: só as mensagens recentes (o resumo vai no prompt do sistema).
// Mensagens longas guardam começo e fim (onde costumam estar o pedido e a conclusão).
export function buildHistory(messages = [], { recent = RECENT_MESSAGES, maxChars = 4000 } = {}) {
  return messages.slice(-recent).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: clip(describeMessage(m), maxChars) }]
  }));
}

// Mensagens com imagem, arquivo ou projeto ganham uma etiqueta para o modelo saber que existiram.
function describeMessage(m) {
  const tags = [];
  if (m.imageUrl) tags.push('[a Kira gerou uma imagem nesta resposta]');
  if (m.artifactName) tags.push(`[projeto "${m.artifactName}"${m.artifactVersion ? ` v${m.artifactVersion}` : ''}]`);
  if (m.file?.name) tags.push(`[arquivo gerado: ${m.file.name}]`);
  if (m.hadAttachment) tags.push('[o usuário anexou um arquivo/imagem]');
  return [m.content, ...tags].filter(Boolean).join('\n');
}

export function needsSummary(messages = [], summaryUpto = 0) {
  const older = messages.length - RECENT_MESSAGES;
  return older > 0 && older - (summaryUpto || 0) >= SUMMARY_EVERY;
}

export function summaryPrompt(previousSummary, messages) {
  const transcript = messages.map(m => `${m.role === 'assistant' ? 'KIRA' : 'USUÁRIO'}: ${clip(describeMessage(m), 1500)}`).join('\n\n');
  return `Você mantém a MEMÓRIA de uma conversa longa entre um usuário e a assistente Kira.
Atualize o resumo abaixo incorporando o trecho novo. O resumo será lido pela Kira no lugar dessas mensagens, então ele precisa preservar tudo o que importa para continuar a conversa com coerência:
- objetivos do usuário, decisões tomadas e o que já foi entregue (projetos, arquivos, imagens — com nomes);
- preferências e restrições ditas (estilo, cores, tecnologias, tom, idioma, formatos);
- números, nomes, datas e detalhes específicos combinados;
- pendências e próximos passos.
Escreva em tópicos curtos, no idioma da conversa, no máximo 350 palavras. Não invente nada.
Responda SOMENTE com o resumo atualizado.

RESUMO ATUAL:
${previousSummary || '(vazio)'}

TRECHO NOVO DA CONVERSA:
${transcript}`;
}

export function acceptSummary(text) {
  const t = String(text || '').trim().replace(/^```\w*\n?|```$/g, '').trim();
  if (t.length < 40 || t.length > 6000) return null;
  return t;
}

// ---------- memória do usuário ----------

// Nunca guardar: credenciais, documentos, dados financeiros, saúde, endereço exato.
const SENSITIVE = /\b(senha|password|contrase[nñ]a|token|api[\s_-]?key|chave (?:de )?api|cpf|cnpj|rg\b|passaporte|pasaporte|ssn|cart[aã]o de cr[eé]dito|tarjeta|cvv|conta banc[aá]ria|pix|iban|diagn[oó]stic|doen[cç]a|enfermedad|medica[cç][aã]o|medicamento|gravidez|embarazo|religi[aã]o|religi[oó]n|orienta[cç][aã]o sexual|endere[cç]o completo|n[uú]mero da casa)\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b(?:\d[ -]?){13,19}\b/i;

export const isSensitive = fact => SENSITIVE.test(String(fact));

export function memoryExtractionPrompt(existing = [], exchange = []) {
  const known = existing.length ? existing.map(m => `- [${m.id}] ${m.fact}`).join('\n') : '(nenhuma)';
  const transcript = exchange.map(m => `${m.role === 'assistant' ? 'KIRA' : 'USUÁRIO'}: ${clip(m.content, 1200)}`).join('\n\n');
  return `Você cuida da memória de longo prazo da assistente Kira sobre UM usuário.
Leia o trecho recente e decida o que vale lembrar em CONVERSAS FUTURAS.
Guarde só fatos DURADOUROS e úteis ditos pelo próprio usuário: como ele quer ser chamado, profissão/área, empresa ou projeto recorrente, idioma preferido, preferências de estilo (cores, tom, formatos, tecnologias), objetivos de longo prazo.
NÃO guarde: pedidos pontuais, perguntas, conteúdo das respostas da Kira, opiniões passageiras, nem dados sensíveis (senhas, documentos, saúde, finanças, religião, endereço).
Se um fato novo contradiz ou atualiza um existente, remova o antigo (pelo id) e adicione o novo.
Cada fato: uma frase curta em terceira pessoa ("Prefere apresentações com tema escuro").

MEMÓRIAS EXISTENTES:
${known}

TRECHO RECENTE:
${transcript}

Responda SOMENTE JSON: {"add":[{"fact":"...","category":"perfil|preferencia|projeto|objetivo"}],"remove":["id"]}. Se nada mudou: {"add":[],"remove":[]}.`;
}

export function parseMemoryChanges(raw, existing = []) {
  const text = String(raw || '').replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { add: [], remove: [] };
  let data;
  try { data = JSON.parse(text.slice(start, end + 1)); } catch { return { add: [], remove: [] }; }
  const ids = new Set(existing.map(m => m.id));
  const known = new Set(existing.map(m => m.fact.toLowerCase().trim()));
  const add = (Array.isArray(data.add) ? data.add : [])
    .map(x => ({ fact: String(x?.fact || '').trim().slice(0, 240), category: ['perfil', 'preferencia', 'projeto', 'objetivo'].includes(x?.category) ? x.category : 'geral' }))
    .filter(x => x.fact.length >= 6 && !isSensitive(x.fact) && !known.has(x.fact.toLowerCase()))
    .slice(0, 6);
  const remove = (Array.isArray(data.remove) ? data.remove : []).map(String).filter(id => ids.has(id)).slice(0, 10);
  return { add, remove };
}

// Quando vale tentar extrair memórias: a cada 4 mensagens do usuário, ou quando ele fala de si.
export function shouldExtractMemory(userMessageCount, lastUserText = '') {
  if (/\b(me chamo|meu nome [eé]|pode me chamar|sou (?:um|uma|o|a)? ?\w+|trabalho (?:com|como|na|no|em)|prefiro|eu gosto|lembr[ea](?:-se)? (?:que|de)|minha empresa|meu projeto|me llamo|mi nombre es|prefiero|trabajo (?:en|como)|recuerda|my name is|i prefer|remember that|i work)(?=[\s,.!?:;]|$)/i.test(lastUserText)) return true;
  return userMessageCount > 0 && userMessageCount % 4 === 0;
}

// Bloco que entra no prompt do sistema.
export function memoryBlock({ facts = [], summary = '' } = {}) {
  const parts = [];
  if (facts.length) {
    parts.push(`MEMÓRIA SOBRE O USUÁRIO (de conversas anteriores; use quando for relevante, sem citar que é uma "memória" e sem repetir isso a cada resposta):\n${facts.slice(0, 25).map(f => `- ${f.fact}`).join('\n')}`);
  }
  if (summary) {
    parts.push(`RESUMO DO INÍCIO DESTA CONVERSA (mensagens antigas que não estão mais no histórico; mantenha coerência com tudo o que está aqui):\n${summary}`);
  }
  return parts.join('\n\n');
}
