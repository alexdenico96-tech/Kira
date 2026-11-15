import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatSeconds } from "../lib/progress.js";

export { mergeProgress, modeFromStep, formatSeconds } from "../lib/progress.js";

const TITLES = {
  project: "Kira está construindo",
  edit: "Kira está editando o projeto",
  image: "Kira está criando sua imagem",
  vision: "Kira está analisando a imagem",
  audio: "Kira está ouvindo",
  chat: "Kira está pensando"
};

const FIRST_STEP = {
  project: "Entendendo o pedido",
  edit: "Lendo os arquivos do projeto",
  image: "Interpretando a cena",
  vision: "Analisando a imagem",
  audio: "Transcrevendo o áudio",
  chat: "Pensando na resposta"
};

export default function KiraProgress({ steps = [], mode = "chat", startedAt = Date.now() }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const visible = steps.length ? steps : [{ id: "start", label: FIRST_STEP[mode] || FIRST_STEP.chat, state: "active" }];
  const done = visible.filter(step => step.state === "done").length;

  return (
    <div className="kira-progress kira-glow-border" role="status" aria-live="polite">
      <div className="kira-progress__head">
        <span className="kira-progress__orb" />
        <div className="min-w-0">
          <p className="kira-progress__title">{TITLES[mode] || TITLES.chat}</p>
          <p className="kira-progress__meta">
            {done ? `${done} ${done === 1 ? "fase finalizada" : "fases finalizadas"}` : "iniciando"} · {formatSeconds(elapsed)}
          </p>
        </div>
      </div>

      <ol className="kira-steps">
        {visible.map(step => (
          <li key={step.id} className={`kira-step kira-step--${step.state}`}>
            <span className="kira-step__icon">
              {step.state === "done" ? <Check size={11} strokeWidth={3.2} /> : <span className="kira-step__spinner" />}
            </span>
            <div className="min-w-0">
              <p className="kira-step__label">{step.label}</p>
              {step.detail && <p className="kira-step__detail">{step.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="kira-progress__bar"><span /></div>
    </div>
  );
}

// Resumo compacto das fases, preso à resposta da Kira (clique para ver tudo).
export function KiraTrace({ trace }) {
  const [open, setOpen] = useState(false);
  if (!trace?.steps?.length) return null;
  const done = trace.steps.filter(step => step.state === "done").length;
  return (
    <div>
      <button type="button" className="kira-trace" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span className="kira-trace__check"><Check size={10} strokeWidth={3.2} /></span>
        Concluído em {formatSeconds(trace.seconds)} · {done} {done === 1 ? "fase" : "fases"}
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ol className="kira-steps mb-3 ml-1">
          {trace.steps.map(step => (
            <li key={step.id} className="kira-step kira-step--done">
              <span className="kira-step__icon"><Check size={11} strokeWidth={3.2} /></span>
              <div className="min-w-0">
                <p className="kira-step__label">{step.label}</p>
                {step.detail && <p className="kira-step__detail">{step.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
