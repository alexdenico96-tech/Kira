import dotenv from "dotenv";
dotenv.config();

const states = new Map();
const inflight = new Map();
const FAILURE_WINDOW_MS = Number(process.env.AI_PROVIDER_COOLDOWN_MS || 10 * 60 * 1000);

function enabled(name){
  if(name==="cloudflare") return Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
  if(name==="mistral") return Boolean(process.env.MISTRAL_API_KEY);
  if(name==="openrouter") return Boolean(process.env.OPENROUTER_API_KEY);
  return false;
}
function cooling(name){return (states.get(name)?.until||0)>Date.now();}
function fail(name,status){if(status===429 || status>=500) states.set(name,{until:Date.now()+FAILURE_WINDOW_MS,status});}
function ok(name){states.delete(name);}

function config(name){
  if(name==="cloudflare") return {
    url:`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    key:process.env.CLOUDFLARE_API_TOKEN,
    model:process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.1-8b-instruct",
    headers:{}
  };
  if(name==="mistral") return {
    url:"https://api.mistral.ai/v1/chat/completions",key:process.env.MISTRAL_API_KEY,
    model:process.env.MISTRAL_MODEL || "mistral-small-latest",headers:{}
  };
  if(name==="openrouter") return {
    url:"https://openrouter.ai/api/v1/chat/completions",key:process.env.OPENROUTER_API_KEY,
    model:process.env.OPENROUTER_MODEL || "openrouter/free",headers:{
      ...(process.env.APP_URL?{"HTTP-Referer":process.env.APP_URL}:{}),"X-OpenRouter-Title":"Kira","X-OpenRouter-Cache":"true"
    }
  };
  return null;
}

export function extraProviderStatus(){
  return ["cloudflare","mistral","openrouter"].map(name=>({name,enabled:enabled(name),cooling:cooling(name),retryAt:states.get(name)?.until||null}));
}

export async function callExtraProvider(name,{systemInstruction,message,maxTokens=900}){
  if(!enabled(name) || cooling(name)) { const e=new Error(`${name} indisponível.`); e.code="provider_unavailable"; throw e; }
  const c=config(name); const body={model:c.model,messages:[{role:"system",content:systemInstruction},{role:"user",content:message}],temperature:0.35,max_tokens:maxTokens};
  if(name==="cloudflare") body.options={rejectIfBusy:true};
  const key=`${name}:${c.model}:${message}`;
  if(inflight.has(key)) return inflight.get(key);
  const job=(async()=>{
    const started=Date.now();
    console.info(`[kira-provider] provider=${name} event=start model=${c.model}`);
    try {
    const res=await fetch(c.url,{method:"POST",headers:{Authorization:`Bearer ${c.key}`,"Content-Type":"application/json",...c.headers},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(2000,Number(process.env.KIRA_EXTRA_TIMEOUT_MS||6500)))});
    if(!res.ok){const txt=await res.text();fail(name,res.status);const e=new Error(`${name} (${res.status}): ${txt.slice(0,500)}`);e.status=res.status;throw e;}
    const data=await res.json();ok(name);
    const content=data.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim())throw new Error(`${name} respondeu sem texto.`);
    console.info(`[kira-provider] provider=${name} status=200 duration_ms=${Date.now()-started}`);
    return {text:content.trim(),provider:name,model:data.model||c.model,usage:data.usage||null};
    } catch(err) {
      console.warn(`[kira-provider] provider=${name} status=${err.status||err.name||"error"} duration_ms=${Date.now()-started} message=${String(err.message||"").slice(0,180)}`);
      throw err;
    }
  })().finally(()=>inflight.delete(key));
  inflight.set(key,job);return job;
}

export async function callExtraPool(args,{order=(process.env.EXTRA_PROVIDER_ORDER||"cloudflare,mistral,openrouter").split(",").map(x=>x.trim()).filter(Boolean),maxAttempts=2}={}){
  const errors=[];
  for(const name of order){
    if(!enabled(name)||cooling(name)){
      console.info(`[kira-router] provider=${name} skipped=${!enabled(name)?"not_configured":"cooldown"}`);
      continue;
    }
    try{return await callExtraProvider(name,args);}catch(e){errors.push(`${name}: ${e.message}`);if(errors.length>=maxAttempts)break;}
  }
  const e=new Error(errors.join(" | ")||"Nenhum provedor extra configurado/disponível.");e.code="no_extra_provider";throw e;
}
