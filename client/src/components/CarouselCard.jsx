import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileType2, Images, Copy, Check, Loader2, ImageDown, Smartphone } from "lucide-react";
import { downloadFile } from "../lib/api.js";

// KIRA_CAROUSEL_V1: visualizador deslizável + downloads (ZIP, PDF, slide atual) + legenda pronta para copiar.
const T = {
  pt: { again: "Slides prontos — toque de novo em Salvar no celular.", phone: "Salvar no celular", phoneHint: "Escolha \"Salvar imagens\" ou o Instagram no menu do celular.", zip: "Baixar imagens (ZIP)", pdf: "PDF (LinkedIn)", slide: "Este slide", caption: "Legenda do post", copy: "Copiar", copied: "Copiado", prev: "Slide anterior", next: "Próximo slide", of: "de" },
  es: { again: "Diapositivas listas — toca de nuevo en Guardar en el celular.", phone: "Guardar en el celular", phoneHint: "Elige \"Guardar imágenes\" o Instagram en el menú del celular.", zip: "Descargar imágenes (ZIP)", pdf: "PDF (LinkedIn)", slide: "Esta diapositiva", caption: "Texto del post", copy: "Copiar", copied: "Copiado", prev: "Anterior", next: "Siguiente", of: "de" },
  en: { again: "Slides ready — tap Save to phone again.", phone: "Save to phone", phoneHint: "Pick \"Save images\" or Instagram in your phone's menu.", zip: "Download images (ZIP)", pdf: "PDF (LinkedIn)", slide: "This slide", caption: "Post caption", copy: "Copy", copied: "Copied", prev: "Previous slide", next: "Next slide", of: "of" }
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
  // KIRA_CAROUSEL_SHARE_V1: no celular, o menu de compartilhar salva tudo na galeria (ou manda direto ao Instagram).
  const [canShareFiles, setCanShareFiles] = useState(false);
  const shareFilesRef = useRef(null);
  const loadShareFiles = () => Promise.all((file?.carousel?.slides || []).map(async (s, i) => {
    const res = await fetch(s.url);
    if (!res.ok) throw new Error("Não consegui preparar os slides.");
    return new File([await res.blob()], s.name || `slide-${String(i + 1).padStart(2, "0")}.png`, { type: "image/png" });
  }));
  useEffect(() => {
    if (!canShareFiles || shareFilesRef.current) return;
    loadShareFiles().then(files => { shareFilesRef.current = files; }).catch(() => {});
  }, [canShareFiles]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const probe = new File([new Uint8Array([137, 80, 78, 71])], "probe.png", { type: "image/png" });
      setCanShareFiles(Boolean(navigator.canShare?.({ files: [probe] }) && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)));
    } catch { setCanShareFiles(false); }
  }, []);
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

  async function shareToPhone() {
    setError("");
    // Já preparados: o menu abre direto no toque (exigência do Safari/iOS).
    const files = shareFilesRef.current;
    if (captionText) navigator.clipboard?.writeText(captionText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {});
    if (!files) {
      setBusy("phone");
      try { shareFilesRef.current = await loadShareFiles(); setError(t.again); } catch (err) { setError(err.message); } finally { setBusy(""); }
      return;
    }
    try { await navigator.share({ files, title: file.title || "Carrossel" }); }
    catch (err) { if (err?.name !== "AbortError") setError(err.message || "Não consegui abrir o compartilhamento."); }
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
          {canShareFiles && (
            <button type="button" className="kira-file-card__btn kira-file-card__btn--primary kira-carousel__phone" onClick={shareToPhone} disabled={Boolean(busy)} title={t.phoneHint}>
              {busy === "phone" ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />} {t.phone}
            </button>
          )}
          <button type="button" className={`kira-file-card__btn${canShareFiles ? "" : " kira-file-card__btn--primary"}`} onClick={() => download("zip")} disabled={Boolean(busy)}>
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
        {canShareFiles && <p className="text-[11.5px] leading-snug text-mist">{t.phoneHint}{captionText ? ` ${file.lang === "es" ? "El texto del post se copia automáticamente." : file.lang === "en" ? "The caption is copied automatically." : "A legenda é copiada automaticamente."}` : ""}</p>}
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
