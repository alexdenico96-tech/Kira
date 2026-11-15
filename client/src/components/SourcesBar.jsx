import { useState } from "react";
import { ChevronDown, Globe } from "lucide-react";

function Favicon({ source, size = 18 }) {
  const [failed, setFailed] = useState(false);
  if (failed || !source.favicon) {
    return (
      <span className="kira-favicon kira-favicon--letter" style={{ width: size, height: size }}>
        {(source.domain || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={source.favicon}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="kira-favicon"
    />
  );
}

export { Favicon };

// Fontes consultadas na pesquisa (como no Gemini): ícones empilhados + lista de sites ao abrir.
export default function SourcesBar({ sources = [], queries = [], entryPoint = "" }) {
  const [open, setOpen] = useState(false);
  if (!sources.length && !entryPoint) return null;

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {sources.length > 0 && (
        <button type="button" className="kira-sources-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
          <span className="kira-favicon-stack">
            {sources.slice(0, 4).map(source => <Favicon key={source.url} source={source} />)}
          </span>
          <span>{sources.length} {sources.length === 1 ? "fonte" : "fontes"}</span>
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && (
        <div className="kira-sources-grid">
          {sources.map((source, index) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="kira-source-card">
              <span className="kira-source-card__head">
                <Favicon source={source} size={16} />
                <span className="truncate">{source.domain}</span>
                <span className="kira-source-card__n">{index + 1}</span>
              </span>
              {source.title && source.title.toLowerCase() !== source.domain && (
                <span className="kira-source-card__title">{source.title}</span>
              )}
            </a>
          ))}
          {queries.length > 0 && (
            <p className="col-span-full flex items-center gap-1.5 text-[11px] text-mist">
              <Globe size={12} /> Pesquisou: {queries.map(q => `“${q}”`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* Sugestões de pesquisa do Google: exibição exigida pelos termos do Grounding with Google Search. */}
      {entryPoint && (
        <iframe
          title="Sugestões de pesquisa do Google"
          className="kira-search-suggestions"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={`<meta name="color-scheme" content="light dark"><base target="_blank"><style>:root{color-scheme:light dark}html,body{margin:0;background:transparent}</style>${entryPoint}`}
        />
      )}
    </div>
  );
}
