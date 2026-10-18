
import { useRef, useEffect, useState } from "react";
import {
  ImagePlus,
  Mic,
  Square,
  X,
  ArrowUp,
  Sparkles
} from "lucide-react";
import { fileToBase64 } from "../lib/api.js";

export default function InputBar({
  value,
  onChange,
  onSubmit,
  loading,
  autoFocus
}) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [pendingImage, setPendingImage] = useState(null);
  const [pendingAudio, setPendingAudio] = useState(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height =
      `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e) {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
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

    try {
      const base64 = await fileToBase64(file);

      setPendingImage((previous) => {
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
        }

        return {
          base64,
          mimeType: file.type,
          previewUrl: URL.createObjectURL(file),
          name: file.name
        };
      });

      setError(null);
    } catch {
      setError("Não foi possível carregar a imagem.");
    }
  }

  async function toggleRecording() {
    setError(null);

    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true
        });

      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        try {
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || "audio/webm"
          });

          const base64 = await fileToBase64(blob);

          if (!base64) {
            setError(
              "A gravação ficou vazia. Tente novamente."
            );
            return;
          }

          const sent = await onSubmit(value.trim(), {
            image: pendingImage
              ? {
                  data: pendingImage.base64,
                  mimeType: pendingImage.mimeType
                }
              : undefined,
            audio: {
              data: base64,
              mimeType: blob.type
            }
          });

          if (sent) {
            if (pendingImage?.previewUrl) {
              URL.revokeObjectURL(
                pendingImage.previewUrl
              );
            }

            onChange("");
            setPendingImage(null);
            setPendingAudio(null);
          } else {
            setPendingAudio({
              base64,
              mimeType: blob.type,
              previewUrl: URL.createObjectURL(blob)
            });
          }
        } catch {
          setError(
            "Não foi possível processar a gravação."
          );
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError(
        "Não consegui acessar o microfone. Confira as permissões do navegador."
      );
    }
  }

  async function submit() {
    if (loading || recording) return;

    const text = value.trim();

    if (!text && !pendingImage && !pendingAudio) {
      return;
    }

    const image = pendingImage;
    const audio = pendingAudio;

    const sent = await onSubmit(text, {
      image: image
        ? {
            data: image.base64,
            mimeType: image.mimeType
          }
        : undefined,
      audio: audio
        ? {
            data: audio.base64,
            mimeType: audio.mimeType
          }
        : undefined,
      audioPreviewUrl: audio?.previewUrl
    });

    if (sent) {
      if (image?.previewUrl) {
        URL.revokeObjectURL(image.previewUrl);
      }

      onChange("");
      setPendingImage(null);
      setPendingAudio(null);
      setError(null);
    }
  }

  const canSubmit =
    !loading &&
    !recording &&
    Boolean(value.trim() || pendingImage || pendingAudio);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="w-full max-w-2xl mx-auto"
    >
      {(pendingImage || pendingAudio || error) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {pendingImage && (
            <div className="group relative">
              <img
                src={pendingImage.previewUrl}
                alt={pendingImage.name || "Anexo"}
                className="h-16 w-16 rounded-xl border border-line object-cover"
              />

              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(
                    pendingImage.previewUrl
                  );
                  setPendingImage(null);
                }}
                aria-label="Remover imagem"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-ink shadow-lg"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {pendingAudio && (
            <div className="flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3 py-2">
              <Mic size={15} className="text-neon" />

              <audio
                src={pendingAudio.previewUrl}
                controls
                className="h-7 max-w-[160px]"
              />

              <button
                type="button"
                onClick={() => {
                  if (pendingAudio.previewUrl) {
                    URL.revokeObjectURL(
                      pendingAudio.previewUrl
                    );
                  }
                  setPendingAudio(null);
                }}
                aria-label="Remover áudio"
                className="text-mist hover:text-coral"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-coral">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="group overflow-hidden rounded-[22px] border border-line bg-panel shadow-xl shadow-black/20 transition-all duration-300 focus-within:border-neon/50 focus-within:shadow-[0_0_30px_rgba(59,130,246,0.08)]">
        <div className="px-4 pb-1 pt-4">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte ou peça algo à Kira..."
            aria-label="Mensagem para Kira"
            className="block max-h-40 min-h-[38px] w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed text-paper outline-none shadow-none placeholder:text-mist focus:border-0 focus:outline-none focus:ring-0"
            style={{
              WebkitAppearance: "none",
              boxShadow: "none"
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={loading}
              title="Anexar imagem"
              aria-label="Anexar imagem"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-mist hover:bg-panel2 hover:text-paper disabled:opacity-40"
            >
              <ImagePlus size={19} />
            </button>

            <button
              type="button"
              onClick={toggleRecording}
              disabled={loading}
              title={
                recording
                  ? "Parar gravação"
                  : "Gravar áudio"
              }
              aria-label={
                recording
                  ? "Parar gravação"
                  : "Gravar áudio"
              }
              className={[
                "flex h-9 w-9 items-center justify-center rounded-xl",
                recording
                  ? "animate-pulse bg-coral/10 text-coral"
                  : "text-mist hover:bg-panel2 hover:text-paper",
                "disabled:opacity-40"
              ].join(" ")}
            >
              {recording ? (
                <Square size={17} />
              ) : (
                <Mic size={19} />
              )}
            </button>

            <div className="ml-2 hidden items-center gap-1.5 text-xs text-mist sm:flex">
              <Sparkles
                size={13}
                className="text-neon"
              />
              <span>
                Kira AI
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Enviar mensagem"
            title="Enviar mensagem"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neon text-white shadow-lg shadow-neon/10 hover:brightness-110 disabled:bg-panel2 disabled:text-mist disabled:shadow-none"
          >
            <ArrowUp size={19} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <p className="mt-2 hidden text-center text-[11px] text-mist sm:block">
        Enter para enviar · Shift + Enter para nova linha
      </p>
    </form>
  );
}
