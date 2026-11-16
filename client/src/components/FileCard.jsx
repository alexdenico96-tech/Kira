import { useState } from "react";
import { Download, Eye, FileSpreadsheet, FileText, Presentation, Table2, FileType2, Loader2 } from "lucide-react";
import { downloadFile } from "../lib/api.js";

// Cor e ícone por formato (como os ícones dos próprios programas).
const STYLE = {
  pdf: { icon: FileType2, color: "#E5484D", label: "PDF" },
  docx: { icon: FileText, color: "#2B7CD3", label: "Word" },
  xlsx: { icon: FileSpreadsheet, color: "#1D9E5B", label: "Excel" },
  csv: { icon: Table2, color: "#12A594", label: "CSV" },
  pptx: { icon: Presentation, color: "#E8692C", label: "PowerPoint" }
};

const formatBytes = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default function FileCard({ file, token }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!file?.id) return null;
  const style = STYLE[file.format] || STYLE.pdf;
  const Icon = style.icon;

  async function open(mode) {
    setBusy(mode); setError("");
    try {
      const blob = await downloadFile(token, file.id);
      const url = URL.createObjectURL(blob);
      if (mode === "view") {
        window.open(url, "_blank", "noopener");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err.message || "Não consegui baixar o arquivo.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="kira-file-card" style={{ "--file-color": style.color }}>
      <div className="kira-file-card__icon"><Icon size={26} strokeWidth={1.8} /></div>
      <div className="min-w-0 flex-1">
        <p className="kira-file-card__title">{file.title || file.name}</p>
        <p className="kira-file-card__meta">
          <span className="kira-file-card__badge">{style.label}</span>
          {[file.summary, formatBytes(file.size || 0)].filter(Boolean).join(" · ")}
        </p>
        <p className="kira-file-card__name">{file.name}</p>
        {error && <p className="mt-1 text-xs text-coral">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        {file.format === "pdf" && (
          <button type="button" className="kira-file-card__btn" onClick={() => open("view")} disabled={Boolean(busy)}>
            {busy === "view" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Visualizar
          </button>
        )}
        <button type="button" className="kira-file-card__btn kira-file-card__btn--primary" onClick={() => open("download")} disabled={Boolean(busy)}>
          {busy === "download" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Baixar
        </button>
      </div>
    </div>
  );
}
