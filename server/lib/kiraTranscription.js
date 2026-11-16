// KIRA_AUDIO_FIDELITY_V1
// Transcrição fiel dos pedidos por voz:
//  1. Whisper Large v3 no Groq (mais preciso que o turbo), com rodízio entre todas as chaves.
//  2. Prompt com vocabulário técnico + contexto recente da conversa (o Whisper usa isso para acertar termos e idioma).
//  3. Confiança medida pelos segmentos (avg_logprob / no_speech_prob) e filtro das "alucinações" típicas em silêncio.
//  4. Áudio com baixa confiança → segunda opinião do Gemini (multimodal, lida melhor com ruído).
import { transcribeKiraAudio as transcribeWithGemini } from "./gemini.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const EXTENSIONS = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a",
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac", "audio/mpga": "mp3"
};

const VOCABULARY = "Kira. Pedidos sobre: site, landing page, aplicativo, React, Vite, Next.js, Vue, Tailwind, HTML, CSS, JavaScript, TypeScript, API, dashboard, " +
  "PowerPoint, Excel, Word, PDF, CSV, planilha, apresentação, slides, imagem, logo, layout, cor, fonte, botão, cabeçalho, rodapé.";

// Frases que o Whisper costuma "inventar" em silêncio ou ruído.
const HALLUCINATIONS = /^(?:obrigad[oa] (?:por assistir|pela aten[cç][aã]o)[.!]*|legendas? pela comunidade amara\.org|inscreva-se(?: no canal)?[.!]*|thank you(?: for watching)?[.!]*|thanks for watching[.!]*|subt[ií]tulos realizados por la comunidad de amara\.org|gracias por ver(?: el video)?[.!]*|\.+|tchau[.!]*)$/i;

const groqKeys = () => [...new Set(String(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean))];
let keyIndex = 0;

export function whisperPrompt(context = "") {
  // O Whisper considera só o fim do prompt (~224 tokens): vocabulário primeiro, contexto da conversa por último.
  const ctx = String(context || "").replace(/\s+/g, " ").trim().slice(-300);
  return `${VOCABULARY}${ctx ? ` Contexto da conversa: ${ctx}` : ""}`.slice(-700);
}

export function isHallucination(text = "") {
  return HALLUCINATIONS.test(String(text).trim());
}

// Confiança 0–1 a partir dos segmentos do verbose_json (média ponderada pela duração).
export function confidenceFrom(segments = []) {
  if (!Array.isArray(segments) || !segments.length) return null;
  let weight = 0, sum = 0, noSpeech = 0;
  for (const s of segments) {
    const d = Math.max(0.1, Number(s.end) - Number(s.start) || 0.1);
    weight += d;
    sum += d * Math.exp(Math.min(0, Number(s.avg_logprob) || -1));
    noSpeech = Math.max(noSpeech, Number(s.no_speech_prob) || 0);
  }
  return { score: +(sum / weight).toFixed(3), noSpeech: +noSpeech.toFixed(3) };
}

async function whisper({ bytes, mime, model, prompt }) {
  const keys = groqKeys();
  if (!keys.length) { const e = new Error("Groq não configurada."); e.code = "not_configured"; throw e; }
  let lastError;
  for (let attempt = 0; attempt < Math.min(keys.length, 3); attempt++) {
    const key = keys[keyIndex++ % keys.length];
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `kira-voice.${EXTENSIONS[mime] || "webm"}`);
    form.append("model", model);
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    if (prompt) form.append("prompt", prompt);
    if (process.env.KIRA_AUDIO_LANGUAGE) form.append("language", process.env.KIRA_AUDIO_LANGUAGE);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(Math.max(3000, Number(process.env.KIRA_GROQ_AUDIO_TIMEOUT_MS || 30000)))
      });
      if (!response.ok) {
        const e = new Error(`Groq transcription (${model}) HTTP ${response.status}`);
        e.status = response.status;
        throw e;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error.status && error.status !== 429 && error.status < 500) break; // modelo/arquivo recusado: não adianta outra chave
    }
  }
  throw lastError;
}

/**
 * @returns {{ text: string, provider: string, language: string|null, confidence: number|null, lowConfidence: boolean }}
 */
export async function transcribeKiraAudioDetailed(audio, { context = "" } = {}) {
  if (!audio?.data || typeof audio.data !== "string") throw new Error("Áudio não fornecido.");
  const base64 = audio.data.replace(/^data:[^,]+,/, "");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error("Áudio vazio ou maior que 25 MB.");
  const mime = String(audio.mimeType || "audio/webm").split(";")[0].toLowerCase();
  const geminiAllowed = process.env.KIRA_AUDIO_GEMINI_FALLBACK !== "false";
  const prompt = whisperPrompt(context);

  let best = null;
  const models = [...new Set([process.env.KIRA_GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3", "whisper-large-v3-turbo"])];
  for (const model of models) {
    try {
      const started = Date.now();
      const result = await whisper({ bytes, mime, model, prompt });
      const text = String(result?.text || "").trim();
      const conf = confidenceFrom(result?.segments);
      const hallucinated = !text || isHallucination(text);
      const low = hallucinated || (conf && (conf.score < 0.45 || (conf.noSpeech > 0.6 && text.split(/\s+/).length < 4)));
      console.info(`[kira-audio] provider=groq model=${model} duration_ms=${Date.now() - started} chars=${text.length} lang=${result?.language || "?"} confidence=${conf?.score ?? "n/a"} no_speech=${conf?.noSpeech ?? "n/a"} low=${Boolean(low)}`);
      best = { text: hallucinated ? "" : text, provider: `groq:${model}`, language: result?.language || null, confidence: conf?.score ?? null, lowConfidence: Boolean(low) };
      break;
    } catch (error) {
      console.warn(`[kira-audio] groq model=${model} failed=${error.status || error.code || error.message}`);
    }
  }

  // Segunda opinião (ou reserva) do Gemini quando o Whisper falhou ou ficou inseguro.
  if ((!best || best.lowConfidence) && geminiAllowed) {
    try {
      const text = String(await transcribeWithGemini(audio, { context })).trim();
      if (text && !isHallucination(text)) {
        console.info(`[kira-audio] provider=gemini chars=${text.length} reason=${best ? "low_confidence" : "groq_failed"}`);
        return { text, provider: "gemini", language: best?.language || null, confidence: null, lowConfidence: false };
      }
    } catch (error) {
      console.warn(`[kira-audio] gemini_transcription_failed=${error.status || error.message}`);
    }
  }
  if (!best) throw new Error("Não foi possível transcrever o áudio.");
  return best;
}

// Compatibilidade: devolve só o texto.
export async function transcribeKiraAudio(audio, options) {
  const result = await transcribeKiraAudioDetailed(audio, options);
  if (!result.text) throw new Error("Não foi possível entender o áudio.");
  return result.text;
}
