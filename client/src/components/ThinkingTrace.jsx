import { useState } from "react";

export default function ThinkingTrace({ searchQueries = [], visitedSites = [], reasoning }) {
  const [open, setOpen] = useState(false);
  const total = searchQueries.length + visitedSites.length + (reasoning ? 1 : 0);
  if (total === 0) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-neon hover:text-paper transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-neon" />
        {open ? "ocultar raciocínio" : "pensou e pesquisou"}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-line bg-panel2/60 px-3 py-2.5 space-y-2">
          {reasoning && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-mist font-mono mb-1">Raciocínio</p>
              <p className="text-xs font-mono text-paper/80 whitespace-pre-wrap leading-relaxed">{reasoning}</p>
            </div>
          )}
          {searchQueries.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-mist font-mono mb-1">Pesquisou</p>
              <ul className="space-y-1">
                {searchQueries.map((q, i) => (
                  <li key={i} className="text-xs font-mono text-paper/90">
                    “{q}”
                  </li>
                ))}
              </ul>
            </div>
          )}
          {visitedSites.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-mist font-mono mb-1">Visitou</p>
              <ul className="space-y-1">
                {visitedSites.map((url, i) => (
                  <li key={i} className="text-xs font-mono truncate">
                    <a href={url} target="_blank" rel="noreferrer" className="text-neon hover:underline">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
