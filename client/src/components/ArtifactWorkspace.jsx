import { useEffect, useMemo, useState } from "react";
import { Download, FileCode2, FolderArchive, X } from "lucide-react";

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadFile(file) {
  downloadBlob(file.path.split("/").pop() || "arquivo.txt", new Blob([file.content], { type: "text/plain;charset=utf-8" }));
}

// ZIP "store" (sem compressão), implementado com APIs nativas do navegador.
// Evita adicionar JSZip ou qualquer dependência nova ao projeto.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function safeProjectName(name) {
  return String(name || "projeto").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "projeto";
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(String(file.path || "arquivo.txt").replace(/^\/+/, ""));
    const data = encoder.encode(String(file.content ?? ""));
    const crc = crc32(data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
    ]);
    localParts.push(local);

    const central = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const central = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0)
  ]);
  return new Blob([...localParts, central, end], { type: "application/zip" });
}

function downloadProject(artifact) {
  const files = artifact?.files || [];
  if (!files.length) return;
  downloadBlob(`${safeProjectName(artifact.name)}.zip`, makeZip(files));
}

export default function ArtifactWorkspace({ artifact, onClose }) {
  const files = artifact?.files || [];
  const [selectedPath, setSelectedPath] = useState(files[0]?.path || "");

  useEffect(() => {
    setSelectedPath(files[0]?.path || "");
  }, [artifact]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => files.find((f) => f.path === selectedPath) || files[0], [files, selectedPath]);
  if (!artifact || !selected) return null;

  return (
    <section className="artifact-workspace flex min-w-0 flex-col border-l border-line bg-panel/95">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-display font-semibold text-paper">{artifact.name}</p>
          <p className="text-[11px] font-mono text-mist">{files.length} arquivo(s)</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => downloadProject(artifact)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-mist hover:bg-panel2 hover:text-paper" title="Baixar projeto inteiro em ZIP">
            <FolderArchive size={15} /> <span className="hidden xl:inline">baixar .zip</span>
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-mist hover:bg-panel2 hover:text-paper" aria-label="Fechar artifact">
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 overflow-y-auto border-r border-line bg-ink/20 p-2">
          {files.map((file) => (
            <button key={file.path} onClick={() => setSelectedPath(file.path)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-mono transition-colors ${selected?.path === file.path ? "bg-neon/15 text-neon" : "text-mist hover:bg-panel2 hover:text-paper"}`} title={file.path}>
              <FileCode2 size={13} className="shrink-0" />
              <span className="truncate">{file.path}</span>
            </button>
          ))}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 items-center justify-between border-b border-line px-3">
            <span className="truncate text-xs font-mono text-mist">{selected.path}</span>
            <button onClick={() => downloadFile(selected)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-panel2 hover:text-paper">
              <Download size={14} /> baixar arquivo
            </button>
          </div>
          <pre className="artifact-code min-h-0 flex-1 overflow-auto p-4 text-[13px] leading-6 text-paper"><code>{selected.content}</code></pre>
        </div>
      </div>
    </section>
  );
}
