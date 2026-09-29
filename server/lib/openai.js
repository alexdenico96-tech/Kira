import dotenv from "dotenv";
dotenv.config();
export const OPENAI_ENABLED = Boolean(process.env.OPENAI_API_KEY);

export async function callOpenAIText({ systemInstruction, message, model=process.env.OPENAI_SMALL_MODEL || "gpt-4o-mini", maxTokens=1200 }) {
  if (!OPENAI_ENABLED) { const e=new Error("OpenAI não configurada."); e.code="not_configured"; throw e; }
  const res=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json",Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
    body:JSON.stringify({model,messages:[{role:"system",content:systemInstruction},{role:"user",content:message}],temperature:0.4,max_tokens:maxTokens})
  });
  if(!res.ok){const body=await res.text();const e=new Error(`OpenAI (${model}) falhou: ${body}`);e.status=res.status;throw e;}
  const data=await res.json();
  return data.choices?.[0]?.message?.content?.trim()||"";
}
