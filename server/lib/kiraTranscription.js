import { transcribeKiraAudio as transcribeWithGemini } from "./gemini.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function transcribeKiraAudio(audio) {
  if (!audio?.data || typeof audio.data !== "string") {
    throw new Error("Áudio não fornecido.");
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.warn("[kira-audio] GROQ_API_KEY ausente; usando Gemini");
    return transcribeWithGemini(audio);
  }

  try {
    const base64 = audio.data.replace(/^data:[^,]+,/, "");
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) {
      throw new Error("Áudio vazio ou maior que 25 MB.");
    }

    const mime = String(audio.mimeType || "audio/webm").split(";")[0].toLowerCase();
    const extensions = {
      "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a",
      "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
      "audio/x-wav": "wav", "audio/flac": "flac", "audio/mpga": "mp3"
    };
    const extension = extensions[mime] || "webm";
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `kira-voice.${extension}`);
    form.append("model", process.env.KIRA_GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo");
    form.append("response_format", "json");

    const started = Date.now();
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(Math.max(3000, Number(process.env.KIRA_GROQ_AUDIO_TIMEOUT_MS || 20000)))
    });
    if (!response.ok) {
      const err = new Error(`Groq transcription HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const result = await response.json();
    const transcript = String(result?.text || "").trim();
    if (!transcript) throw new Error("Groq retornou transcrição vazia.");
    console.info(`[kira-audio] provider=groq duration_ms=${Date.now() - started} chars=${transcript.length}`);
    return transcript;
  } catch (error) {
    console.warn(`[kira-audio] groq_transcription_failed status=${error.status || error.name || "error"}`);
    if (process.env.KIRA_AUDIO_GEMINI_FALLBACK === "true") {
      return transcribeWithGemini(audio);
    }
    throw new Error("Não foi possível transcrever o áudio pelo Groq.", { cause: error });
  }
}
