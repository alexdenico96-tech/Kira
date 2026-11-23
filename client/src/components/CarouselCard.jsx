import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileType2, Images, Copy, Check, Loader2, ImageDown } from "lucide-react";
import { downloadFile } from "../lib/api.js";

// KIRA_CAROUSEL_V1: visualizador deslizável + downloads (ZIP, PDF, slide atual) + legenda pronta para copiar.
const T = {
  pt: { zip: "Baixar imagens (ZIP)", pdf: "PDF (LinkedIn)", slide: "Este slide", caption: "Legenda do post", copy: "Copiar", copied: "Copiado", prev: "Slide anterior", next: "Próximo slide", of: "de" },
  es: { zip: "Descargar imágenes (ZIP)", pdf: "PDF (LinkedIn)", slide: "Esta diapositiva", caption: "Texto del post", copy: "Copiar", copied: "Copiado", prev: "Anterior", next: "Siguiente", of: "de" },
  en: { zip: "Download images (ZIP)", pdf: "PDF (LinkedIn)", slide: "This slide", caption: "Post caption", copy: "Copy", copied: "Copied", prev: "Previous slide", next: "Next slide", of: "of" }
};

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function CarouselCard({ file, token }) {
  const c = file?.carousel;
  const t = T[file?.lang] || T.pt;
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const slides = c?.slides || [];

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onScroll = () => setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => track.removeEventListener("scroll", onScroll);
  }, []);

  if (!c || !slides.length) return null;
  const go = i => {
    const next = Math.max(0, Math.min(slides.length - 1, i));
    trackRef.current?.scrollTo({ left: next * trackRef.current.clientWidth, behavior: "smooth" });
  };
  const captionText = [c.caption, (c.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

  async function download(kind) {
    setBusy(kind); setError("");
    try {
      if (kind === "slide") {
        const res = await fetch(slides[index].url);
        if (!res.ok) throw new Error("Não consegui baixar o slide.");
        saveBlob(await res.blob(), slides[index].name || `slide-${index + 1}.png`);
      } else {
        const target = kind === "pdf" ? c.pdf : file;
        saveBlob(await downloadFile(token, target.id), target.name);
      }
    } catch (err) {
      setError(err.message || "Não consegui baixar.");
    } finally {
      setBusy("");
    }
  }

  async function copyCaption() {
    try { await navigator.clipboard.writeText(captionText); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setError("Não consegui copiar; selecione o texto e copie manualmente."); }
  }

  return (
    <div className="kira-carousel">
      <div className="kira-carousel__stage">
        <div ref={trackRef} className="kira-carousel__track" tabIndex={0} aria-label={file.title}
          onKeyDown={e => { if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); } }}>
          {slides.map((s, i) => (
            <div key={s.id} className="kira-carousel__slide" style={{ aspectRatio: `${c.width} / ${c.height}` }}>
              <img src={s.url} alt={`${file.title} — ${i + 1} ${t.of} ${slides.length}`} loading={i < 2 ? "eager" : "lazy"} draggable={false} />
            </div>
          ))}
        </div>
        {index > 0 && <button type="button" className="kira-carousel__nav kira-carousel__nav--prev" onClick={() => go(index - 1)} aria-label={t.prev}><ChevronLeft size={20} /></button>}
        {index < slides.length - 1 && <button type="button" className="kira-carousel__nav kira-carousel__nav--next" onClick={() => go(index + 1)} aria-label={t.next}><ChevronRight size={20} /></button>}
        <span className="kira-carousel__counter">{index + 1} / {slides.length}</span>
      </div>

      <div className="kira-carousel__dots" role="tablist">
        {slides.map((s, i) => (
          <button key={s.id} type="button" role="tab" aria-selected={i === index} aria-label={`${i + 1}`} className={i === index ? "is-active" : ""} onClick={() => go(i)} />
        ))}
      </div>

      <div className="kira-carousel__bar">
        <div className="min-w-0">
          <p className="kira-file-card__title">{file.title || file.name}</p>
          <p className="kira-file-card__meta"><span className="kira-file-card__badge" style={{ "--file-color": "#C2562B" }}>Carrossel</span>{file.summary}</p>
        </div>
        <div className="kira-carousel__actions">
          <button type="button" className="kira-file-card__btn kira-file-card__btn--primary" onClick={() => download("zip")} disabled={Boolean(busy)}>
            {busy === "zip" ? <Loader2 size={15} className="animate-spin" /> : <Images size={15} />} {t.zip}
          </button>
          {c.pdf?.id && (
            <button type="button" className="kira-file-card__btn" onClick={() => download("pdf")} disabled={Boolean(busy)}>
              {busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <FileType2 size={15} />} {t.pdf}
            </button>
          )}
          <button type="button" className="kira-file-card__btn" onClick={() => download("slide")} disabled={Boolean(busy)}>
            {busy === "slide" ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />} {t.slide}
          </button>
        </div>
      </div>

      {captionText && (
        <div className="kira-carousel__caption">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-mist">{t.caption}</span>
            <button type="button" className="kira-carousel__copy" onClick={copyCaption}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t.copied : t.copy}</button>
          </div>
          <p>{captionText}</p>
        </div>
      )}
      {error && <p className="px-4 pb-3 text-xs text-coral">{error}</p>}
    </div>
  );
}
