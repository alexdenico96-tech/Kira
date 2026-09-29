import { createHash } from "crypto";
import zlib from "zlib";

export function inferProjectMetadata(name, files=[]) {
  const paths=files.map(f=>String(f.path||"").toLowerCase());
  const stack=[];
  const add=x=>{if(!stack.includes(x))stack.push(x);};
  if(paths.some(p=>p.endsWith(".html")))add("html");
  if(paths.some(p=>p.endsWith(".css")))add("css");
  if(paths.some(p=>p.endsWith(".js")))add("javascript");
  if(paths.some(p=>p.endsWith(".jsx")))add("react");
  if(paths.some(p=>p.endsWith(".ts")||p.endsWith(".tsx")))add("typescript");
  if(paths.some(p=>p.endsWith(".py")))add("python");
  const entryPoint=paths.includes("index.html")?"index.html":files.find(f=>/^(src\/)?(app|index|main)\.(jsx?|tsx?)$/i.test(f.path))?.path||files[0]?.path||null;
  return {description:`Projeto ${name||"Artifact"}`,stack,entryPoint};
}

export function normalizeForCache(text=""){
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").replace(/[^\p{L}\p{N}\s]/gu,"").trim();
}
export function cacheFingerprint(text=""){return createHash("sha256").update(normalizeForCache(text)).digest("hex");}
export function tokenSet(text=""){return new Set(normalizeForCache(text).split(" ").filter(x=>x.length>2));}
export function similarity(a,b){
  const A=tokenSet(a),B=tokenSet(b); if(!A.size||!B.size)return 0;
  let inter=0;for(const x of A)if(B.has(x))inter++;
  return inter/(A.size+B.size-inter);
}

export function applyFileOperations(files=[], operations=[]){
  const map=new Map(files.map(f=>[f.path,{...f}]));
  const manifest={created:[],updated:[],deleted:[]};
  for(const op of operations){
    const path=String(op?.path||"").replace(/^\/+/,"").trim(); if(!path)continue;
    if(op.action==="delete"){if(map.delete(path))manifest.deleted.push(path);continue;}
    if((op.action==="create"||op.action==="update")&&typeof op.content==="string"){
      const existed=map.has(path); map.set(path,{path,content:op.content,language:op.language||map.get(path)?.language||""});
      (existed?manifest.updated:manifest.created).push(path);
    }
  }
  return {files:[...map.values()],manifest};
}

export function generateReadme(project){
  const stack=(project.stack||[]).join(", ")||"não detectada";
  const files=(project.files||[]).map(f=>`- \`${f.path}\``).join("\n");
  return `# ${project.name}\n\n${project.description||""}\n\n## Stack\n\n${stack}\n\n## Arquivo principal\n\n\`${project.entryPoint||"não detectado"}\`\n\n## Estrutura\n\n${files||"- Nenhum arquivo"}\n`;
}

// Leitor ZIP suficiente para ZIPs comuns (store/deflate), sem dependência npm.
export function readZip(buffer){
  const out=[]; let p=0;
  while(p+30<=buffer.length && buffer.readUInt32LE(p)===0x04034b50){
    const flags=buffer.readUInt16LE(p+6),method=buffer.readUInt16LE(p+8),csize=buffer.readUInt32LE(p+18),usize=buffer.readUInt32LE(p+22);
    const nlen=buffer.readUInt16LE(p+26),elen=buffer.readUInt16LE(p+28);
    if(flags&0x08) throw new Error("ZIP com data descriptor não suportado nesta importação.");
    const name=buffer.subarray(p+30,p+30+nlen).toString("utf8");
    const start=p+30+nlen+elen,end=start+csize; if(end>buffer.length)throw new Error("ZIP truncado.");
    if(!name.endsWith("/")){
      const raw=buffer.subarray(start,end);
      const data=method===0?raw:method===8?zlib.inflateRawSync(raw):null;
      if(!data)throw new Error(`Compressão ZIP ${method} não suportada.`);
      if(data.length!==usize && usize!==0) throw new Error("Tamanho ZIP inválido.");
      out.push({path:name.replace(/^\/+/,""),content:data.toString("utf8"),language:""});
    }
    p=end;
  }
  return out;
}
