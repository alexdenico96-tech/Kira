import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { signToken, requireAuth } from "./lib/auth.js";
import { sendEmail, resetPasswordEmailHtml } from "./lib/email.js";
import { checkUserRateLimit, hasDailyBudget, consumeDailyBudget, getUserUsage, getDailyUsage } from "./lib/rateLimit.js";
import { callGemini, buildPollinationsUrl, callHomeAssistant, HOME_ASSISTANT_ENABLED, GEMINI_MODEL } from "./lib/gemini.js";
import { callGroqFallback, callGroqArtifactFallback, callGroqArtifactUpdateFallback, GROQ_ENABLED } from "./lib/groq.js";
import { callOpenAIText, OPENAI_ENABLED } from "./lib/openai.js";
import { callExtraPool, extraProviderStatus } from "./lib/extraProviders.js";
import { routeRequest, estimateChars } from "./lib/modelRouter.js";
import { inferProjectMetadata, normalizeForCache, cacheFingerprint, similarity, applyFileOperations, generateReadme, readZip } from "./lib/projectUtils.js";
import { validateArtifact, repairWebConnections, artifactSuccessReply, artifactQualityPrompt } from "./lib/artifactQuality.js";
import {
  initStore,
  findUserByUsername,
  findUserByEmail,
  createUser,
  createPasswordResetToken,
  findUserByValidResetToken,
  clearPasswordResetToken,
  updatePassword,
  listConversations,
  getConversation,
  createConversation,
  appendMessages,
  deleteConversation,
  deleteAllConversations,
  createFeedback,
  createArtifactVersioned,
  getArtifact,
  listArtifactVersions,
  addArtifactVersion,
  restoreArtifactVersion,
  updateProjectMetadata,
  listProjects,
  findProjectMention,
  setActiveProject,
  getActiveProject,
  getCachedResponse,
  findRecentCacheCandidates,
  putCachedResponse,
  saveVersionWithOperations,
  getVersionChanges
} from "./lib/store.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const SYSTEM_PROMPT = `Você é Kira, assistente de IA direta, cuidadosa e excelente em programação. Responda no idioma da última mensagem.
Conversa: responda de forma útil e concisa.
Código novo: use create_document. Entregue TODOS os arquivos necessários, completos e conectados entre si. Nunca entregue uma versão mínima quando o usuário pediu um projeto completo.
Sites HTML/CSS/JS: por padrão use index.html + style.css + script.js separados; index.html deve importar ambos corretamente. Classes, IDs, caminhos e eventos precisam ser coerentes entre os três arquivos. Revise mentalmente o projeto antes de finalizar.
Projeto existente: use update_artifact; retorne só operações create/update/delete necessárias, nunca arquivos intactos. Preserve a stack.
Não anuncie genericamente "criei uma landing page". O servidor apresentará a lista exata dos arquivos criados.
Imagens: use generate_image quando pedirem geração. Home Assistant: só use control_device quando pedido.
Markdown puro; sem HTML decorativo.`;

const CURRENT_TERMS_VERSION = "2026-10-04-v1";
const CURRENT_DISCLAIMER_VERSION = "2026-10-04-v1";
const CURRENT_TERMS_HASH = "2dd656314486e1e5125440606172ba1c34eb4620efa277908dd35f4aaf58ed64";
const CURRENT_DISCLAIMER_HASH = "499eef9ed4cc74b5f16d5f2d4a66a9434875772a9d06bb5c103114ee4eb7867d";

function publicUser(user) {
  return { id: user.id, username: user.username };
}

// ---------- Auth ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, termsAccepted, disclaimerAccepted, termsVersion, disclaimerVersion } = req.body;
    if (!username || !email || !password || password.length < 6) {
      return res.status(400).json({ error: "Usuário, e-mail e senha com no mínimo 6 caracteres são obrigatórios." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }

    if (termsAccepted !== true || disclaimerAccepted !== true) {
      return res.status(400).json({ error: "É necessário ler e aceitar os Termos e o Aviso Legal para criar uma conta." });
    }
    if (termsVersion !== CURRENT_TERMS_VERSION || disclaimerVersion !== CURRENT_DISCLAIMER_VERSION) {
      return res.status(409).json({ error: "Os documentos legais foram atualizados. Recarregue a página, leia a versão atual e confirme novamente." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await createUser({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        passwordHash,
        legal: {
          termsVersion: CURRENT_TERMS_VERSION,
          disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
          termsHash: CURRENT_TERMS_HASH,
          disclaimerHash: CURRENT_DISCLAIMER_HASH,
          userAgent: String(req.get("user-agent") || "").slice(0, 500)
        }
      });
    } catch (err) {
      if (err.message === "USERNAME_TAKEN") return res.status(409).json({ error: "Esse nome de usuário já existe. Escolha outro." });
      if (err.message === "EMAIL_TAKEN") return res.status(409).json({ error: "Esse e-mail já está cadastrado." });
      throw err;
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar conta." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await findUserByUsername(username || "");
    if (!user) return res.status(401).json({ error: "Usuário ou senha inválidos." });
    const ok = await bcrypt.compare(password || "", user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Usuário ou senha inválidos." });
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao entrar." });
  }
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));

// Recuperação de senha por link enviado ao e-mail cadastrado.
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const user = email ? await findUserByEmail(email) : null;

    // Resposta genérica para não revelar se um e-mail está cadastrado.
    if (user) {
      const token = await createPasswordResetToken(user.id);
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
      await sendEmail({
        to: user.email,
        subject: "Redefina sua senha na Kira",
        html: resetPasswordEmailHtml(appUrl, token)
      });
    }

    res.json({ ok: true, message: "Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui enviar o link de recuperação agora." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Link inválido ou nova senha com menos de 6 caracteres." });
    }

    const user = await findUserByValidResetToken(token);
    if (!user) {
      return res.status(400).json({ error: "Este link é inválido ou expirou. Solicite um novo link." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await updatePassword(user.id, passwordHash);
    await clearPasswordResetToken(user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui redefinir sua senha agora." });
  }
});

// ---------- Conversations ----------

app.get("/api/conversations", requireAuth, async (req, res) => {
  res.json(await listConversations(req.user.id));
});

app.get("/api/conversations/:id", requireAuth, async (req, res) => {
  const conv = await getConversation(req.user.id, req.params.id);
  if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });
  res.json(conv);
});

app.delete("/api/conversations/:id", requireAuth, async (req, res) => {
  await deleteConversation(req.user.id, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/conversations", requireAuth, async (req, res) => {
  await deleteAllConversations(req.user.id);
  res.json({ ok: true });
});

// ---------- Usage & Feedback ----------

app.get("/api/usage", requireAuth, (req, res) => {
  res.json({ user: getUserUsage(req.user.id), daily: getDailyUsage() });
});

app.post("/api/feedback", requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Escreva algo antes de enviar." });
    await createFeedback(req.user.id, req.user.username, message.trim().slice(0, 2000));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui salvar seu comentário agora." });
  }
});

function trimHistory(history, { maxMessages = 8, maxCharsPerMessage = 2000 } = {}) {
  return history.slice(-maxMessages).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.length > maxCharsPerMessage ? m.content.slice(0, maxCharsPerMessage) + "…" : m.content }]
  }));
}

function friendlyGeminiError(err) {
  if (err.code === "missing_key") return "GEMINI_API_KEY não configurada.";
  if (err.status === 429 || err.code === "RESOURCE_EXHAUSTED") return "Limite gratuito do Gemini atingido por agora.";
  if (err.status === 401 || err.status === 403) return "Chave da API Gemini rejeitada.";
  if (err.status === 404) return "Modelo Gemini configurado não existe — tente GEMINI_MODEL=gemini-flash-latest.";
  return "Não consegui falar com a IA agora.";
}


// ---------- Persistent projects / exports ----------

app.get("/api/projects", requireAuth, async (req,res)=>res.json(await listProjects(req.user.id)));

app.get("/api/projects/:id/readme", requireAuth, async (req,res)=>{
  const p=await getArtifact(req.user.id,req.params.id);
  if(!p)return res.status(404).json({error:"Projeto não encontrado."});
  res.json({filename:"README.md",content:generateReadme(p)});
});

app.get("/api/projects/:id/changes/:version", requireAuth, async (req,res)=>{
  const v=await getVersionChanges(req.user.id,req.params.id,Number(req.params.version));
  if(!v)return res.status(404).json({error:"Versão não encontrada."});
  const changed=new Set([...(v.changeManifest?.created||[]),...(v.changeManifest?.updated||[])]);
  res.json({summary:v.summary,changeManifest:v.changeManifest,files:(v.files||[]).filter(f=>changed.has(f.path))});
});

app.post("/api/projects/import-zip", requireAuth, async (req,res)=>{
  const {name,zipBase64}=req.body||{};
  if(!zipBase64)return res.status(400).json({error:"ZIP ausente."});
  const files=readZip(Buffer.from(zipBase64,"base64"));
  if(!files.length)return res.status(400).json({error:"ZIP sem arquivos de texto válidos."});
  let conv=await createConversation(req.user.id,`Projeto ${name||"importado"}`);
  const created=await createArtifactVersioned(req.user.id,conv.id,name||"projeto-importado",files,"Importação ZIP");
  const meta=inferProjectMetadata(created.name,files); await updateProjectMetadata(req.user.id,created.id,meta); await setActiveProject(req.user.id,conv.id,created.id);
  res.json({...created,...meta,conversationId:conv.id});
});

app.post("/api/projects/:id/github-export", requireAuth, async (req,res)=>{
  if(!process.env.GITHUB_TOKEN)return res.status(400).json({error:"GITHUB_TOKEN não configurado no servidor."});
  const {owner,repo,branch="main"}=req.body||{}; if(!owner||!repo)return res.status(400).json({error:"owner e repo são obrigatórios."});
  const p=await getArtifact(req.user.id,req.params.id); if(!p)return res.status(404).json({error:"Projeto não encontrado."});
  const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  for(const f of p.files){
    const url=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${f.path.split("/").map(encodeURIComponent).join("/")}`;
    let sha; const old=await fetch(`${url}?ref=${encodeURIComponent(branch)}`,{headers}); if(old.ok)sha=(await old.json()).sha;
    const r=await fetch(url,{method:"PUT",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({message:`Kira: export ${p.name} v${p.version}`,content:Buffer.from(f.content).toString("base64"),branch,...(sha?{sha}:{})})});
    if(!r.ok)return res.status(502).json({error:`GitHub recusou ${f.path}: ${await r.text()}`});
  }
  res.json({ok:true,files:p.files.length});
});

app.post("/api/projects/github-import", requireAuth, async (req,res)=>{
  if(!process.env.GITHUB_TOKEN)return res.status(400).json({error:"GITHUB_TOKEN não configurado no servidor."});
  const {owner,repo,branch="main"}=req.body||{}; if(!owner||!repo)return res.status(400).json({error:"owner e repo são obrigatórios."});
  const headers={Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"};
  const treeRes=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,{headers});
  if(!treeRes.ok)return res.status(502).json({error:`GitHub: ${await treeRes.text()}`});
  const tree=(await treeRes.json()).tree||[]; const files=[];
  for(const item of tree.filter(x=>x.type==="blob"&&x.size<=300000).slice(0,100)){
    const r=await fetch(item.url,{headers}); if(!r.ok)continue; const blob=await r.json();
    try{files.push({path:item.path,content:Buffer.from(blob.content||"","base64").toString("utf8"),language:""});}catch{}
  }
  const conv=await createConversation(req.user.id,`GitHub ${repo}`);
  const created=await createArtifactVersioned(req.user.id,conv.id,repo,files,"Importação GitHub");
  const meta=inferProjectMetadata(repo,files); await updateProjectMetadata(req.user.id,created.id,meta); await setActiveProject(req.user.id,conv.id,created.id);
  res.json({...created,...meta,conversationId:conv.id});
});

// ---------- Artifact versions ----------

function selectRelevantArtifactFiles(files, request, maxFiles = 4) {
  const all = Array.isArray(files) ? files : [];
  const q = String(request || "").toLowerCase();
  const exact = all.filter(f => q.includes(String(f.path).toLowerCase()) || q.includes(String(f.path).split("/").pop().toLowerCase()));
  if (exact.length) return exact.slice(0, maxFiles);

  const wanted = new Set();
  const addBy = re => all.filter(f => re.test(f.path.toLowerCase())).forEach(f => wanted.add(f));
  if (/css|estilo|style|cor|color|fonte|layout|visual|design|hero|bot[aã]o|responsiv/.test(q)) addBy(/\.(css|scss|sass|less)$/);
  if (/html|texto|conte[uú]do|hero|header|footer|formul[aá]rio|se[cç][aã]o|link/.test(q)) addBy(/\.(html|htm|jsx|tsx|vue|svelte)$/);
  if (/javascript|js|fun[cç][aã]o|click|evento|valida|l[oó]gica|api|fetch|intera[cç]/.test(q)) addBy(/\.(js|jsx|ts|tsx)$/);
  if (/react|componente|component/.test(q)) addBy(/\.(jsx|tsx)$/);
  if (/config|depend[eê]ncia|package/.test(q)) addBy(/(^|\/)package\.json$|\.config\./);

  if (!wanted.size) {
    for (const f of all) {
      if (/\.(html|jsx|tsx|vue|svelte)$/.test(f.path.toLowerCase())) wanted.add(f);
      if (wanted.size >= 2) break;
    }
  }
  return [...wanted].slice(0, maxFiles);
}

function artifactEditPrompt(artifact, request) {
  const relevant = selectRelevantArtifactFiles(artifact.files, request);
  const manifest = artifact.files.map(f => f.path).join("\n");
  const context = relevant.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
  return `Projeto existente: ${artifact.name}
Versão atual: v${artifact.version}
Pedido do usuário: ${request}

Arquivos do projeto (manifesto; conteúdo não incluído):
${manifest}

Edite somente o necessário. Abaixo estão os arquivos relevantes disponíveis:
${context}

Retorne update_artifact com SOMENTE operações necessárias:
- update: conteúdo COMPLETO do arquivo alterado;
- create: conteúdo COMPLETO do novo arquivo;
- delete: somente path.
Nunca repita arquivos intactos.`;
}

app.get("/api/artifacts/:id", requireAuth, async (req,res)=>{
  const artifact=await getArtifact(req.user.id,req.params.id,req.query.version?Number(req.query.version):null);
  if(!artifact)return res.status(404).json({error:"Artifact não encontrado."});
  res.json({id:artifact.id,name:artifact.name,version:artifact.version,files:artifact.files,summary:artifact.summary});
});
app.get("/api/artifacts/:id/versions", requireAuth, async (req,res)=>{
  res.json(await listArtifactVersions(req.user.id,req.params.id));
});
app.post("/api/artifacts/:id/restore", requireAuth, async (req,res)=>{
  const artifact=await restoreArtifactVersion(req.user.id,req.params.id,Number(req.body.version));
  if(!artifact)return res.status(404).json({error:"Artifact ou versão não encontrado."});
  res.json(artifact);
});

app.get("/api/ai/providers", requireAuth, (req,res)=>{
  res.json({extras:extraProviderStatus(),openai:OPENAI_ENABLED,groq:GROQ_ENABLED,gemini:true});
});

app.post("/api/artifacts/:id/manual-save", requireAuth, async (req,res)=>{
  try{
    const {path:changedPath,content}=req.body||{};
    if(!changedPath||typeof content!=="string")return res.status(400).json({error:"path e content são obrigatórios."});
    const current=await getArtifact(req.user.id,req.params.id);
    if(!current)return res.status(404).json({error:"Artifact não encontrado."});
    const applied=applyFileOperations(current.files,[{action:current.files.some(f=>f.path===changedPath)?"update":"create",path:changedPath,content}]);
    const updated=await saveVersionWithOperations(req.user.id,current.id,applied.files,`Edição manual: ${changedPath}`,applied.manifest);
    res.json(updated);
  }catch(err){console.error(err);res.status(500).json({error:"Não consegui salvar a edição manual."});}
});

// ---------- Chat (Kira) ----------

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { message, conversationId, image, audio, artifactId } = req.body;
    if ((!message || typeof message !== "string") && !image && !audio) {
      return res.status(400).json({ error: "Envie uma mensagem, uma imagem ou um áudio." });
    }

    const rl = checkUserRateLimit(req.user.id);
    if (!rl.allowed) {
      return res.status(429).json({ error: `Você atingiu o limite de mensagens por enquanto. Tente de novo em ${rl.resetInMinutes} minuto(s).` });
    }
    if (!hasDailyBudget()) {
      return res.status(429).json({ error: "O app atingiu o limite diário de uso gratuito da IA. Tente novamente amanhã." });
    }

    const textMessage = message || (image ? "Descreva essa imagem." : "Ouça esse áudio e responda.");

    let conv = conversationId ? await getConversation(req.user.id, conversationId) : null;
    if (!conv) {
      const title = textMessage.length > 48 ? textMessage.slice(0, 48) + "…" : textMessage;
      conv = await createConversation(req.user.id, title);
    }

    const history = trimHistory(conv.messages);
    const active = conv?.id ? await getActiveProject(req.user.id, conv.id) : null;
    const mentioned = message ? await findProjectMention(req.user.id, message) : null;
    const resolvedArtifactId = artifactId || mentioned?.id || active?.artifactId || null;
    const existingArtifact = resolvedArtifactId ? await getArtifact(req.user.id, resolvedArtifactId) : null;
    const editingArtifact = Boolean(existingArtifact && message && typeof message === "string");
    const wantsArtifact = /(?:cria|crie|criar|gera|gere|gerar|faça|fazer|monte|montar|desenvolva|desenvolver|entregue|quero|preciso|arquivo|arquivos|artifact|projeto|site|landing page|html|css|javascript|react|código|codigo)/i.test(textMessage)
      && /(?:arquivo|arquivos|artifact|projeto|site|landing page|html|css|javascript|react|código|codigo|download|baixar|pasta)/i.test(textMessage);
    const currentParts = [{ text: textMessage }];
    if (image?.data) currentParts.push({ inlineData: { mimeType: image.mimeType || "image/jpeg", data: image.data } });
    if (audio?.data) currentParts.push({ inlineData: { mimeType: audio.mimeType || "audio/webm", data: audio.data } });
    const contents = [...history, { role: "user", parts: currentParts }];

    const route = routeRequest({message:textMessage,image,audio,editingArtifact,wantsArtifact,projectChars:estimateChars(existingArtifact?.files||[])});

    // Cache conservador: apenas conversa simples, sem anexos/projeto. Exact match + similaridade muito alta.
    if(route.task==="chat_small" && !image && !audio){
      const fp=cacheFingerprint(textMessage);
      let cached=await getCachedResponse(fp);
      if(!cached){
        const candidates=await findRecentCacheCandidates(30);
        const hit=candidates.find(c=>similarity(textMessage,c.normalizedPrompt)>=0.96);
        if(hit)cached=hit;
      }
      if(cached){
        await appendMessages(req.user.id,conv.id,[{role:"user",content:textMessage},{role:"assistant",content:cached.response}]);
        return res.json({conversationId:conv.id,title:conv.title,reply:cached.response,cacheHit:true,route});
      }
    }

    consumeDailyBudget();

    let reply, imageUrl, documentName, documentContent, artifactName, artifactFiles, responseArtifactId, artifactVersion;
    let usedFallback = false;

    try {
      if(route.task==="chat_small" && !editingArtifact && !wantsArtifact && !image && !audio){
        try{
          const extra=await callExtraPool({systemInstruction:SYSTEM_PROMPT,message:textMessage,maxTokens:700});
          reply=extra.text; route.selectedProvider=extra.provider; route.selectedModel=extra.model;
        }catch(extraErr){
          if(extraErr.code!=="no_extra_provider") console.warn("[router] provedores extras indisponíveis:",extraErr.message);
        }
      }
      if(!reply && route.task==="chat_small" && route.providers[0]?.provider==="openai" && OPENAI_ENABLED){
        reply=await callOpenAIText({systemInstruction:SYSTEM_PROMPT,message:textMessage,model:route.providers[0].model,maxTokens:900});
        route.selectedProvider="openai"; route.selectedModel=route.providers[0].model;
      }
      const aiContents = editingArtifact
        ? [{ role: "user", parts: [{ text: artifactEditPrompt(existingArtifact, textMessage) }] }]
        : (wantsArtifact
          ? [...history, { role: "user", parts: [{ text: artifactQualityPrompt(textMessage) }] }]
          : contents);
      const data = reply ? null : await callGemini({
        systemInstruction: SYSTEM_PROMPT,
        contents: aiContents,
        forceFunctionName: editingArtifact ? "update_artifact" : (wantsArtifact ? "create_document" : undefined)
      });
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCall = parts.find((p) => p.functionCall)?.functionCall;

      if (functionCall?.name === "generate_image") {
        const prompt = functionCall.args?.prompt || textMessage;
        imageUrl = buildPollinationsUrl(prompt);
        reply = `Aqui está a imagem que você pediu:\n\n*"${prompt}"*`;
            } else if (functionCall?.name === "update_artifact" && editingArtifact) {
        const args=functionCall.args||{};
        const changes=Array.isArray(args.changes)?args.changes:[];
        const applied=applyFileOperations(existingArtifact.files,changes);
        if(!applied.manifest.created.length&&!applied.manifest.updated.length&&!applied.manifest.deleted.length) throw new Error("Nenhuma alteração válida retornada.");
        const updated=await saveVersionWithOperations(req.user.id,existingArtifact.id,applied.files,args.summary||textMessage.slice(0,160),applied.manifest);
        artifactName=updated.name; artifactFiles=updated.files; responseArtifactId=updated.id; artifactVersion=updated.version;
        reply=`Atualizei **${artifactName}** para a **v${artifactVersion}**.`;
      } else if (functionCall?.name === "create_document") {
        const parseArtifactArgs = (args={}) => ({
          name: args.projectName || "projeto",
          files: Array.isArray(args.files)
            ? args.files.filter(f=>f?.path && typeof f.content==="string" && f.content.trim())
                .map(f=>({path:String(f.path).trim(),content:f.content,language:f.language||""}))
            : []
        });

        let parsed=parseArtifactArgs(functionCall.args||{});
        parsed.files=repairWebConnections(parsed.files);
        let quality=validateArtifact(parsed.files,textMessage);

        // Uma segunda tentativa só quando a primeira realmente falhou no contrato estrutural.
        if(!quality.ok){
          console.warn("[artifact-quality] primeira tentativa rejeitada:", quality.issues.join("; "));
          const retryData=await callGemini({
            systemInstruction:SYSTEM_PROMPT,
            contents:[{role:"user",parts:[{text:artifactQualityPrompt(textMessage,quality.issues)}]}],
            forceFunctionName:"create_document"
          });
          const retryCall=(retryData.candidates?.[0]?.content?.parts||[]).find(p=>p.functionCall)?.functionCall;
          if(retryCall?.name==="create_document") parsed=parseArtifactArgs(retryCall.args||{});
          parsed.files=repairWebConnections(parsed.files);
          quality=validateArtifact(parsed.files,textMessage);
        }

        if(!quality.ok){
          const e=new Error(`Artifact reprovado no controle de qualidade: ${quality.issues.join("; ")}`);
          e.code="artifact_quality_failed";
          throw e;
        }

        artifactName=parsed.name;
        artifactFiles=quality.files;
        reply=artifactSuccessReply(artifactFiles);
      } else if (functionCall?.name === "control_device") {
        const { domain, service, entity_id } = functionCall.args || {};
        try {
          await callHomeAssistant({ domain, service, entity_id });
          reply = `Pronto — executei **${service}** em \`${entity_id}\`.`;
        } catch (err) {
          reply = `Não consegui executar esse comando no Home Assistant: ${err.message}`;
        }
      } else {
        reply = reply || parts.map((p) => p.text).filter(Boolean).join("\n").trim() || "Não consegui gerar uma resposta agora.";
      }
    } catch (err) {
      console.error(`[chat] Gemini falhou (status ${err.status}, code ${err.code}):`, err.message);
      if (GROQ_ENABLED) {
        try {
          if (editingArtifact) {
            const patch = await callGroqArtifactUpdateFallback({ systemInstruction: SYSTEM_PROMPT, message: artifactEditPrompt(existingArtifact, textMessage) });
            const applied=applyFileOperations(existingArtifact.files,patch.changes);
            const updated=await saveVersionWithOperations(req.user.id,existingArtifact.id,applied.files,patch.summary,applied.manifest);
            artifactName=updated.name; artifactFiles=updated.files; responseArtifactId=updated.id; artifactVersion=updated.version;
            reply = `Atualizei **${artifactName}** para a **v${artifactVersion}**.`;
          } else if (wantsArtifact) {
            const artifact = await callGroqArtifactFallback({ systemInstruction: SYSTEM_PROMPT, message: artifactQualityPrompt(textMessage) });
            artifactName = artifact.projectName;
            artifactFiles = repairWebConnections(artifact.files);
            const quality=validateArtifact(artifactFiles,textMessage);
            if(!quality.ok) throw new Error(`Groq Artifact reprovado: ${quality.issues.join("; ")}`);
            artifactFiles=quality.files;
            reply = artifactSuccessReply(artifactFiles);
          } else {
            reply = await callGroqFallback({ systemInstruction: SYSTEM_PROMPT, message: textMessage });
          }
          usedFallback = true;
        } catch (groqErr) {
          console.error("[chat] Groq fallback também falhou:", groqErr.message);
          const errorMessage = wantsArtifact
            ? "Não consegui gerar os arquivos agora porque os serviços de IA estão temporariamente indisponíveis. Tente novamente em alguns instantes."
            : friendlyGeminiError(err);
          return res.status(502).json({ error: errorMessage });
        }
      } else {
        const errorMessage = wantsArtifact
          ? "Não consegui gerar os arquivos agora porque o serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes."
          : friendlyGeminiError(err);
        return res.status(502).json({ error: errorMessage });
      }
    }

    if (artifactFiles?.length && !responseArtifactId) {
      const createdArtifact = await createArtifactVersioned(req.user.id, conv.id, artifactName || "Artifact", artifactFiles, "Criação inicial");
      responseArtifactId = createdArtifact.id;
      artifactVersion = createdArtifact.version;
      const meta=inferProjectMetadata(createdArtifact.name,createdArtifact.files);
      await updateProjectMetadata(req.user.id,createdArtifact.id,meta);
      await setActiveProject(req.user.id,conv.id,createdArtifact.id);
    }

    if(responseArtifactId) await setActiveProject(req.user.id,conv.id,responseArtifactId);
    const hadAttachment = Boolean(image?.data || audio?.data);

    await appendMessages(req.user.id, conv.id, [
      { role: "user", content: textMessage, hadAttachment },
      { role: "assistant", content: reply, imageUrl, documentName, documentContent, artifactName, artifactFiles, artifactId: responseArtifactId, artifactVersion }
    ]);

    if(route.task==="chat_small" && reply && !artifactFiles?.length && !image && !audio){
      await putCachedResponse(cacheFingerprint(textMessage),normalizeForCache(textMessage),reply,route.providers[0]?.model||"fallback");
    }
    res.json({ conversationId: conv.id, title: conv.title, reply, imageUrl, documentName, documentContent, artifactName, artifactFiles, artifactId: responseArtifactId, artifactVersion, usedFallback, route, cacheHit:false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno no servidor.", details: String(err) });
  }
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL, homeAssistant: HOME_ASSISTANT_ENABLED, groqFallback: GROQ_ENABLED })
);

if (process.env.NODE_ENV === "production") {
  const clientDist = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

const PORT = process.env.PORT || 3001;
initStore()
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Falha ao inicializar o armazenamento de dados:", err);
    process.exit(1);
  });
