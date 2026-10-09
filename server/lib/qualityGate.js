import path from 'node:path';
import { builtinModules } from 'node:module';
const builtins=new Set(builtinModules.map(x=>x.replace(/^node:/,'')));
const extensions=['','.js','.jsx','.ts','.tsx','.mjs','.cjs','.json','.css','.scss','.svg','.png','.jpg','.webp','/index.js','/index.jsx','/index.ts','/index.tsx'];
const cleanPath=s=>path.posix.normalize(String(s||'').replaceAll('\\','/').replace(/^\.\//,''));
const isSafe=p=>p && !p.startsWith('/') && !p.startsWith('../') && p!=='..' && !/^[a-z]:/i.test(p) && !p.includes('\0');
const packageName=s=>s.startsWith('@')?s.split('/').slice(0,2).join('/'):s.split('/')[0];
export function inspectProjectFiles(files=[]){
 const issues=[], warnings=[];
 if(!Array.isArray(files))return {ok:false,issues:['Lista de arquivos inválida'],warnings};
 const map=new Map();
 for(const f of files){
  const p=cleanPath(f?.path);
  if(!isSafe(p)){issues.push(`Caminho inseguro: ${String(f?.path||'').slice(0,120)}`);continue;}
  if(map.has(p))issues.push(`Arquivo duplicado: ${p}`);
  else map.set(p,String(f?.content||''));
 }
 let pkg=null;
 if(map.has('package.json')){
  try{pkg=JSON.parse(map.get('package.json'));if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))issues.push('package.json não é objeto JSON');}
  catch{issues.push('package.json contém JSON inválido');}
 }
 const declared=new Set([...Object.keys(pkg?.dependencies||{}),...Object.keys(pkg?.devDependencies||{}),...Object.keys(pkg?.optionalDependencies||{})]);
 for(const [filename,content] of map){
  if(!/\.(?:[cm]?js|jsx|ts|tsx)$/.test(filename))continue;
  const imports=new Set();
  const rx=/(?:\bimport\s*(?:[\s\S]*?\s+from\s*)?|\bexport\s+(?:\*|\{[^}]*\})\s+from\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["'`]([^"'`]+)["'`]/g;
  let m;while((m=rx.exec(content)))imports.add(m[1]);
  for(const spec of imports){
   if(spec.startsWith('.')){
    const target=path.posix.normalize(path.posix.join(path.posix.dirname(filename),spec));
    if(!isSafe(target)){issues.push(`${filename}: import fora do projeto: ${spec}`);continue;}
    if(!extensions.some(ext=>map.has(target+ext)))warnings.push(`${filename}: import local não encontrado: ${spec}`);
   }else if(!spec.startsWith('/')&&!spec.startsWith('#')&&!spec.startsWith('node:')&&!builtins.has(spec.split('/')[0])&&!spec.startsWith('@/')&&!spec.startsWith('~/')&&!spec.startsWith('virtual:')&&!spec.startsWith('vite/')){
    const name=packageName(spec);
    if(pkg && !declared.has(name) && !['react/jsx-runtime','react/jsx-dev-runtime'].includes(spec))warnings.push(`${filename}: dependência não declarada: ${name}`);
   }
  }
 }
 if(pkg?.scripts){for(const [name,cmd] of Object.entries(pkg.scripts)){
  if(typeof cmd!=='string')warnings.push(`package.json: script ${name} não é texto`);
 }}
 return {ok:issues.length===0,issues:[...new Set(issues)],warnings:[...new Set(warnings)],filesChecked:map.size};
}
