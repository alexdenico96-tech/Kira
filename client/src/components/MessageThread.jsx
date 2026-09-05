import { useEffect, useRef } from "react";
import Markdown from "./Markdown.jsx";

function Avatar() {
  return <img src="/logo.png" alt="Kira" className="w-7 h-7 shrink-0 rounded-full object-cover mt-0.5" />;
}

export default function MessageThread({ messages, loading, loadingLabel }) {
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
              {m.hadAudio && (
                <audio src={m.audioPreviewUrl} controls className="h-9 max-w-[220px]" />
              )}
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
                  <Markdown>{m.content}</Markdown>
                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="Gerada pela Kira"
                      className="mt-2 max-w-full sm:max-w-sm rounded-xl border border-line"
                      loading="lazy"
                    />
                  )}
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
