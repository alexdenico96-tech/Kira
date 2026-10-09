import { useEffect, useRef, useState } from "react";
import { FileDown, PanelsTopLeft } from "lucide-react";
import Markdown from "./Markdown.jsx";

function Avatar() {
  return <img src="/logo.png" alt="Kira" className="w-7 h-7 shrink-0 rounded-full object-cover mt-0.5" />;
}

function downloadDocument(name, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
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
      onClick={() => downloadDocument(name, content)}
      className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-panel2 px-4 py-3 hover:border-neon/50 transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-neon/15 flex items-center justify-center shrink-0">
        <FileDown size={16} className="text-neon" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-body font-medium text-paper truncate">{name}</p>
        <p className="text-xs font-mono text-mist">clique para baixar</p>
      </div>
    </button>
  );
}

function RevealedMarkdown({ content }) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    setVisible(0);
    if (!content) return;
    const started = performance.now();
    const duration = Math.min(2200, Math.max(300, content.length * 3));
    let frame;
    const tick = (now) => {
      const ratio = Math.min(1, (now - started) / duration);
      setVisible(Math.min(content.length, Math.ceil(content.length * ratio)));
      if (ratio < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [content]);
  return <Markdown>{content.slice(0, visible)}</Markdown>;
}

export default function MessageThread({ messages, loading, loadingLabel, onOpenArtifact }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6 py-8">
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[80%] flex flex-col items-end gap-1.5">
              {m.previewImage && (
                <img src={m.previewImage} alt="Enviada" className="max-w-[220px] max-h-[220px] rounded-xl border border-line object-cover" />
              )}
              {m.hadAudio && <audio src={m.audioPreviewUrl} controls className="h-9 max-w-[220px]" />}
              {m.content && (
                <div className="rounded-2xl bg-panel2 border border-line px-4 py-2.5 text-[15px] text-paper font-body whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div key={i} className="flex gap-3">
            <Avatar />
            <div className="flex-1 pt-0.5 min-w-0">
              {m.isError ? (
                <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral font-body">{m.content}</div>
              ) : (
                <>
                  {m.reveal ? <RevealedMarkdown content={m.content || ""} /> : <Markdown>{m.content}</Markdown>}
                  {m.imageUrl && (
                    <img src={m.imageUrl} alt="Gerada pela Kira" className="mt-2 max-w-full sm:max-w-sm rounded-xl border border-line" loading="lazy" />
                  )}
                  {m.artifactFiles?.length ? (
                    <button
                      onClick={() => onOpenArtifact?.({ name: m.artifactName || "Artifact", files: m.artifactFiles })}
                      className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-panel2 px-4 py-3 hover:border-neon/50 transition-colors text-left"
                    >
                      <div className="w-9 h-9 rounded-lg bg-neon/15 flex items-center justify-center shrink-0">
                        <PanelsTopLeft size={16} className="text-neon" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-body font-medium text-paper truncate">{m.artifactName || "Artifact"}</p>
                        <p className="text-xs font-mono text-mist">{m.artifactFiles.length} arquivo(s) · abrir workspace</p>
                      </div>
                    </button>
                  ) : m.documentName && m.documentContent ? (
                    <DocumentCard name={m.documentName} content={m.documentContent} />
                  ) : null}
                </>
              )}
            </div>
          </div>
        )
      )}

      {loading && (
        <div className="flex gap-3">
          <Avatar />
          <div className="flex items-center gap-2 pt-2">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-bounce" />
            </span>
            <span className="text-xs font-mono text-mist">{loadingLabel || "pensando…"}</span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
