import { useRef, useEffect, useState } from "react";
import { ImagePlus, Mic, Square, X } from "lucide-react";
import { fileToBase64 } from "../lib/api.js";

export default function InputBar({ value, onChange, onSubmit, loading, autoFocus }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [pendingImage, setPendingImage] = useState(null); // { base64, mimeType, previewUrl, name }
  const [pendingAudio, setPendingAudio] = useState(null); // { base64, mimeType, durationLabel }
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function handleImageSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem.");
      return;
    }
    setError(null);
    const base64 = await fileToBase64(file);
    setPendingImage({
      base64,
      mimeType: file.type,
      previewUrl: URL.createObjectURL(file),
      name: file.name
    });
  }

  async function toggleRecording() {
    setError(null);
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const base64 = await fileToBase64(blob);
        setPendingAudio({ base64, mimeType: blob.type, previewUrl: URL.createObjectURL(blob) });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Não consegui acessar o microfone. Confira as permissões do navegador.");
    }
  }

  function submit() {
    if (loading) return;
    const text = value.trim();
    if (!text && !pendingImage && !pendingAudio) return;

    onSubmit(text, {
      image: pendingImage ? { data: pendingImage.base64, mimeType: pendingImage.mimeType } : undefined,
      audio: pendingAudio ? { data: pendingAudio.base64, mimeType: pendingAudio.mimeType } : undefined,
      audioPreviewUrl: pendingAudio?.previewUrl
    });

    onChange("");
    setPendingImage(null);
    setPendingAudio(null);
  }

  const canSubmit = !loading && (value.trim() || pendingImage || pendingAudio);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="w-full max-w-2xl mx-auto"
    >
      {(pendingImage || pendingAudio || error) && (
        <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
          {pendingImage && (
            <div className="relative">
              <img src={pendingImage.previewUrl} alt="Anexo" className="w-12 h-12 rounded-lg object-cover border border-line" />
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-coral text-ink flex items-center justify-center"
              >
                <X size={10} />
              </button>
            </div>
          )}
          {pendingAudio && (
            <div className="flex items-center gap-1.5 rounded-full bg-panel2 border border-line px-3 py-1.5 text-xs font-mono text-paper">
              🎤
              <audio src={pendingAudio.previewUrl} controls className="h-6 max-w-[140px]" />
              <button type="button" onClick={() => setPendingAudio(null)} className="text-mist hover:text-coral">
                <X size={12} />
              </button>
            </div>
          )}
          {error && <span className="text-xs font-mono text-coral">{error}</span>}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-full bg-panel2 border border-line px-4 py-3.5 shadow-lg shadow-black/20 focus-within:border-neon/50 transition-colors">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Anexar imagem"
          className="w-7 h-7 flex items-center justify-center rounded-full text-mist hover:text-paper hover:bg-panel transition-colors shrink-0"
        >
          <ImagePlus size={18} />
        </button>

        <button
          type="button"
          onClick={toggleRecording}
          aria-label={recording ? "Parar gravação" : "Gravar áudio"}
          className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors shrink-0 ${
            recording ? "text-coral animate-pulse" : "text-mist hover:text-paper hover:bg-panel"
          }`}
        >
          {recording ? <Square size={16} /> : <Mic size={18} />}
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte alguma coisa"
          className="flex-1 resize-none bg-transparent outline-none focus:outline-none focus-visible:outline-none text-paper placeholder:text-mist/70 font-body text-[15px] max-h-32"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Enviar"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-neon text-ink disabled:bg-line disabled:text-mist disabled:cursor-not-allowed transition-colors shrink-0"
        >
          ↑
        </button>
      </div>
    </form>
  );
}
