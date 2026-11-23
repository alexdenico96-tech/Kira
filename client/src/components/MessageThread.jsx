import KiraAudioMessage from "./KiraAudioMessage.jsx";
import KiraVoiceWave from "./KiraVoiceWave.jsx";
import { useEffect, useRef, useState } from "react";
import { FileDown, PanelsTopLeft } from "lucide-react";
import Markdown from "./Markdown.jsx";
import ImageGenerationAnimation from "./ImageGenerationAnimation.jsx";
import KiraProgress, { KiraTrace } from "./KiraProgress.jsx";
import TypewriterMarkdown from "./TypewriterMarkdown.jsx";
import SourcesBar from "./SourcesBar.jsx";
import FileCard from "./FileCard.jsx";
import CarouselCard from "./CarouselCard.jsx";
import { linkCitations } from "../lib/typewriter.js";

// Fontes vêm na resposta nova (sources) ou do histórico salvo (visitedSites com objetos).
const sourcesOf = m => m.sources?.length ? m.sources : (Array.isArray(m.visitedSites) ? m.visitedSites.filter(s => s && typeof s === "object" && s.url) : []);

function Avatar({ live = false }) {
  return (
    <span className={`kira-avatar mt-0.5${live ? " is-live" : ""}`}>
      <img src="/logo.png" alt="Kira" />
    </span>
  );
}

function downloadDocument(name, content) {
  const blob = new Blob([content], {
    type: "text/markdown;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function DocumentCard({ name, content }) {
  return (
    <button
      type="button"
      onClick={() => downloadDocument(name, content)}
      className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-panel2 px-4 py-3 hover:border-neon/50 transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-neon/15 flex items-center justify-center shrink-0">
        <FileDown size={16} className="text-neon" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-body font-medium text-paper truncate">
          {name}
        </p>
        <p className="text-xs font-mono text-mist">
          clique para baixar
        </p>
      </div>
    </button>
  );
}

function GeneratedImage({ src }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  async function downloadGeneratedImage() {
    try {
      const response = await fetch(src);

      if (!response.ok) {
        throw new Error("Não foi possível baixar a imagem.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const extension = blob.type.includes("jpeg")
        ? "jpg"
        : blob.type.includes("webp")
          ? "webp"
          : "png";

      link.href = url;
      link.download = "kira-imagem-" + Date.now() + "." + extension;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("[kira-image] download_failed", error);
      alert("Não foi possível baixar a imagem. Tente novamente.");
    }
  }

  if (failed) {
    return (
      <div
        className="mt-2 text-sm text-coral font-body"
        role="alert"
      >
        A imagem não pôde ser carregada pelo serviço de geração.
        Tente novamente mais tarde.
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-3">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel2">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel2">
            <div className="h-8 w-8 rounded-full border-2 border-neon/20 border-t-neon animate-spin" />
          </div>
        )}

        <img
          src={src}
          alt="Imagem gerada pela Kira"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={[
            "block w-full h-auto transition-all duration-700 ease-out",
            loaded
              ? "opacity-100 blur-0 scale-100"
              : "opacity-0 blur-md scale-[1.03]"
          ].join(" ")}
        />
      </div>

      <button
        type="button"
        onClick={downloadGeneratedImage}
        disabled={!loaded}
        className="flex items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-paper hover:border-neon/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FileDown size={16} className="text-neon" />
        Baixar imagem
      </button>
    </div>
  );
}

// Corpo da resposta: escreve o texto e só então mostra as fontes (como no Gemini).
function AssistantAnswer({ m, onTick, token }) {
  const [typed, setTyped] = useState(!m.reveal);
  const sources = sourcesOf(m);
  return (
    <>
      <TypewriterMarkdown
        content={linkCitations(m.content || "", sources)}
        animate={Boolean(m.reveal)}
        onTick={onTick}
        onDone={() => setTyped(true)}
      />
      {typed && (
        <SourcesBar sources={sources} queries={m.searchQueries || []} entryPoint={m.searchEntryPoint || ""} />
      )}
      {typed && m.file && (m.file.format === "carousel" ? <CarouselCard file={m.file} token={token} /> : <FileCard file={m.file} token={token} />)}
    </>
  );
}

export default function MessageThread({
  messages,
  loading,
  loadingLabel,
  generatingImage = false,
  progress,
  token,
  onOpenArtifact
}) {
  const endRef = useRef(null);

  // Durante a "digitação", acompanha o texto só se o usuário já estiver perto do fim.
  function followTyping() {
    const end = endRef.current;
    const scroller = end?.closest("main");
    if (!scroller) return;
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, loading, progress?.steps?.length]);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6 py-8">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="kira-message flex justify-end">
            <div className="max-w-[80%] flex flex-col items-end gap-1.5">
              {m.previewImages?.length > 0 && (
                <div className="grid max-w-[300px] grid-cols-3 gap-1.5">
                  {m.previewImages.map((src, k) => <img key={k} src={src} alt={`Enviada ${k + 1}`} className="aspect-square w-full rounded-lg border border-line object-cover" />)}
                </div>
              )}
              {m.previewImage && (
                <img
                  src={m.previewImage}
                  alt="Enviada"
                  className="max-w-[220px] max-h-[220px] rounded-xl border border-line object-cover"
                />
              )}

              {m.hadAudio && (
  <KiraAudioMessage src={m.audioPreviewUrl} />
)}

              {m.voice?.heard && (
                <div className="kira-voice-transcript">
                  <span className="kira-voice-transcript__label">A Kira ouviu</span>
                  <p>“{m.voice.heard}”</p>
                  {m.voice.cleaned && m.voice.request !== m.voice.heard && (
                    <p className="kira-voice-transcript__request"><span>Pedido entendido:</span> {m.voice.request}</p>
                  )}
                </div>
              )}

              {m.content && (
                <div className="kira-bubble-user border border-line px-4 py-2.5 text-[15px] text-paper font-body whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div key={i} className="kira-message flex gap-3">
            <Avatar />

            <div className="flex-1 pt-0.5 min-w-0">
              {m.isError ? (
                <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral font-body">
                  {m.content}
                </div>
              ) : (
                <>
                  <KiraTrace trace={m.trace} />
                  <AssistantAnswer m={m} onTick={followTyping} token={token} />

                  {m.imageUrl && (
                    <GeneratedImage src={m.imageUrl} />
                  )}

                  {m.artifactFiles?.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenArtifact?.({
                          name: m.artifactName || "Artifact",
                          files: m.artifactFiles
                        })
                      }
                      className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-panel2 px-4 py-3 hover:border-neon/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neon/15 flex items-center justify-center shrink-0">
                        <PanelsTopLeft
                          size={16}
                          className="text-neon"
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-body font-medium text-paper truncate">
                          {m.artifactName || "Artifact"}
                        </p>

                        <p className="text-xs font-mono text-mist">
                          {m.artifactFiles.length} arquivo(s) · abrir workspace
                        </p>
                      </div>
                    </button>
                  ) : m.documentName && m.documentContent ? (
                    <DocumentCard
                      name={m.documentName}
                      content={m.documentContent}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        )
      )}


{loading && (
  <div className="kira-message flex gap-3">
    <Avatar live />

    <div className="min-w-0 flex-1 flex flex-col gap-3">
      {generatingImage && <ImageGenerationAnimation compact />}
      <KiraProgress
        steps={progress?.steps || []}
        mode={progress?.mode || "chat"}
        startedAt={progress?.startedAt || Date.now()}
      />
    </div>
  </div>
)}


      <div ref={endRef} />
    </div>
  );
}
