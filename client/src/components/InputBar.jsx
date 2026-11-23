import { useRef, useEffect, useState } from "react";
import { ImagePlus, Mic, Square, X, ArrowUp, Sparkles } from "lucide-react";
import { fileToBase64 } from "../lib/api.js";
import KiraVoiceWave from "./KiraVoiceWave";

export default function InputBar({ value, onChange, onSubmit, loading, autoFocus }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [pendingImages, setPendingImages] = useState([]);
  const pendingImage = pendingImages[0] || null;
  const clearImages = () => setPendingImages(list => { list.forEach(img => img.previewUrl && URL.revokeObjectURL(img.previewUrl)); return []; });
  const [pendingAudio, setPendingAudio] = useState(null);
  const [recording, setRecording] = useState(false);
  const [audioProcessing, setAudioProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // Cópia reduzida (≤ 504px) usada como referência pelo modelo de imagem ao editar/estilizar a foto.
  async function makeReference(file) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 504 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
      return blob ? { data: await fileToBase64(blob), mimeType: "image/jpeg" } : null;
    } catch {
      return null;
    }
  }

  // KIRA_CAROUSEL_V1: até 10 fotos por mensagem (carrosséis). Fotos grandes são reduzidas para no máx. 2048px.
  const MAX_IMAGES = 10;
  async function compress(file) {
    if (file.size < 1_500_000 && /^image\/(jpeg|png|webp)$/.test(file.type)) return { data: await fileToBase64(file), mimeType: file.type };
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
      if (blob) return { data: await fileToBase64(blob), mimeType: "image/jpeg" };
    } catch { /* formato que o navegador não decodifica: manda o original */ }
    return { data: await fileToBase64(file), mimeType: file.type };
  }

  async function handleImageSelect(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const images = files.filter(f => f.type.startsWith("image/"));
    if (!images.length) { setError("Escolha arquivos de imagem."); return; }
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) { setError(`Você pode anexar até ${MAX_IMAGES} imagens por mensagem.`); return; }
    try {
      const loaded = await Promise.all(images.slice(0, room).map(async (file, k) => {
        const first = pendingImages.length === 0 && k === 0;
        const [{ data, mimeType }, reference] = await Promise.all([compress(file), first ? makeReference(file) : null]);
        return { base64: data, mimeType, reference, previewUrl: URL.createObjectURL(file), name: file.name };
      }));
      setPendingImages(list => [...list, ...loaded]);
      setError(images.length > room ? `Anexei ${room} imagem(ns); o limite é ${MAX_IMAGES} por mensagem.` : null);
    } catch {
      setError("Não foi possível carregar a imagem.");
    }
  }

  const imagePayload = list => list.length ? {
    image: { data: list[0].base64, mimeType: list[0].mimeType, ...(list[0].reference ? { reference: list[0].reference } : {}) },
    ...(list.length > 1 ? { images: list.map(img => ({ data: img.base64, mimeType: img.mimeType })) } : {})
  } : {};

  async function toggleRecording() {
    setError(null);
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      setAudioProcessing(true);
      return;
    }
    try {
      // KIRA_AUDIO_FIDELITY_V1: áudio limpo = transcrição fiel (sem eco/ruído, volume estável, Opus em boa qualidade).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 }
      });
      const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"].find(type => window.MediaRecorder?.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, { ...(preferred ? { mimeType: preferred } : {}), audioBitsPerSecond: 128000 });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        try {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const base64 = await fileToBase64(blob);
          if (!base64) {
            setError("A gravação ficou vazia. Tente novamente.");
            return;
          }
          const sent = await onSubmit(value.trim(), {
            ...imagePayload(pendingImages),
            audio: { data: base64, mimeType: blob.type }
          });
          if (sent) {
            onChange("");
            clearImages();
            setPendingAudio(previous => {
              if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
              return null;
            });
          } else {
            setPendingAudio(previous => {
              if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
              return { base64, mimeType: blob.type, previewUrl: URL.createObjectURL(blob) };
            });
          }
        } catch {
          setError("Não foi possível processar a gravação.");
        } finally {
          setAudioProcessing(false);
          mediaRecorderRef.current = null;
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Não consegui acessar o microfone. Confira as permissões do navegador.");
    }
  }

  async function submit() {
    if (loading || recording || audioProcessing) return;
    const text = value.trim();
    if (!text && !pendingImage && !pendingAudio) return;
    const images = pendingImages;
    const audio = pendingAudio;
    if (audio) setAudioProcessing(true);
    try {
      const sent = await onSubmit(text, {
        ...imagePayload(images),
        audio: audio ? { data: audio.base64, mimeType: audio.mimeType } : undefined,
        audioPreviewUrl: audio?.previewUrl
      });
      if (sent) {
        onChange("");
        clearImages();
        setPendingAudio(null);
        setError(null);
      }
    } catch {
      setError("Não foi possível enviar a mensagem.");
    } finally {
      setAudioProcessing(false);
    }
  }

  const canSubmit = !loading && !recording && !audioProcessing && Boolean(value.trim() || pendingImage || pendingAudio);

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }} className="w-full max-w-2xl mx-auto">
      {(recording || audioProcessing) && (
        <div className="mb-3 flex justify-center px-1" role="status" aria-live="polite">
          <KiraVoiceWave mode={recording ? "recording" : "processing"} />
        </div>
      )}
      {(pendingImage || pendingAudio || error) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {pendingImages.map((img, k) => (
            <div key={img.previewUrl} className="group relative">
              <img src={img.previewUrl} alt={img.name || `Anexo ${k + 1}`} className="h-16 w-16 rounded-xl border border-line object-cover" />
              {pendingImages.length > 1 && <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 text-[10px] font-semibold text-white">{k + 1}</span>}
              <button type="button" onClick={() => setPendingImages(list => { URL.revokeObjectURL(img.previewUrl); return list.filter(x => x !== img); })} aria-label={`Remover imagem ${k + 1}`} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-ink shadow-lg"><X size={12} /></button>
            </div>
          ))}
          {pendingAudio && (
            <div className="flex items-center gap-2">
              <KiraVoiceWave mode="ready" audioUrl={pendingAudio.previewUrl} compact />
              <button type="button" onClick={() => { if (pendingAudio.previewUrl) URL.revokeObjectURL(pendingAudio.previewUrl); setPendingAudio(null); }} aria-label="Remover áudio" className="text-mist hover:text-coral"><X size={14} /></button>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-coral">{error}</p>}
        </div>
      )}
      <div className={["kira-input group overflow-hidden rounded-[26px] border border-line bg-panel shadow-xl shadow-black/20 transition-all duration-300 focus-within:border-neon/50", loading ? "kira-glow-border" : ""].join(" ")}>
        <div className="px-4 pb-1 pt-4">
          <textarea ref={textareaRef} rows={1} value={value} onChange={e => onChange(e.target.value)} onKeyDown={handleKeyDown} placeholder="Pergunte ou peça algo à Kira..." aria-label="Mensagem para Kira" className="block max-h-40 min-h-[38px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-paper outline-none shadow-none placeholder:text-mist focus:border-0 focus:outline-none focus:ring-0" style={{ WebkitAppearance: "none", boxShadow: "none" }} />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || audioProcessing} title="Anexar imagens (até 10)" aria-label="Anexar imagens" className="flex h-9 w-9 items-center justify-center rounded-xl text-mist hover:bg-panel2 hover:text-paper disabled:opacity-40"><ImagePlus size={19} /></button>
            <button type="button" onClick={toggleRecording} disabled={loading || audioProcessing} title={recording ? "Parar gravação" : "Gravar áudio"} aria-label={recording ? "Parar gravação" : "Gravar áudio"} className={["flex h-9 w-9 items-center justify-center rounded-xl", recording ? "animate-pulse bg-coral/10 text-coral" : "text-mist hover:bg-panel2 hover:text-paper", "disabled:opacity-40"].join(" ")}>
              {recording ? <Square size={17} /> : <Mic size={19} />}
            </button>
            <div className="ml-2 hidden items-center gap-1.5 text-xs text-mist sm:flex"><Sparkles size={13} className="text-neon" /><span>Kira AI</span></div>
          </div>
          <button type="submit" disabled={!canSubmit} aria-label="Enviar mensagem" title="Enviar mensagem" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neon text-white shadow-lg shadow-neon/10 hover:brightness-110 disabled:bg-panel2 disabled:text-mist disabled:shadow-none"><ArrowUp size={19} strokeWidth={2.5} /></button>
        </div>
      </div>
      <p className="mt-2 hidden text-center text-[11px] text-mist sm:block">Enter para enviar · Shift + Enter para nova linha</p>
    </form>
  );
}
