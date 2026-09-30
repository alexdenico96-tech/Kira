import { useEffect, useMemo, useState } from "react";
import { Download, FileCode2, FolderArchive, History, RotateCcw, X } from "lucide-react";
import { getArtifact, listArtifactVersions, restoreArtifactVersion, generateProjectReadme, getVersionChanges } from "../lib/api.js";

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function downloadFile(file) {
  downloadBlob(file.path.split("/").pop() || "arquivo.txt", new Blob([file.content], { type: "text/plain;charset=utf-8" }));
}
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; table[n]=c>>>0; }
  return table;
})();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0;}
const u16=v=>new Uint8Array([v&255,(v>>>8)&255]);
const u32=v=>new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]);
function concatBytes(parts){const size=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
function safeProjectName(name){return String(name||"projeto").trim().replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"projeto";}
function makeZip(files){
  const enc=new TextEncoder(),local=[],central=[];let offset=0;
  for(const file of files){const name=enc.encode(String(file.path||"arquivo.txt").replace(/^\/+/,"")),data=enc.encode(String(file.content??"")),crc=crc32(data);
    const l=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);local.push(l);
    central.push(concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));offset+=l.length;}
  const c=concatBytes(central),end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(c.length),u32(offset),u16(0)]);
  return new Blob([...local,c,end],{type:"application/zip"});
}
function downloadProject(artifact){if(artifact?.files?.length)downloadBlob(`${safeProjectName(artifact.name)}.zip`,makeZip(artifact.files));}

export default function ArtifactWorkspace({ artifact, token, onArtifactChange, onClose }) {
  const files=artifact?.files||[];
  const [selectedPath,setSelectedPath]=useState(files[0]?.path||"");
  const [versions,setVersions]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{setSelectedPath(files[0]?.path||"");},[artifact?.id,artifact?.version]);
  useEffect(()=>{
    if(!artifact?.id||!token){setVersions([]);return;}
    listArtifactVersions(token,artifact.id).then(setVersions).catch(e=>setError(e.message));
  },[artifact?.id,artifact?.version,token]);

  const selected=useMemo(()=>files.find(f=>f.path===selectedPath)||files[0],[files,selectedPath]);
  if(!artifact||!selected)return null;

  async function openVersion(version){
    if(!artifact.id)return;
    setBusy(true);setError("");
    try{
      const data=await getArtifact(token,artifact.id,version);
      onArtifactChange?.({id:data.id,version:data.version,name:data.name,files:data.files});
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function restore(version){
    if(!artifact.id||!confirm(`Restaurar a v${version}? Isso criará uma nova versão, sem apagar o histórico.`))return;
    setBusy(true);setError("");
    try{
      const data=await restoreArtifactVersion(token,artifact.id,version);
      onArtifactChange?.({id:data.id,version:data.version,name:data.name,files:data.files});
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }

  async function downloadReadme(){
    try{const r=await generateProjectReadme(token,artifact.id);downloadBlob(r.filename,new Blob([r.content],{type:"text/markdown;charset=utf-8"}));}catch(e){setError(e.message);}
  }
  async function downloadChanged(){
    try{
      const r=await getVersionChanges(token,artifact.id,artifact.version||1);
      if(!r.files?.length){setError("Esta versão não possui arquivos criados/alterados para exportar.");return;}
      downloadBlob(`${safeProjectName(artifact.name)}-v${artifact.version}-alterados.zip`,makeZip(r.files));
    }catch(e){setError(e.message);}
  }

  return <section className="artifact-workspace flex min-w-0 flex-col border-l border-line bg-panel/95 w-[46%] min-w-[420px] max-w-[760px] max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:h-[100dvh] max-lg:w-screen max-lg:max-w-none max-lg:min-w-0">
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-line px-2 sm:px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-display font-semibold text-paper">{artifact.name}</p>
          {artifact.id && <span className="rounded bg-neon/10 px-1.5 py-0.5 text-[10px] font-mono text-neon">v{artifact.version||1}</span>}
        </div>
        <p className="text-[11px] font-mono text-mist">{files.length} arquivo(s)</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        {artifact.id && versions.length>0 && <div className="relative flex items-center">
          <History size={14} className="pointer-events-none absolute left-2 text-mist"/>
          <select disabled={busy} value={artifact.version||1} onChange={e=>openVersion(Number(e.target.value))}
            className="rounded-lg border border-line bg-panel2 py-1.5 pl-7 pr-2 text-xs text-paper outline-none">
            {versions.map(v=><option key={v.version} value={v.version}>v{v.version} — {v.summary||"versão"}</option>)}
          </select>
        </div>}
        {artifact.id && versions.length>1 && <button disabled={busy} onClick={()=>restore(artifact.version||1)}
          className="rounded-lg p-2 text-mist hover:bg-panel2 hover:text-paper" title="Criar nova versão restaurando esta versão"><RotateCcw size={15}/></button>}
        {artifact.id && <button onClick={downloadReadme} className="rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-panel2 hover:text-paper" title="Gerar README">README</button>}
        {artifact.id && <button onClick={downloadChanged} className="rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-panel2 hover:text-paper" title="Baixar apenas arquivos alterados nesta versão">Δ ZIP</button>}
        <button onClick={()=>downloadProject(artifact)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs text-mist hover:bg-panel2 hover:text-paper" title="Baixar projeto inteiro em ZIP"><FolderArchive size={15}/><span className="hidden xl:inline">baixar .zip</span></button>
        <button onClick={onClose} className="rounded-lg p-2 text-mist hover:bg-panel2 hover:text-paper"><X size={17}/></button>
      </div>
    </header>
    {error&&<div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
    <div className="flex min-h-0 flex-1">
      <aside className="w-28 sm:w-36 xl:w-40 shrink-0 overflow-y-auto border-r border-line bg-ink/20 p-2">
        {files.map(file=><button key={file.path} onClick={()=>setSelectedPath(file.path)}
          className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-mono transition-colors ${selected.path===file.path?"bg-neon/15 text-neon":"text-mist hover:bg-panel2 hover:text-paper"}`}>
          <FileCode2 size={13} className="shrink-0"/><span className="truncate">{file.path}</span>
        </button>)}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between border-b border-line px-3">
          <span className="truncate text-xs font-mono text-mist">{selected.path}</span>
          <button onClick={()=>downloadFile(selected)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-panel2 hover:text-paper"><Download size={14}/> baixar arquivo</button>
        </div>
        <pre className="artifact-code min-h-0 flex-1 overflow-auto p-4 text-[13px] leading-6 text-paper"><code>{selected.content}</code></pre>
      </div>
    </div>
  </section>;
}
