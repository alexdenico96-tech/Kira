import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import { Download, Eye, FileCode2, FolderArchive, History, RotateCcw, Save, X, Code2 } from "lucide-react";
import { getArtifact, listArtifactVersions, restoreArtifactVersion, generateProjectReadme, getVersionChanges, saveArtifactFile } from "../lib/api.js";

function downloadBlob(name,blob){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
function downloadFile(file){downloadBlob(file.path.split("/").pop()||"arquivo.txt",new Blob([file.content],{type:"text/plain;charset=utf-8"}));}
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
const u16=v=>new Uint8Array([v&255,(v>>>8)&255]),u32=v=>new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]);
function concatBytes(parts){const size=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
function safeProjectName(name){return String(name||"projeto").trim().replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"projeto";}
function makeZip(files){const enc=new TextEncoder(),local=[],central=[];let offset=0;for(const file of files){const name=enc.encode(String(file.path||"arquivo.txt").replace(/^\/+/,"")),data=enc.encode(String(file.content??"")),crc=crc32(data);const l=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);local.push(l);central.push(concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));offset+=l.length;}const c=concatBytes(central),end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(c.length),u32(offset),u16(0)]);return new Blob([...local,c,end],{type:"application/zip"});}
function downloadProject(a){if(a?.files?.length)downloadBlob(`${safeProjectName(a.name)}.zip`,makeZip(a.files));}
function languageFor(file){const ext=(file?.path?.split(".").pop()||"").toLowerCase();return ({js:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",html:"html",htm:"html",css:"css",json:"json",md:"markdown",py:"python",java:"java",c:"c",cpp:"cpp",cs:"csharp",php:"php",xml:"xml",yml:"yaml",yaml:"yaml",sql:"sql",sh:"shell"})[ext]||file?.language||"plaintext";}
function previewDocument(files){
  const html=files.find(f=>/(^|\/)index\.html?$/i.test(f.path))||files.find(f=>/\.html?$/i.test(f.path));
  if(!html)return `<!doctype html><html><body style="font-family:system-ui;background:#071225;color:#f1f5f9;padding:32px"><h2>Preview indisponível</h2><p>Este projeto não possui um arquivo HTML.</p></body></html>`;
  let doc=String(html.content||"");
  const byBase=new Map(files.map(f=>[f.path.split("/").pop(),f]));
  doc=doc.replace(/<link\b([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi,(m,a,href,b)=>{const f=files.find(x=>x.path===href)||byBase.get(href.split("/").pop());return f?`<style data-kira-source="${href}">${f.content}</style>`:m;});
  doc=doc.replace(/<script\b([^>]*?)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi,(m,a,src,b)=>{const f=files.find(x=>x.path===src)||byBase.get(src.split("/").pop());return f?`<script data-kira-source="${src}">${f.content}<\/script>`:m;});
  return doc;
}

export default function ArtifactWorkspace({artifact,token,onArtifactChange,onClose}){
  const files=artifact?.files||[];
  const [selectedPath,setSelectedPath]=useState(files[0]?.path||"");
  const [versions,setVersions]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [tab,setTab]=useState("code"),[draft,setDraft]=useState("");
  const selected=useMemo(()=>files.find(f=>f.path===selectedPath)||files[0],[files,selectedPath]);
  const dirty=selected?draft!==String(selected.content??""):false;
  useEffect(()=>{setSelectedPath(files[0]?.path||"");},[artifact?.id,artifact?.version]);
  useEffect(()=>{setDraft(String(selected?.content??""));},[selected?.path,selected?.content]);
  useEffect(()=>{if(!artifact?.id||!token){setVersions([]);return;}listArtifactVersions(token,artifact.id).then(setVersions).catch(e=>setError(e.message));},[artifact?.id,artifact?.version,token]);
  if(!artifact||!selected)return null;

  async function openVersion(version){if(!artifact.id)return;setBusy(true);setError("");try{const d=await getArtifact(token,artifact.id,version);onArtifactChange?.({id:d.id,version:d.version,name:d.name,files:d.files});}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function restore(version){if(!artifact.id||!confirm(`Restaurar a v${version}? Isso criará uma nova versão.`))return;setBusy(true);setError("");try{const d=await restoreArtifactVersion(token,artifact.id,version);onArtifactChange?.({id:d.id,version:d.version,name:d.name,files:d.files});}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function saveManual(){if(!artifact.id||!dirty)return;setBusy(true);setError("");try{const d=await saveArtifactFile(token,artifact.id,selected.path,draft);onArtifactChange?.({id:d.id,version:d.version,name:d.name,files:d.files});}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function downloadReadme(){try{const r=await generateProjectReadme(token,artifact.id);downloadBlob(r.filename,new Blob([r.content],{type:"text/markdown;charset=utf-8"}));}catch(e){setError(e.message);}}
  async function downloadChanged(){try{const r=await getVersionChanges(token,artifact.id,artifact.version||1);if(!r.files?.length){setError("Esta versão não possui arquivos criados/alterados para exportar.");return;}downloadBlob(`${safeProjectName(artifact.name)}-v${artifact.version}-alterados.zip`,makeZip(r.files));}catch(e){setError(e.message);}}

  return <section className="artifact-workspace flex min-w-0 flex-col border-l border-line bg-panel/95 w-[46%] min-w-[420px] max-w-[760px] max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:h-[100dvh] max-lg:w-screen max-lg:max-w-none max-lg:min-w-0">
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-line px-2 sm:px-3 py-2">
      <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-display font-semibold text-paper">{artifact.name}</p>{artifact.id&&<span className="rounded bg-neon/10 px-1.5 py-0.5 text-[10px] font-mono text-neon">v{artifact.version||1}</span>}{dirty&&<span className="text-[10px] text-amber-300">● não salvo</span>}</div><p className="text-[11px] font-mono text-mist">{files.length} arquivo(s)</p></div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        {artifact.id&&versions.length>0&&<div className="relative flex items-center"><History size={14} className="pointer-events-none absolute left-2 text-mist"/><select disabled={busy} value={artifact.version||1} onChange={e=>openVersion(Number(e.target.value))} className="max-w-[210px] rounded-lg border border-line bg-panel2 py-1.5 pl-7 pr-2 text-xs text-paper outline-none">{versions.map(v=><option key={v.version} value={v.version}>v{v.version} — {v.summary||"versão"}</option>)}</select></div>}
        {artifact.id&&versions.length>1&&<button disabled={busy} onClick={()=>restore(artifact.version||1)} className="rounded-lg p-2 text-mist hover:bg-panel2 hover:text-paper" title="Restaurar versão"><RotateCcw size={15}/></button>}
        {artifact.id&&<button onClick={downloadReadme} className="rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-panel2 hover:text-paper">README</button>}
        {artifact.id&&<button onClick={downloadChanged} className="rounded-lg px-2 py-1.5 text-xs text-mist hover:bg-panel2 hover:text-paper">Δ ZIP</button>}
        <button onClick={()=>downloadProject(artifact)} className="rounded-lg p-2 text-mist hover:bg-panel2 hover:text-paper" title="Baixar ZIP"><FolderArchive size={16}/></button><button onClick={onClose} className="rounded-lg p-2 text-mist hover:bg-panel2 hover:text-paper"><X size={17}/></button>
      </div>
    </header>
    {error&&<div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
    <div className="flex min-h-0 flex-1">
      <aside className="w-28 sm:w-36 xl:w-40 shrink-0 overflow-y-auto border-r border-line bg-ink/20 p-2">{files.map(file=><button key={file.path} onClick={()=>{if(dirty&&!confirm("Descartar alteração não salva?"))return;setSelectedPath(file.path);setTab("code");}} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-mono ${selected.path===file.path?"bg-neon/15 text-neon":"text-mist hover:bg-panel2 hover:text-paper"}`}><FileCode2 size={13}/><span className="truncate">{file.path}</span></button>)}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-1 border-b border-line px-2 sm:px-3"><div className="flex items-center gap-1"><button onClick={()=>setTab("code")} className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${tab==="code"?"bg-neon/15 text-neon":"text-mist"}`}><Code2 size={14}/>Código</button><button onClick={()=>setTab("preview")} className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${tab==="preview"?"bg-neon/15 text-neon":"text-mist"}`}><Eye size={14}/>Preview</button></div><div className="flex items-center gap-1">{tab==="code"&&artifact.id&&<button disabled={!dirty||busy} onClick={saveManual} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-mist enabled:hover:bg-panel2 enabled:hover:text-paper disabled:opacity-40"><Save size={14}/>Salvar v{(versions[0]?.version||artifact.version||1)+1}</button>}<button onClick={()=>downloadFile(selected)} className="rounded-md p-1.5 text-mist hover:bg-panel2 hover:text-paper" title="Baixar arquivo"><Download size={14}/></button></div></div>
        <div className="min-h-0 flex-1 bg-[#06101f]">
          {tab==="code"?<Editor height="100%" path={selected.path} language={languageFor(selected)} value={draft} onChange={v=>setDraft(v??"")} theme="vs-dark" options={{fontSize:13,fontFamily:"'Cascadia Code','Fira Code',Consolas,monospace",fontLigatures:true,minimap:{enabled:false},wordWrap:"off",automaticLayout:true,scrollBeyondLastLine:false,padding:{top:14,bottom:14},renderLineHighlight:"all",smoothScrolling:true}}/>:<iframe title={`Preview ${artifact.name}`} sandbox="allow-scripts allow-forms allow-modals" srcDoc={previewDocument(files.map(f=>f.path===selected.path?{...f,content:draft}:f))} className="h-full w-full border-0 bg-white"/>}
        </div>
      </div>
    </div>
  </section>;
}
