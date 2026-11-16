// KIRA_AUDIO_FIDELITY_V1
// Fala ≠ texto: "é... cria um site, não, espera, uma landing page azul... tipo com três seções".
// Este passo transforma a transcrição num pedido escrito claro, aplicando as autocorreções do próprio falante,
// SEM inventar, resumir ou executar nada. Se a reescrita parecer arriscada, fica a transcrição original.

const DISFLUENCY = /\b(é+h*|ã+h*|hum+|hmm+|tipo|n[eé]|ent[aã]o|a[ií]|assim|sabe|quer dizer|ou melhor|ou seja|n[aã]o,? (?:espera|pera|calma)|pera[íi]?|digo|perd[aã]o|corrigindo|deixa eu ver|como (?:é|que) (?:que )?(?:fala|chama)|eh+|este|o sea|bueno|mejor dicho|digamos)\b/gi;

export function needsVoiceCleanup(text = "") {
  const t = String(text).trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 6) return false;
  const fillers = (t.match(DISFLUENCY) || []).length;
  return fillers >= 2 || /\b(n[aã]o,? (?:espera|pera)|quer dizer|ou melhor|digo|mejor dicho|corrigindo)\b/i.test(t) || words >= 45;
}

export function voiceCleanupPrompt(transcript) {
  return `A seguir está a TRANSCRIÇÃO de um pedido falado por voz para uma assistente de IA.
Reescreva-a como o pedido escrito que a pessoa quis fazer:
- Aplique as autocorreções do falante ("azul, não, verde" → "verde"; "cria um site, ou melhor, uma landing page" → "cria uma landing page").
- Remova hesitações e repetições (é, ãh, tipo, né, então, aí, sabe).
- Preserve TODOS os detalhes: números, quantidades, nomes, cores, tecnologias, ordem dos itens e o idioma original.
- NÃO responda ao pedido, NÃO acrescente nada, NÃO resuma, NÃO traduza.
- Se a transcrição já estiver clara, devolva-a igual.
Responda SOMENTE com o pedido reescrito, sem aspas e sem comentários.

TRANSCRIÇÃO:
${String(transcript).slice(0, 4000)}`;
}

const numbers = s => (String(s).match(/\d+(?:[.,]\d+)?/g) || []);

// Aceita a reescrita só se ela for uma versão limpa do mesmo pedido.
export function acceptVoiceCleanup(original, cleaned) {
  const a = String(original || "").trim();
  let b = String(cleaned || "").trim().replace(/^["“']|["”']$/g, "").trim();
  if (!b) return null;
  if (/```|^(claro|certo|aqui est[aá]|com certeza|ok[,!.]|entendi|vou |posso |sure|here is)/i.test(b)) return null; // respondeu em vez de reescrever
  const ratio = b.length / Math.max(1, a.length);
  if (ratio < 0.4 || ratio > 1.25) return null;
  const originalNumbers = new Set(numbers(a));
  if (numbers(b).some(n => !originalNumbers.has(n))) return null; // não pode inventar números
  return b;
}

export async function cleanVoiceRequest(transcript, ask) {
  if (!needsVoiceCleanup(transcript) || typeof ask !== "function") return { text: transcript, cleaned: false };
  try {
    const accepted = acceptVoiceCleanup(transcript, await ask(voiceCleanupPrompt(transcript)));
    return accepted ? { text: accepted, cleaned: accepted !== transcript.trim() } : { text: transcript, cleaned: false };
  } catch {
    return { text: transcript, cleaned: false };
  }
}
