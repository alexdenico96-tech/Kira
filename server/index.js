// KIRA_GEMINI_DISCOVERY_V1
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import fsp from "node:fs/promises";
import { signToken, requireAuth } from "./lib/auth.js";
import { authLimit } from "./lib/authLimits.js";
import { sendEmail, resetPasswordEmailHtml } from "./lib/email.js";
import { checkUserRateLimit, hasDailyBudget, consumeDailyBudget, getUserUsage, getDailyUsage } from "./lib/rateLimit.js";
import { callGemini, geminiKeyCount, transcribeKiraAudio, callHomeAssistant, HOME_ASSISTANT_ENABLED, GEMINI_MODEL } from "./lib/gemini.js";
import { generateKiraImage } from "./lib/imageGeneration.js";
import { callGroqWebSearch, callGroqJson, callGroqFallback, callGroqArtifactFallback, callGroqArtifactUpdateFallback, callGroqPackageJsonRepair, GROQ_ENABLED } from "./lib/groq.js";
import { callOpenAIText, OPENAI_ENABLED } from "./lib/openai.js";
import { callExtraPool, extraProviderStatus } from "./lib/extraProviders.js";
import { classifyKiraIntent } from "./lib/intentRouter.js";
import { classifyKiraComplexity } from "./lib/complexityRouter.js";
import { routeRequest, estimateChars } from "./lib/modelRouter.js";
import { inferProjectMetadata, normalizeForCache, cacheFingerprint, similarity, applyFileOperations, generateReadme, readZip } from "./lib/projectUtils.js";
import { validateArtifact, repairWebConnections, artifactSuccessReply, artifactQualityPrompt } from "./lib/artifactQuality.js";
import { isComplexProjectRequest, analyzeProject, developerPrompt } from "./lib/developerAgent.js";
import { inspectProjectFiles } from "./lib/qualityGate.js";
import { inspectVisualQuality, repairImageSources } from "./lib/visualQuality.js";
import { designEditGuidance } from "./lib/designDirection.js";
import { rewriteProjectImages, warmProjectImages, getProjectImage, isProjectImageId } from "./lib/projectImages.js";
import { extractRequirements, extractRequirementsHeuristic, verifyRequirements, requirementIssues, requirementsPrompt } from "./lib/requirements.js";
import { progressStream } from "./lib/progressStream.js";
import { inspectReactProject } from "./lib/reactChecks.js";
import { inspectProjectIntegrity, repairMissingDependencies, repairRouterFutureFlags, detectDatabaseRequest, databaseProjectPrompt } from "./lib/projectChecks.js";
import { projectDeliveryMessage } from "./lib/projectDelivery.js";
import { androidAssetLinks } from "./lib/androidApp.js";
import { buildChecklist, checklistBlock, checklistIssues, checklistSize } from "./lib/requestChecklist.js";
import { detectCarouselRequest, detectCarouselFormat, isCarouselEdit, CREATE_CAROUSEL_TOOL, carouselPlannerPrompt, normalizeCarouselSpec, inspectCarousel, fallbackCarousel, FORMATS as CAROUSEL_FORMATS } from "./lib/carousel/spec.js";
import { renderCarousel, measureCarousel, carouselPdf, carouselZip } from "./lib/carousel/render.js";
import { buildHistory, needsSummary, summaryPrompt, acceptSummary, memoryExtractionPrompt, parseMemoryChanges, shouldExtractMemory, memoryBlock, RECENT_MESSAGES } from "./lib/memory.js";
import { createFaithfulImage, readImageMeta, isImageEditFollowUp, isReferenceImageRequest } from "./lib/imageFidelity.js";
import { buildDesignBrief } from "./lib/designDirection.js";
import { currentDateLine, needsWebSearch, webSearchAnswer, looksOutdated } from "./lib/webSearch.js";
import { FORMATS as FILE_FORMATS, detectFileRequest, filePlannerPrompt, renderFile, normalizeSpec as normalizeFileSpec, inspectFileSpec, detectLanguage, detectCurrency, langOf } from "./lib/files/index.js";
import { inspectProjectSyntax } from "./lib/syntaxGate.js";
import { repairProjectSyntax } from "./lib/syntaxRepair.js";
import { transcribeKiraAudioDetailed } from "./lib/kiraTranscription.js";
import { cleanVoiceRequest } from "./lib/voiceRequest.js";
import helmet from "helmet";
// KIRA_PACKAGE_JSON_REPAIR_V1_INTEGRATION
import { repairPackageJsonNewlines } from "./lib/packageJsonRepair.js";
import { repairArtifactNewlines } from "./lib/artifactNewlineRepair.js"; // KIRA_PHASE22_PASSIVE_SYNTAX_GATE
import { repairGeneratedHtml } from "./lib/htmlArtifactRepair.js"; // KIRA_HTML_ARTIFACT_REPAIR_V1
import {
  initStore,
  cleanupExpiredAuthLimits,
  findUserByUsername,
  findUserByEmail,
  createUser,
  createPasswordResetToken,
  findUserByValidResetToken,
  clearPasswordResetToken,
  updatePassword,
  resetPasswordWithToken,
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
  getVersionChanges,
  saveGeneratedFile,
  getGeneratedFile,
  getGeneratedFileUnchecked,
  updateConversationSummary,
  getMemorySettings,
  setMemoryEnabled,
  listUserMemories,
  applyMemoryChanges,
  deleteUserMemory,
  clearUserMemories,
  countUserMessages,
  saveProjectBrief,
  getProjectBrief
} from "./lib/store.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Render encaminha requisições por um proxy reverso.
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);
app.use(express.json({ limit: process.env.KIRA_BODY_LIMIT || "40mb" })); // carrossel: várias fotos por mensagem

// Imagens geradas e salvas localmente.
app.use(
  "/api/generated-images",
  express.static(path.join(__dirname, "generated-images"), {
    fallthrough: false,
    maxAge: "7d",
    immutable: true
  })
);


const SYSTEM_PROMPT_BASE = `Você é Kira, assistente de IA direta, cuidadosa e excelente em programação. Responda no idioma da última mensagem.
Conversa: responda de forma útil, natural e concisa. Quando o usuário apenas apresentar uma ideia, personagem, projeto ou informação, reconheça o que foi dito e converse sobre o assunto. Não presuma que ele esteja pedindo código, arquitetura, planejamento ou criação de arquivos. Só proponha ou desenvolva soluções técnicas quando houver um pedido explícito ou uma pergunta que justifique isso.
Código novo: use create_document. Para projetos complexos, aja como engenheira de software: planeje arquitetura, preserve a stack solicitada, gere configuração/dependências/entrypoints/componentes necessários e revise imports/exports/caminhos antes de entregar. Entregue TODOS os arquivos completos e conectados. Nunca reduza frameworks a HTML simples.
Sites HTML/CSS/JS: por padrão use index.html + style.css + script.js separados; index.html deve importar ambos corretamente. Classes, IDs, caminhos e eventos precisam ser coerentes entre os três arquivos. Revise mentalmente o projeto antes de finalizar. IMPORTANTE: em arquivos .html, escreva marcação HTML literal e válida: atributos devem usar aspas normais, por exemplo lang="pt-BR" e charset="UTF-8". Nunca coloque barra invertida antes das aspas de atributos HTML. Barras invertidas de escape pertencem à serialização JSON, não ao conteúdo final do arquivo.
Projeto existente: use update_artifact; retorne só operações create/update/delete necessárias, nunca arquivos intactos. Preserve a stack.
Não anuncie genericamente "criei uma landing page". O servidor apresentará a lista exata dos arquivos criados.
Imagens: use generate_image quando pedirem geração. Para fotografias realistas, descreva sujeito, contexto, iluminação fisicamente plausível, materiais, profundidade e composição com fidelidade ao pedido; evite adicionar objetos não solicitados. Para outros estilos, respeite a estética pedida. Home Assistant: só use control_device quando pedido.
Anexos: quando receber imagem ou áudio, baseie a resposta no conteúdo efetivamente recebido; não invente detalhes, transcrições ou características não verificáveis. Quando a pergunta exigir, responda de modo completo, estruturado e coerente, sem repetição desnecessária.
Markdown puro; sem HTML decorativo.
Precisão e honestidade técnica: nunca afirme ter inspecionado código, arquitetura, banco, logs ou configurações que não foram fornecidos. Sem evidência, apresente riscos como hipóteses ("pode ocorrer", "verifique se") e peça o código relevante para confirmar problemas específicos. Diferencie explicitamente fatos verificados, hipóteses e recomendações. Para SQL injection, priorize consultas parametrizadas; validação de entrada é defesa complementar. Não cite nomes internos de ferramentas (como create_document ou update_artifact) nas respostas comuns. Não alegue ter executado testes ou verificado arquivos sem fazê-lo.`;

// ---------- KIRA_MEMORY_V1 ----------
async function askMemoryModel(prompt, { json = false } = {}) {
  const instruction = json ? "Você cuida da memória de uma assistente e responde somente JSON válido." : "Você resume conversas com precisão, sem inventar nada.";
  if (GROQ_ENABLED) {
    try {
      return json
        ? await callGroqJson({ systemInstruction: instruction, message: prompt, maxTokens: 1200, preferredModel: process.env.KIRA_MEMORY_GROQ_MODEL || "openai/gpt-oss-20b" })
        : await callGroqFallback({ systemInstruction: instruction, message: prompt, history: [], preferredModel: process.env.KIRA_MEMORY_GROQ_MODEL || "openai/gpt-oss-20b" });
    } catch (err) { console.warn("[kira-memory] groq falhou:", err.status || err.message); }
  }
  const data = await callGemini({ systemInstruction: instruction, contents: [{ role: "user", parts: [{ text: prompt }] }] });
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n");
}

const memoryJobs = new Set();
async function updateMemoryInBackground({ userId, conversationId, memoryOn }) {
  const jobKey = `${userId}:${conversationId}`;
  if (memoryJobs.has(jobKey)) return; // evita duas atualizações simultâneas da mesma conversa
  memoryJobs.add(jobKey);
  try {
    const conv = await getConversation(userId, conversationId);
    if (!conv) return;
    const messages = conv.messages || [];
    // 1. Resumo incremental das mensagens que saíram da janela recente.
    if (needsSummary(messages, conv.summaryUpto)) {
      const olderEnd = messages.length - RECENT_MESSAGES;
      const fresh = messages.slice(conv.summaryUpto || 0, olderEnd);
      const summary = acceptSummary(await askMemoryModel(summaryPrompt(conv.summary, fresh)));
      if (summary) {
        await updateConversationSummary(userId, conversationId, summary, olderEnd);
        console.info(`[kira-memory] summary_updated upto=${olderEnd} chars=${summary.length}`);
      }
    }
    // 2. Fatos duradouros sobre o usuário.
    if (!memoryOn) return;
    const lastUser = [...messages].reverse().find(m => m.role === "user")?.content || "";
    const userCount = await countUserMessages(userId, conversationId);
    if (!shouldExtractMemory(userCount, lastUser)) return;
    const existing = await listUserMemories(userId);
    const changes = parseMemoryChanges(await askMemoryModel(memoryExtractionPrompt(existing, messages.slice(-8)), { json: true }), existing);
    if (changes.add.length || changes.remove.length) {
      await applyMemoryChanges(userId, changes, randomUUID);
      console.info(`[kira-memory] facts_added=${changes.add.length} facts_removed=${changes.remove.length}`);
    }
  } finally {
    memoryJobs.delete(jobKey);
  }
}

// O usuário vê, apaga e liga/desliga o que a Kira lembra dele.
app.get("/api/memory", requireAuth, async (req, res) => {
  try {
    const [settings, facts] = await Promise.all([getMemorySettings(req.user.id), listUserMemories(req.user.id)]);
    res.json({ enabled: settings.enabled, facts });
  } catch (err) { res.status(500).json({ error: "Não consegui carregar a memória." }); }
});
app.put("/api/memory", requireAuth, async (req, res) => {
  try {
    await setMemoryEnabled(req.user.id, req.body?.enabled !== false);
    res.json({ enabled: req.body?.enabled !== false });
  } catch (err) { res.status(500).json({ error: "Não consegui salvar a configuração." }); }
});
app.delete("/api/memory/:id", requireAuth, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Memória não encontrada." });
  try { await deleteUserMemory(req.user.id, req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: "Não consegui apagar." }); }
});
app.delete("/api/memory", requireAuth, async (req, res) => {
  try { await clearUserMemories(req.user.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: "Não consegui apagar." }); }
});

// KIRA_FILES_V1: download dos arquivos gerados (só o dono do arquivo).
app.get("/api/files/:id", requireAuth, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "Arquivo não encontrado." });
  try {
    const file = await getGeneratedFile(req.user.id, req.params.id);
    if (!file) return res.status(404).json({ error: "Arquivo não encontrado." });
    const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    res.set({
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600"
    });
    res.end(file.data);
  } catch (err) {
    console.warn("[kira-file] download falhou:", err.message);
    res.status(500).json({ error: "Não consegui abrir o arquivo." });
  }
});

// KIRA_PROJECT_IMAGES_V1: imagens dos projetos geradas e guardadas pelo servidor.
// Rota pública (tags <img> não enviam token); só serve IDs registrados pelo próprio servidor.
// KIRA_CAROUSEL_V1: slides servidos por link assinado (o <img> do chat não manda o token de login).
// KIRA_ANDROID_APP_V1: Digital Asset Links do app Android (Trusted Web Activity / PWABuilder).
// Com este arquivo o app abre em tela cheia; sem ele, o Android mostra a barra de endereço.
// Configure UMA das opções no ambiente do servidor:
//   ANDROID_ASSETLINKS_JSON = conteúdo do assetlinks.json gerado pelo PWABuilder
//   ou ANDROID_PACKAGE_NAME + ANDROID_SHA256_FINGERPRINTS (vários separados por vírgula)
app.get("/.well-known/assetlinks.json", (_req, res) => {
  res.set({ "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" });
  res.type("application/json").send(JSON.stringify(androidAssetLinks()));
});

app.get("/api/carousel-slides/:id", async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).end();
  const expected = Buffer.from(signSlide(id)), given = Buffer.from(String(req.query.s || ""));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(403).end();
  try {
    const file = await getGeneratedFileUnchecked(id);
    if (!file || file.format !== "png") return res.status(404).end();
    res.set({ "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable", "Content-Disposition": `inline; filename="${file.name.replace(/[^\w.-]/g, "_")}"` });
    res.end(file.data);
  } catch (err) { console.warn("[kira-carousel] slide falhou:", err.message); res.status(500).end(); }
});
app.get("/api/project-images/:id", async (req,res)=>{
  if(!isProjectImageId(req.params.id)) return res.status(404).end();
  res.set("Cross-Origin-Resource-Policy","cross-origin"); // o preview roda em outra origem
  try{
    const result=await getProjectImage(req.params.id, req.query.m);
    if(!result) return res.status(404).end();
    if(result.file){ res.set("Cache-Control","public, max-age=31536000, immutable"); return res.sendFile(result.file); }
    res.set("Cache-Control","no-store"); // fundo temporário: na próxima visita tenta gerar de novo
    return res.type("image/svg+xml").send(result.placeholder);
  }catch(err){
    console.warn("[kira-project-image] falha:",err.message);
    res.status(502).end();
  }
});
// KIRA_FILES_V1: planeja o conteúdo (Gemini → Groq), gera imagens dos slides, monta e salva o arquivo.
const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

function parseLooseJson(text) {
  const raw = String(text || "").replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

// Modelo do planejamento de arquivos: o "lite" escreve conteúdo raso em estruturas grandes.
// Um só modelo aqui: as reservas (KIRA_GEMINI_FALLBACK_MODELS) já são tentadas dentro do callGemini.
const FILE_MODELS = [process.env.KIRA_FILE_GEMINI_MODEL || undefined];
const WHISPER_LANG = { portuguese: "pt", spanish: "es", english: "en", pt: "pt", es: "es", en: "en" };

const FILE_REPLY = {
  pt: (title, label, summary) => `Pronto! Criei **${title}** em ${label} (${summary}).\n\nÉ só baixar no cartão abaixo. Se quiser, posso mudar o tema, o tamanho ou o conteúdo.`,
  es: (title, label) => `¡Listo! Creé **${title}** en ${label}.\n\nPuedes descargarlo en la tarjeta de abajo. Si quieres, cambio el tema, la extensión o el contenido.`,
  en: (title, label) => `Done! I created **${title}** as a ${label} file.\n\nYou can download it from the card below. I can change the theme, length or content if you'd like.`
};

async function planFileSpec({ format, request, history, groqHistory, lang, currency, requirements, issues = [], previous = null }) {
  const prompt = filePlannerPrompt(request, format, { lang, currency, requirements, issues, previous });
  for (const model of FILE_MODELS) {
    try {
      const data = await callGemini({ systemInstruction: systemPrompt(), contents: [...history.slice(-8), { role: "user", parts: [{ text: prompt }] }], forceFunctionName: "create_file", model });
      const args = (data?.candidates?.[0]?.content?.parts || []).find(p => p.functionCall?.name === "create_file")?.functionCall?.args;
      if (args) return { spec: args, provider: `gemini:${data._kiraModel || model || GEMINI_MODEL}` };
    } catch (error) {
      console.warn(`[kira-file] planejamento gemini (${model || GEMINI_MODEL}) falhou:`, error.status || error.message);
    }
  }
  if (GROQ_ENABLED) {
    const kind = FILE_FORMATS[format].kind;
    const shape = {
      presentation: '"slides":[{"layout":"title|section|bullets|two-column|stats|timeline|table|quote|image|closing","title":"...","subtitle":"...","bullets":["..."],"leftTitle":"...","left":["..."],"rightTitle":"...","right":["..."],"stats":[{"value":"...","label":"..."}],"steps":[{"title":"...","text":"..."}],"headers":["..."],"rows":[["..."]],"quote":"...","author":"...","imagePrompt":"...","notes":"..."}]',
      spreadsheet: '"sheets":[{"name":"...","description":"...","columns":[{"header":"...","type":"text|number|integer|currency|percent|date"}],"rows":[["valor da coluna 1","valor da coluna 2"]],"totals":true}]',
      document: '"blocks":[{"type":"heading|paragraph|bullets|numbered|table|quote|callout","level":1,"text":"...","items":["..."],"headers":["..."],"rows":[["..."]],"tone":"info|success|warning"}]'
    }[kind];
    let model = "groq";
    try {
      const text = await callGroqJson({
        systemInstruction: `${systemPrompt()}\nResponda SOMENTE com um objeto JSON válido.`,
        message: `${prompt}\n\nIMPORTANTE: em vez de chamar uma função, responda com UM objeto JSON exatamente neste formato (use estes nomes de campos):\n{"format":"${format}","fileName":"...","title":"...","subtitle":"...","author":"","theme":"...","currency":"${currency}",${shape}}`,
        history: groqHistory,
        onSelectedModel: m => { model = `groq:${m}`; }
      });
      const spec = parseLooseJson(text);
      if (spec) return { spec, provider: model };
      console.warn(`[kira-file] groq devolveu JSON inválido (chars=${String(text || "").length})`);
    } catch (error) {
      console.warn("[kira-file] planejamento groq falhou:", error.status || error.message);
    }
  }
  return { spec: null, provider: null };
}

const specStrings = value => typeof value === "string" ? value : Array.isArray(value) ? value.map(specStrings).join("\n") : value && typeof value === "object" ? Object.entries(value).filter(([k]) => !/^(theme|format|currency|layout|type|tone|imagePrompt)$/.test(k)).map(([, v]) => specStrings(v)).join("\n") : "";

async function createKiraFile({ format, request, history = [], groqHistory = [], userId, step = () => {}, presetSpec = null, langHint = null }) {
  const label = FILE_FORMATS[format].label;
  // KIRA_FILES_LANG_V1: idioma do pedido (ou do áudio) decide o idioma do arquivo.
  const lang = detectLanguage(request, WHISPER_LANG[String(langHint || "").toLowerCase()] || "pt");
  const currency = detectCurrency(request, lang);
  const requirements = extractRequirementsHeuristic(request);
  const maxAttempts = Math.max(1, Math.min(4, Number(process.env.KIRA_FILE_MAX_ATTEMPTS || 3)));

  step("file-plan", `Planejando o conteúdo do ${label}`, `idioma: ${langOf(lang).name} · moeda: ${currency}`);
  let raw = presetSpec;
  let provider = "gemini";
  if (!raw) ({ spec: raw, provider } = await planFileSpec({ format, request, history, groqHistory, lang, currency, requirements }));
  if (!raw) { const e = new Error("Não consegui planejar o conteúdo do arquivo agora."); e.status = 503; throw e; }

  // KIRA_FILES_QUALITY_V1: confere contra o pedido e corrige antes de montar o arquivo.
  let spec = normalizeFileSpec(raw, format, { lang, currency });
  // KIRA_CHECKLIST_V1: textos exatos, @, links e proibições do pedido conferidos no conteúdo do arquivo.
  const fileChecklist = buildChecklist(request);
  const inspectAll = s => [...new Set([...inspectFileSpec(s, request, { lang, requirements }), ...checklistIssues(specStrings(s), { ...fileChecklist, quantities: [] })])];
  let issues = inspectAll(spec);
  step("file-plan", "Conteúdo planejado", `${spec.title} · ${issues.length ? `${issues.length} ponto(s) a ajustar` : "conferido"}`, "done");
  console.info(`[kira-file] attempt=1 provider=${provider} lang=${lang} issues=${issues.length}${issues.length ? ` first="${issues[0].slice(0, 90)}"` : ""}`);

  for (let attempt = 2; attempt <= maxAttempts && issues.length; attempt++) {
    step(`file-fix-${attempt}`, `Ajustando o conteúdo · ${issues.length} ponto(s)`, issues[0].slice(0, 110));
    const retry = await planFileSpec({ format, request, history, groqHistory, lang, currency, requirements, issues, previous: { title: spec.title, slides: spec.slides, sheets: spec.sheets.map(s => ({ ...s, rows: s.rows.slice(0, 40) })), blocks: spec.blocks } });
    if (!retry.spec) break;
    const candidate = normalizeFileSpec(retry.spec, format, { lang, currency });
    const candidateIssues = inspectAll(candidate);
    console.info(`[kira-file] attempt=${attempt} provider=${retry.provider} issues=${candidateIssues.length}`);
    step(`file-fix-${attempt}`, `Revisão ${attempt - 1} concluída`, candidateIssues.length ? `${candidateIssues.length} ponto(s) restante(s)` : "tudo conferido", "done");
    if (candidateIssues.length <= issues.length) { raw = retry.spec; spec = candidate; issues = candidateIssues; provider = retry.provider; }
    else break;
  }

  const imageSlides = format === "pptx" ? spec.slides.filter(s => s.layout === "image" && s.imagePrompt).length : 0;
  if (imageSlides) step("file-images", `Gerando ${Math.min(3, imageSlides)} imagem(ns) para os slides`);
  const resolveImage = async prompt => {
    const url = await generateKiraImage(prompt, { plannedPrompt: `${prompt}. Professional, high quality, no text, no watermark.`, layout: { width: 896, height: 1152, name: "vertical" } });
    const file = path.join(__dirname, "generated-images", path.basename(url));
    const bytes = await fsp.readFile(file);
    fsp.unlink(file).catch(() => {});
    return { bytes, mimeType: file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg" };
  };

  step("file-render", `Montando o arquivo ${label}`);
  const rendered = await renderFile(raw, format, { resolveImage, lang, currency });
  if (imageSlides) step("file-images", "Imagens prontas", "", "done");
  const saved = await saveGeneratedFile(userId, { id: randomUUID(), name: rendered.fileName, format, mime: rendered.mime, buffer: rendered.buffer, summary: rendered.summary });
  step("file-render", `${label} pronto · ${rendered.summary}`, formatBytes(saved.size), "done");
  console.info(`[kira-file] format=${format} provider=${provider} lang=${lang} size=${saved.size} summary="${rendered.summary}" remaining_issues=${issues.length}`);
  const file = { id: saved.id, name: saved.name, format, label, size: saved.size, summary: rendered.summary, title: rendered.spec.title, theme: rendered.spec.theme, lang };
  return { file, provider, reply: (FILE_REPLY[lang] || FILE_REPLY.pt)(rendered.spec.title, label, rendered.summary) };
}

// ---------- KIRA_CAROUSEL_V1 ----------
const CAROUSEL_SECRET = process.env.JWT_SECRET || "kira-dev-carousel";
const signSlide = id => createHmac("sha256", CAROUSEL_SECRET).update(`slide:${id}`).digest("base64url").slice(0, 22);
const slideUrl = id => `/api/carousel-slides/${id}?s=${signSlide(id)}`;
const CAROUSEL_MAX_IMAGES = Math.max(0, Math.min(10, Number(process.env.KIRA_CAROUSEL_MAX_IMAGES || 5)));
const CAROUSEL_REPLY = {
  pt: (n, size, notes) => `Pronto! Seu carrossel tem **${n} slides** (${size}). Deslize para ver cada um; você pode baixar as imagens (ZIP) ou o PDF para o LinkedIn, e a legenda já está pronta para copiar.${notes}\n\nQuer mudar algo? É só dizer, por exemplo: "troca o título do slide 2" ou "usa esta foto na capa".`,
  es: (n, size, notes) => `¡Listo! Tu carrusel tiene **${n} diapositivas** (${size}). Desliza para ver cada una; puedes descargar las imágenes (ZIP) o el PDF para LinkedIn, y el texto del post ya está listo para copiar.${notes}\n\n¿Quieres cambiar algo? Solo dime, por ejemplo: "cambia el título de la diapositiva 2" o "usa esta foto en la portada".`,
  en: (n, size, notes) => `Done! Your carousel has **${n} slides** (${size}). Swipe through them; you can download the images (ZIP) or the PDF for LinkedIn, and the caption is ready to copy.${notes}\n\nWant changes? Just say, e.g. "change the title on slide 2" or "use this photo on the cover".`
};

async function planCarousel({ prompt, userImages, imageOffset = 0, history, groqHistory }) {
  const imageParts = userImages.flatMap((img, i) => [{ text: `IMAGEM DO USUÁRIO ${imageOffset + i + 1}:` }, { inlineData: { mimeType: img.mimeType || "image/jpeg", data: img.data } }]);
  for (const model of FILE_MODELS) {
    try {
      const data = await callGemini({ systemInstruction: systemPrompt(), contents: [...history.slice(-6), { role: "user", parts: [{ text: prompt }, ...imageParts] }],
        tools: [{ functionDeclarations: [CREATE_CAROUSEL_TOOL] }], forceFunctionName: "create_carousel", model });
      const args = (data?.candidates?.[0]?.content?.parts || []).find(p => p.functionCall?.name === "create_carousel")?.functionCall?.args;
      if (args) return { spec: args, provider: `gemini:${data._kiraModel || model || GEMINI_MODEL}` };
    } catch (error) { console.warn(`[kira-carousel] planejamento gemini falhou:`, error.status || error.message); }
  }
  if (GROQ_ENABLED) {
    let model = "groq";
    try {
      const text = await callGroqJson({
        systemInstruction: `${systemPrompt()}\nResponda SOMENTE com um objeto JSON válido.`,
        message: `${prompt}${userImages.length ? `\n(As ${userImages.length} imagens do usuário não estão visíveis para você: distribua-as pela ordem, capa primeiro.)` : ""}\n\nResponda com UM objeto JSON neste formato:\n{"title":"...","style":"editorial|bold|minimal|dark|gradient","fonts":"classic|modern|tech|elegant","palette":{"background":"#rrggbb","text":"#rrggbb","muted":"#rrggbb","accent":"#rrggbb"},"imageStyle":"...","handle":"","caption":"...","hashtags":["..."],"slides":[{"kind":"cover|content|list|stat|quote|image|cta","kicker":"...","title":"...","body":"...","bullets":["..."],"statValue":"","statLabel":"","quote":"","author":"","imageSource":"none|generate|user","userImage":1,"imagePrompt":"...","imagePlacement":"full|top|background|none"}]}`,
        history: groqHistory, onSelectedModel: m => { model = `groq:${m}`; }
      });
      const spec = parseLooseJson(text);
      if (spec) return { spec, provider: model };
    } catch (error) { console.warn("[kira-carousel] planejamento groq falhou:", error.status || error.message); }
  }
  return { spec: null, provider: null };
}

async function readGeneratedImage(url) {
  const file = path.join(__dirname, "generated-images", path.basename(url));
  const bytes = await fsp.readFile(file);
  fsp.unlink(file).catch(() => {});
  return bytes;
}

async function createKiraCarousel({ request, userImages = [], format = "portrait", previous = null, history = [], groqHistory = [], userId, step = () => {}, checklist = null, langHint = null }) {
  const prevSpec = previous?.carousel?.spec || null;
  const explicitLang = checklist?.language?.code;
  const lang = explicitLang || (prevSpec?.lang && !userImages.length && request.length < 200 ? prevSpec.lang : detectLanguage(request, WHISPER_LANG[String(langHint || "").toLowerCase()] || prevSpec?.lang || "pt"));
  const fmt = prevSpec && !/\b(story|stories|quadrad|cuadrad|square|1:1|9:16|4:5)\b/i.test(request) ? prevSpec.format : (format || detectCarouselFormat(request));
  const checklistText = checklistBlock(checklist);
  const maxAttempts = Math.max(1, Math.min(4, Number(process.env.KIRA_CAROUSEL_MAX_ATTEMPTS || 3)));
  // Edição: fotos do usuário que já estão no carrossel continuam numeradas 1..N; as novas vêm depois.
  const prevUserAssets = new Map((prevSpec?.slides || []).filter(s => s.imageSource === "user" && s.userImage && s.assetId).map(s => [s.userImage, s.assetId]));
  const existingUserImages = prevUserAssets.size ? Math.max(...prevUserAssets.keys()) : 0;
  const userImageCount = existingUserImages + userImages.length;
  const mustUse = Array.from({ length: userImages.length }, (_, k) => existingUserImages + k + 1);
  const newUserImage = n => n > existingUserImages ? userImages[n - existingUserImages - 1] : null;
  const size = CAROUSEL_FORMATS[fmt].label;

  // 1. Plano (com fotos do usuário visíveis para o modelo) + conferência contra cada item do pedido.
  step("carousel-plan", prevSpec ? "Aplicando sua alteração no carrossel" : "Planejando o carrossel", `${size}${userImageCount ? ` · ${userImageCount} foto(s) sua(s)` : ""}`);
  const previousForPrompt = prevSpec ? { ...prevSpec, slides: prevSpec.slides.map(({ assetId, ...rest }) => rest) } : null;
  let raw = null, provider = null, spec = null, issues = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const draft = attempt > 1 && spec ? { ...spec, slides: spec.slides.map(({ assetId, ...rest }) => rest) } : null;
    const prompt = carouselPlannerPrompt(request, { lang, format: fmt, checklistText, userImages: userImageCount, existingUserImages, previous: prevSpec && !draft ? previousForPrompt : null, draft, issues, maxImages: CAROUSEL_MAX_IMAGES });
    const planned = await planCarousel({ prompt, userImages, imageOffset: existingUserImages, history, groqHistory });
    if (!planned.spec) { if (attempt === 1 && !prevSpec) { raw = fallbackCarousel(request, { lang }); provider = "fallback"; } break; }
    const candidate = normalizeCarouselSpec(planned.spec, { format: fmt, lang, checklist, userImages: userImageCount, mustUse, maxImages: CAROUSEL_MAX_IMAGES });
    const candidateIssues = inspectCarousel(candidate, { checklist, detectLang: detectLanguage, lang, userImages: prevSpec ? userImages.length && userImageCount : userImageCount, overflow: measureCarousel(candidate) });
    console.info(`[kira-carousel] attempt=${attempt} provider=${planned.provider} slides=${candidate.slides.length} issues=${candidateIssues.length}${candidateIssues.length ? ` first="${candidateIssues[0].slice(0, 100)}"` : ""}`);
    if (!spec || candidateIssues.length <= issues.length) { raw = planned.spec; spec = candidate; issues = candidateIssues; provider = planned.provider; }
    if (!issues.length) break;
    step(`carousel-fix-${attempt}`, `Conferindo o pedido · ${issues.length} ponto(s) a ajustar`, issues[0].slice(0, 110), attempt === maxAttempts ? "done" : undefined);
  }
  if (!spec) {
    if (!raw) { const e = new Error("Não consegui planejar o carrossel agora."); e.status = 503; throw e; }
    spec = normalizeCarouselSpec(raw, { format: fmt, lang, checklist, userImages: userImageCount, mustUse, maxImages: CAROUSEL_MAX_IMAGES });
  }
  step("carousel-plan", "Roteiro do carrossel pronto", `${spec.slides.length} slides · ${issues.length ? `${issues.length} ponto(s) não resolvido(s)` : "tudo conferido com o pedido"}`, "done");

  // 2. Imagens: fotos do usuário, imagens já existentes (edição) ou novas no Cloudflare.
  if (prevSpec) {
    for (const [i, s] of spec.slides.entries()) {
      const old = prevSpec.slides[i];
      if (!s.assetId && old?.assetId && s.imageSource === "generate" && old.imageSource === "generate" && s.imagePrompt === old.imagePrompt) s.assetId = old.assetId;
      if (s.imageSource === "user" && prevUserAssets.has(s.userImage)) s.assetId = prevUserAssets.get(s.userImage);
    }
  }
  const buffers = new Map();
  const notes = [];
  const toGenerate = [];
  for (const [i, s] of spec.slides.entries()) {
    if (s.imageSource === "none") continue;
    if (s.assetId) {
      const asset = await getGeneratedFile(userId, s.assetId).catch(() => null);
      if (asset) { buffers.set(i, asset.data); continue; }
      s.assetId = null;
    }
    const attached = s.imageSource === "user" ? (prevSpec ? newUserImage(s.userImage) : userImages[s.userImage - 1]) : null;
    if (attached) {
      const bytes = Buffer.from(attached.data, "base64");
      buffers.set(i, bytes);
      const saved = await saveGeneratedFile(userId, { id: randomUUID(), name: `foto-${i + 1}.img`, format: "asset", mime: attached.mimeType || "image/jpeg", buffer: bytes, summary: "foto do usuário (carrossel)" });
      s.assetId = saved.id;
    } else if (s.imageSource === "generate") toGenerate.push(i);
    else { s.imageSource = "none"; s.imagePlacement = "none"; }
  }
  if (toGenerate.length) {
    step("carousel-images", `Criando ${toGenerate.length} imagem(ns) para o carrossel`, "mesma direção de arte em todas");
    let done = 0;
    const queue = [...toGenerate];
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift(), s = spec.slides[i];
        const full = s.imagePlacement !== "top";
        const layout = full ? (fmt === "square" ? { width: 1024, height: 1024, name: "square" } : { width: 896, height: fmt === "story" ? 1536 : 1152, name: "vertical" }) : { width: 1216, height: 768, name: "horizontal" };
        const prompt = `${s.imagePrompt}. ${spec.imageStyle ? `Art direction: ${spec.imageStyle}. ` : ""}${full ? "Leave calm, darker negative space in the lower third for overlaid text. " : ""}Professional, high detail, editorial quality, no text, no letters, no logos, no watermark.`;
        try {
          const bytes = await readGeneratedImage(await generateKiraImage(prompt, { plannedPrompt: prompt, layout }));
          buffers.set(i, bytes);
          const saved = await saveGeneratedFile(userId, { id: randomUUID(), name: `imagem-${i + 1}.jpg`, format: "asset", mime: "image/jpeg", buffer: bytes, summary: s.imagePrompt.slice(0, 200) });
          s.assetId = saved.id;
        } catch (error) {
          console.warn(`[kira-carousel] imagem do slide ${i + 1} falhou:`, error.message);
          if (error.quota) notes.push("quota");
          s.imageSource = "none"; s.imagePlacement = "none";
        }
        step("carousel-images", `Imagens do carrossel · ${++done}/${toGenerate.length}`, "", done === toGenerate.length ? "done" : undefined);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, toGenerate.length) }, worker));
  }

  // 3. Desenho, PDF e ZIP.
  step("carousel-render", "Diagramando os slides", `${spec.slides.length} × ${size}`);
  const rendered = await renderCarousel(spec, buffers);
  const slug = (spec.title || "carrossel").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carrossel";
  const [pdf, zip] = await Promise.all([
    carouselPdf(rendered.slides, { width: rendered.width, height: rendered.height, title: spec.title }),
    carouselZip(rendered.slides, { slug, caption: spec.caption, hashtags: spec.hashtags })
  ]);
  const slides = [];
  for (const [i, png] of rendered.slides.entries()) {
    const saved = await saveGeneratedFile(userId, { id: randomUUID(), name: `${slug}-${String(i + 1).padStart(2, "0")}.png`, format: "png", mime: "image/png", buffer: png, summary: `slide ${i + 1}` });
    slides.push({ id: saved.id, url: slideUrl(saved.id), name: saved.name });
  }
  const savedPdf = await saveGeneratedFile(userId, { id: randomUUID(), name: `${slug}.pdf`, format: "pdf", mime: "application/pdf", buffer: pdf, summary: `Carrossel em PDF · ${spec.slides.length} páginas` });
  const summary = `${spec.slides.length} slides · ${size}`;
  const savedZip = await saveGeneratedFile(userId, { id: randomUUID(), name: `${slug}.zip`, format: "zip", mime: "application/zip", buffer: zip, summary });
  step("carousel-render", "Carrossel pronto", summary, "done");
  console.info(`[kira-carousel] done provider=${provider} slides=${spec.slides.length} format=${fmt} user_images=${userImageCount} generated=${toGenerate.length} remaining_issues=${issues.length} overflow=${rendered.overflow.length}`);

  const L = ["pt", "es", "en"].includes(lang) ? lang : "pt";
  let extra = "";
  if (notes.includes("quota")) extra += { pt: "\n\nA cota diária de imagens do Cloudflare acabou, então alguns slides ficaram só com design tipográfico. Depois das 21h (Brasília) posso gerar as fotos que faltam.", es: "\n\nSe agotó la cuota diaria de imágenes, así que algunas diapositivas quedaron solo con diseño tipográfico. Más tarde puedo generar las fotos que faltan.", en: "\n\nThe daily image quota ran out, so some slides use typography only. I can add the missing photos later." }[L];
  else if (toGenerate.length && spec.slides.filter(s => s.imageSource === "generate").length < toGenerate.length) extra += { pt: "\n\nAlgumas imagens não puderam ser geradas agora; esses slides ficaram só com design tipográfico.", es: "\n\nAlgunas imágenes no se pudieron generar ahora; esas diapositivas quedaron solo con diseño tipográfico.", en: "\n\nSome images couldn't be generated right now; those slides use typography only." }[L];
  if (issues.length) extra += { pt: `\n\nConferi o pedido item por item e isto pode não ter saído exatamente como você pediu: ${issues.slice(0, 3).join("; ")}.`, es: `\n\nRevisé el pedido punto por punto y esto puede no haber quedado exactamente como pediste: ${issues.slice(0, 3).join("; ")}.`, en: `\n\nI checked the request item by item and this may not match exactly: ${issues.slice(0, 3).join("; ")}.` }[L];

  const file = {
    id: savedZip.id, name: savedZip.name, format: "carousel", label: "Carrossel", size: savedZip.size, summary, title: spec.title, lang,
    carousel: { width: rendered.width, height: rendered.height, slides, pdf: { id: savedPdf.id, name: savedPdf.name, size: savedPdf.size }, caption: spec.caption, hashtags: spec.hashtags, spec }
  };
  return { file, provider, reply: CAROUSEL_REPLY[L](spec.slides.length, size, extra) };
}

// KIRA_DEVELOPER_FIX_PASS_V1: prompt de correção cirúrgica (só arquivos com problema + requisitos faltantes).
function projectFixPrompt(request, evaluation, requirements) {
  const files = evaluation.files;
  const mentioned = new Set();
  for (const issue of evaluation.issues) for (const f of files) if (issue.includes(f.path)) mentioned.add(f.path);
  // Requisitos faltando costumam envolver rotas/navegação/estilos globais.
  const hubs = files.filter(f => /(^|\/)(App\.[jt]sx?|main\.[jt]sx?|index\.html|index\.css|style\.css|routes?\.[jt]sx?)$/i.test(f.path));
  if (evaluation.req.missing.length || evaluation.visual.issues.length) hubs.forEach(f => mentioned.add(f.path));
  let budget = 90000;
  const context = [];
  for (const f of files.filter(f => mentioned.has(f.path))) {
    if (f.content.length > budget) continue;
    budget -= f.content.length;
    context.push(`--- ${f.path} ---\n${f.content}`);
  }
  const missingReqs = requirements.filter(r => evaluation.req.missing.some(m => m.id === r.id));
  return `Você está CORRIGINDO um projeto já gerado. Mantenha tudo o que já funciona.
Pedido original do usuário:
${String(request).slice(0, 6000)}

Arquivos do projeto (manifesto):
${files.map(f => f.path).join("\n")}

PROBLEMAS DETECTADOS (corrija TODOS):
${evaluation.issues.map(i => `- ${i}`).join("\n")}
${missingReqs.length ? requirementsPrompt(missingReqs).replace(/- Preencha "coverage"[^\n]*/, "") : ""}

Conteúdo dos arquivos relevantes:
${context.join("\n\n")}

Retorne update_artifact somente com as operações necessárias: update/create com o conteúdo COMPLETO do arquivo.
Pode criar arquivos novos (páginas, componentes, dados) para cumprir requisitos faltantes, e deve ligá-los (imports, rotas, links).
Não remova funcionalidades existentes, não troque a stack e não reescreva arquivos que não têm problema.`;
}

function requirementsNote(check) {
  if (!check?.missing?.length) return "";
  return `\n\nAtenção: não consegui confirmar no código ${check.missing.length === 1 ? "este item" : "estes itens"} do seu pedido — me diga se quer que eu ajuste:\n${check.missing.slice(0, 6).map(r => `- ${r.text}`).join("\n")}`;
}

// Conferência visual das imagens geradas (Gemini com visão).
async function askVisionModel(prompt, bytes, mimeType) {
  const data = await callGemini({
    systemInstruction: "Você avalia imagens geradas por IA e responde somente JSON válido.",
    contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }] }]
  });
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n");
}

// KIRA_WEB_SEARCH_V1: Google Search pelo Gemini, passando pelas outras chaves quando uma bate o limite (429).
// KIRA_SEARCH_GEMINI_MODEL permite usar um modelo com cota de pesquisa separada (ex.: gemini-2.5-flash).
async function geminiWebSearch(systemInstruction, contents) {
  const attempts = Math.max(1, geminiKeyCount());
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callGemini({ systemInstruction, contents, tools: [{ google_search: {} }], timeoutMs: Number(process.env.KIRA_SEARCH_TIMEOUT_MS || 45000), model: process.env.KIRA_SEARCH_GEMINI_MODEL || undefined });
    } catch (error) {
      lastError = error;
      if (error.status !== 429) break;
      console.warn(`[kira-search] gemini chave ${i + 1}/${attempts} no limite; tentando a próxima`);
    }
  }
  throw lastError;
}

// KIRA_AUDIO_FIDELITY_V1: reescreve a fala como pedido escrito (modelo rápido; Gemini de reserva).
async function askVoiceModel(prompt) {
  const instruction = "Você reescreve transcrições de voz como pedidos escritos, sem responder, acrescentar ou resumir nada.";
  if (GROQ_ENABLED) {
    try { return await callGroqFallback({ systemInstruction: instruction, message: prompt, history: [] }); }
    catch (err) { console.warn("[kira-audio] limpeza no groq falhou:", err.status || err.message); }
  }
  const data = await callGemini({ systemInstruction: instruction, contents: [{ role: "user", parts: [{ text: prompt }] }] });
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n");
}

async function askRequirementsModel(prompt) {
  const instruction = "Você extrai requisitos de pedidos de software e responde somente JSON válido.";
  if (GROQ_ENABLED) {
    try { return await callGroqFallback({ systemInstruction: instruction, message: prompt, history: [] }); }
    catch (err) { console.warn("[kira-requirements] groq indisponível:", err.status || err.message); }
  }
  const data = await callGemini({ systemInstruction: instruction, contents: [{ role: "user", parts: [{ text: prompt }] }] });
  return (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join("\n");
}

const publicBaseUrl = req => (process.env.KIRA_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/,"");

const VISUAL_REFERENCE_NOTE = `REFERÊNCIA VISUAL ANEXADA: a imagem a seguir é o alvo visual do projeto. Reproduza com a máxima fidelidade possível o layout (ordem e proporção das seções, alinhamentos, colunas), a paleta (extraia as cores e declare-as como tokens em :root), a tipografia (escolha a Google Font mais parecida), raios, sombras, espaçamentos, ícones e textos visíveis. Onde a imagem e a DIREÇÃO VISUAL divergirem, a imagem vence. Não reproduza logotipos de marcas registradas; use o nome do projeto do usuário.`;

// KIRA_WEB_SEARCH_V1: data/hora reais em todo prompt — sem isso a Kira "vive" no ano do treinamento.
// KIRA_MEMORY_V1: memória do usuário + resumo da conversa entram no prompt de TODA chamada desta requisição.
const requestMemory = new AsyncLocalStorage();
function systemPrompt() {
  const store = requestMemory.getStore();
  const memory = store?.memory, checklist = store?.checklist;
  return `${SYSTEM_PROMPT_BASE}\n${currentDateLine()}${memory ? `\n\n${memory}` : ""}${checklist ? `\n\n${checklist}` : ""}`;
}

const CURRENT_TERMS_VERSION = "2026-10-04-v1";
const CURRENT_DISCLAIMER_VERSION = "2026-10-04-v1";
const CURRENT_TERMS_HASH = "2dd656314486e1e5125440606172ba1c34eb4620efa277908dd35f4aaf58ed64";
const CURRENT_DISCLAIMER_HASH = "499eef9ed4cc74b5f16d5f2d4a66a9434875772a9d06bb5c103114ee4eb7867d";

function publicUser(user) {
  return { id: user.id, username: user.username };
}

// ---------- Auth ----------

app.post("/api/auth/register", authLimit("register", 8, 3600), async (req, res) => {
  try {
    const { username, email, password, termsAccepted, disclaimerAccepted, termsVersion, disclaimerVersion } = req.body;
    if (typeof username !== "string" || username.trim().length < 3 || username.trim().length > 50 || typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ error: "Informe usuário de 3 a 50 caracteres, e-mail válido e senha de 12 caracteres ou mais (até 72 bytes)." });
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

app.post("/api/auth/login", authLimit("login", 12, 900), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== "string" || username.length > 100 || typeof password !== "string" || Buffer.byteLength(password, "utf8") > 1024) return res.status(400).json({ error: "Dados de login inválidos." });
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
app.post("/api/auth/forgot-password", authLimit("forgot", 5, 3600), async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254) return res.status(400).json({ error: "E-mail inválido." });
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

app.post("/api/auth/reset-password", authLimit("reset", 10, 3600), async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) || typeof newPassword !== "string" || newPassword.length < 12 || Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({ error: "Link inválido ou senha fora do limite de 12 caracteres a 72 bytes." });
    }

    const user = await findUserByValidResetToken(token);
    if (!user) {
      return res.status(400).json({ error: "Este link é inválido ou expirou. Solicite um novo link." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await resetPasswordWithToken(token, passwordHash);
    if (!updated) return res.status(400).json({ error: "Este link é inválido ou expirou. Solicite um novo link." });
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
  if (err.status === 404) return "Nenhum modelo Gemini compatível ficou disponível para esta chave; confira os modelos autorizados.";
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

function artifactEditPrompt(artifact, request, brief = null) {
  const relevant = selectRelevantArtifactFiles(artifact.files, request);
  const manifest = artifact.files.map(f => f.path).join("\n");
  const context = relevant.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
  // KIRA_MEMORY_V1: requisitos originais do projeto — a edição não pode quebrá-los.
  const briefBlock = brief?.requirements?.length
    ? `\nRequisitos originais do projeto (continuam valendo; não remova nem quebre nenhum, a menos que o pedido atual mande):\n${brief.requirements.map(r => `- ${r.text}`).join("\n")}`
    : brief?.request ? `\nPedido original que criou o projeto: ${String(brief.request).slice(0, 1500)}` : "";
  return `Projeto existente: ${artifact.name}
Versão atual: v${artifact.version}${briefBlock}
Pedido do usuário: ${request}

Arquivos do projeto (manifesto; conteúdo não incluído):
${manifest}

Edite somente o necessário. Abaixo estão os arquivos relevantes disponíveis:
${context}

Retorne update_artifact com SOMENTE operações necessárias:
- update: conteúdo COMPLETO do arquivo alterado;
- create: conteúdo COMPLETO do novo arquivo;
- delete: somente path.
Nunca repita arquivos intactos.${designEditGuidance(request)}`;
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


// KIRA_MULTIMODAL_V2: pedidos explícitos de imagem, não de interface/código.
function kiraWantsGeneratedImage(value) {
  const text=String(value||'').trim();
  if (!text || /\b(html|css|javascript|jsx|tsx|site|website|landing page|c[oó]digo|componente|aplicativo|app|p[aá]gina web)\b/i.test(text)) return false;
  return /(?:\b(?:crie|cria|criar|gere|gera|gerar|desenhe|desenha|desenhar|produza|fa[cç]a|quero)\b.{0,90}\b(?:imagem|foto|fotografia|ilustra[cç][aã]o|retrato|arte visual)\b|\b(?:imagem|foto|fotografia|ilustra[cç][aã]o|retrato)\b.{0,50}\b(?:de|do|da|com|mostrando)\b|\b(?:generate|create|draw|make)\b.{0,90}\b(?:image|picture|photo|portrait|illustration)\b)/i.test(text);
}

// ---------- Chat (Kira) ----------

app.post("/api/chat", requireAuth, progressStream, async (req, res) => {
  const step = req.progress; // KIRA_PROGRESS_STREAM_V1: fases visíveis no chat
  requestMemory.enterWith({ memory: "", checklist: "" });
  let voiceInfo = null; // KIRA_AUDIO_FIDELITY_V1: o que a Kira ouviu e o pedido usado
  const chatStartedAt = Date.now();
  res.once("finish", () => console.info(`[kira-chat] status=${res.statusCode} duration_ms=${Date.now()-chatStartedAt}`));
  try {
    const { message, conversationId, image, audio, artifactId, images } = req.body;
    // KIRA_CAROUSEL_V1: várias fotos por mensagem (a primeira continua valendo como "image" para os outros fluxos).
    const attachedImages = (Array.isArray(images) ? images : image?.data ? [image] : [])
      .filter(img => img && typeof img.data === "string" && img.data.length > 100 && /^image\/(jpeg|png|webp|gif)$/i.test(img.mimeType || "image/jpeg"))
      .slice(0, Number(process.env.KIRA_MAX_IMAGES_PER_MESSAGE || 10));
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

    let textMessage = message || (image ? "Descreva essa imagem." : "");

    if (audio?.data) {
      try {
        // KIRA_AUDIO_FIDELITY_V1: contexto recente ajuda o Whisper a acertar termos e idioma.
        step('listen', 'Transcrevendo o áudio');
        const earlyConv = conversationId ? await getConversation(req.user.id, conversationId).catch(() => null) : null;
        const context = [...(earlyConv?.messages || [])].slice(-4).map(m => String(m.content || "").slice(0, 160)).join(" ");
        const heard = await transcribeKiraAudioDetailed(audio, { context: [context, message].filter(Boolean).join(" ") });
        if (!heard.text) {
          return res.status(422).json({ error: "Não consegui ouvir sua fala com clareza. Tente gravar de novo, mais perto do microfone." });
        }
        step('listen', 'Áudio transcrito', `“${heard.text.length > 90 ? `${heard.text.slice(0, 90)}…` : heard.text}”`, 'done');
        let spoken = heard.text;
        const cleanup = await cleanVoiceRequest(spoken, askVoiceModel);
        if (cleanup.cleaned) {
          spoken = cleanup.text;
          step('listen-clean', 'Pedido falado organizado', 'autocorreções e hesitações aplicadas', 'done');
        }
        textMessage = [message, spoken].filter(Boolean).join("\n");
        voiceInfo = { heard: heard.text, request: spoken, cleaned: cleanup.cleaned, provider: heard.provider, language: heard.language, confidence: heard.confidence };
        console.info(`[kira-audio] provider=${heard.provider} chars=${heard.text.length} cleaned=${cleanup.cleaned}`);
      } catch (audioError) {
        console.warn("[kira-audio] transcription_failed", audioError.status || audioError.message);
        return res.status(502).json({
          error: "Não foi possível entender o áudio. Tente gravar novamente."
        });
      }
    }

    let conv = conversationId ? await getConversation(req.user.id, conversationId) : null;
    if (!conv) {
      const title = textMessage.length > 48 ? textMessage.slice(0, 48) + "…" : textMessage;
      conv = await createConversation(req.user.id, title);
    }

    // KIRA_MEMORY_V1: últimas mensagens completas + resumo das antigas + fatos do usuário.
    const history = buildHistory(conv.messages);
    let memoryFacts = [];
    let memoryOn = true;
    try {
      memoryOn = (await getMemorySettings(req.user.id)).enabled;
      if (memoryOn) memoryFacts = await listUserMemories(req.user.id);
    } catch (memErr) { console.warn("[kira-memory] leitura falhou:", memErr.message); }
    const olderCount = Math.max(0, conv.messages.length - RECENT_MESSAGES);
    requestMemory.getStore().memory = memoryBlock({ facts: memoryFacts, summary: olderCount > 0 ? conv.summary || "" : "" });
    if (memoryFacts.length || (olderCount && conv.summary)) console.info(`[kira-memory] facts=${memoryFacts.length} summary=${olderCount && conv.summary ? conv.summary.length : 0} history=${history.length}`);
    const groqHistory = history.map(m => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.parts?.[0]?.text || ""
    }));
    const active = conv?.id ? await getActiveProject(req.user.id, conv.id) : null;
    const mentioned = message ? await findProjectMention(req.user.id, message) : null;
    const resolvedArtifactId = artifactId || mentioned?.id || active?.artifactId || null;
    const existingArtifact = resolvedArtifactId ? await getArtifact(req.user.id, resolvedArtifactId) : null;
    // KIRA_CHECKLIST_V1: cada palavra do pedido vira item obrigatório no prompt de todas as chamadas desta requisição.
    const requestChecklist = buildChecklist(textMessage);
    requestMemory.getStore().checklist = checklistBlock(requestChecklist);
    if (checklistSize(requestChecklist)) console.info(`[kira-checklist] items=${checklistSize(requestChecklist)} exact=${requestChecklist.exact.length} qty=${requestChecklist.quantities.length} forbidden=${requestChecklist.forbidden.length}`);
    const {kind: rawIntentKind, editingArtifact: rawEditingArtifact, wantsArtifact: rawWantsArtifact} = classifyKiraIntent(textMessage, Boolean(existingArtifact));
    // KIRA_IMAGE_FIDELITY_V1: "agora deixe o céu roxo" logo após uma imagem é ajuste da imagem, não do projeto.
    const recentAssistant = [...(conv.messages || [])].slice(-4).reverse().find(m => m.role === "assistant");
    const previousImageUrl = recentAssistant?.imageUrl || null;
    const imageFollowUp = Boolean(!image?.data && previousImageUrl && isImageEditFollowUp(textMessage));
    const referenceImageEdit = Boolean(image?.data && isReferenceImageRequest(textMessage));
    // KIRA_CAROUSEL_V1: carrossel novo ou ajuste do último carrossel desta conversa.
    const previousCarousel = [...(conv.messages || [])].slice(-6).reverse().find(m => m.role === "assistant" && m.file?.format === "carousel")?.file || null;
    const newCarousel = detectCarouselRequest(textMessage);
    const carouselEdit = Boolean(previousCarousel?.carousel?.spec && isCarouselEdit(textMessage) &&
      !(newCarousel && /\b(crie|cria|criar|fa[çc]a|faz|gere|gera|monte|novo|nova|outro|hazme|haz|crea|crear|genera|create|make|new)\b/i.test(textMessage)));
    const carouselRequest = carouselEdit ? { format: previousCarousel.carousel.spec.format, edit: true } : newCarousel;
    // KIRA_FILES_V1: "crie uma apresentação/planilha/PDF..." gera arquivo para download.
    const fileRequest = !carouselRequest && !image?.data && !imageFollowUp ? detectFileRequest(textMessage) : null;
    const wantsImage = !carouselRequest && !fileRequest && (imageFollowUp || referenceImageEdit || (!image?.data && kiraWantsGeneratedImage(textMessage)));
    const editingArtifact = rawEditingArtifact && !imageFollowUp && !fileRequest && !carouselRequest;
    const wantsArtifact = rawWantsArtifact && !imageFollowUp && !fileRequest && !carouselRequest;
    const intentKind = carouselRequest ? "carousel" : fileRequest ? "file" : wantsImage ? "image" : rawIntentKind;
    console.info(`[kira-intent] kind=${intentKind}`);
    const complexity = classifyKiraComplexity(textMessage, intentKind);
    console.info(`[kira-complexity] level=${complexity} path=${complexity==="advanced"?"groq-first":complexity==="project"?"workspace":"fast-chat"}`);
    const currentParts = [{ text: textMessage }];
    if (image?.data) currentParts.push({ inlineData: { mimeType: image.mimeType || "image/jpeg", data: image.data } });
    // Áudio já transcrito; a solicitação segue como texto pelo fluxo normal.
    const contents = [...history, { role: "user", parts: currentParts }];

    const route = routeRequest({message:textMessage,image,audio:null,editingArtifact,wantsArtifact,projectChars:estimateChars(existingArtifact?.files||[])});

    // Cache conservador: apenas conversa simples, sem anexos/projeto. Exact match + similaridade muito alta.
    if(history.length===0 && route.task==="chat_small" && complexity==="simple" && !image && !audio && !kiraWantsGeneratedImage(textMessage) && !needsWebSearch(textMessage) && !detectFileRequest(textMessage)){
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
    let fidelityNote = "";
    let deliveryInfo = null; // KIRA_PROJECT_DELIVERY_V1
    let searchInfo = null; // fontes da pesquisa na web, quando houver
    let fileMeta = null; // arquivo gerado (PDF, Word, Excel, CSV, PowerPoint)
    let requirements = []; // checklist de fidelidade (também usado no fallback Groq)
    const withProjectImages = async files => {
      const result = await rewriteProjectImages(files, publicBaseUrl(req));
      if (result.ids.length) { console.info(`[kira-project-image] queued=${result.ids.length}`); warmProjectImages(result.ids); step('images', `Preparando ${result.ids.length} imagens do projeto`, 'geradas em segundo plano', 'done'); }
      return result.files;
    };
    let usedFallback = false;
    let selectedProvider = null;
    let selectedModel = null;

    try {
      // KIRA_MULTIMODAL_V2: gerar imagem sem depender de function calling do modelo textual.
      // Preserva todas as rotas anteriores para os demais pedidos.
      if (wantsImage && !editingArtifact) {
        let previous = null;
        if (imageFollowUp) {
          previous = await readImageMeta(previousImageUrl);
          if (!previous) {
            // Sem metadados (ex.: imagem anterior a esta versão): usa o pedido que gerou a imagem.
            const msgs = conv.messages || [];
            const idx = msgs.lastIndexOf(recentAssistant);
            previous = { request: msgs.slice(0, idx).reverse().find(m => m.role === "user")?.content || "" };
          }
        }
        const reference = referenceImageEdit && image?.reference?.data
          ? { bytes: Buffer.from(image.reference.data, "base64"), mimeType: image.reference.mimeType || "image/jpeg" }
          : null;
        const result = await createFaithfulImage({
          request: textMessage, previous, reference,
          ask: askRequirementsModel, askVision: askVisionModel,
          generate: generateKiraImage, onProgress: step
        });
        imageUrl = result.url;
        const v = result.verification;
        reply = previous ? "Pronto, ajustei a imagem." : reference ? "Aqui está a sua foto transformada." : "Aqui está a imagem solicitada.";
        if (v && v.score < Number(process.env.KIRA_IMAGE_MIN_SCORE || 8) && v.missing.length) {
          reply += `\n\nConferi a imagem e estes detalhes podem não ter saído como você pediu: ${v.missing.slice(0, 4).join("; ")}. Quer que eu tente de novo?`;
        }
        console.info(`[kira-image] fidelity attempts=${result.attempts} score=${v?.score ?? "n/a"} edit=${Boolean(previous)} reference=${Boolean(reference)}`);
      }
      if (!reply && carouselRequest) {
        try {
          const made = await createKiraCarousel({ request: textMessage, userImages: attachedImages, format: carouselRequest.format, previous: carouselRequest.edit ? previousCarousel : null,
            history, groqHistory, userId: req.user.id, step, checklist: requestChecklist, langHint: voiceInfo?.language });
          fileMeta = made.file;
          reply = made.reply;
          selectedProvider = made.provider;
        } catch (carErr) {
          console.warn("[kira-carousel] criação falhou:", carErr.status || carErr.message);
          const lang = detectLanguage(textMessage, WHISPER_LANG[String(voiceInfo?.language || "").toLowerCase()] || "pt");
          step("carousel-render", "Não foi possível montar o carrossel agora", "", "done");
          reply = { pt: "Não consegui montar o carrossel agora: os serviços de IA estão sobrecarregados. Tente de novo em 1 ou 2 minutos — é só reenviar o pedido (e as fotos, se houver).",
            es: "No pude armar el carrusel ahora: los servicios de IA están sobrecargados. Inténtalo de nuevo en 1 o 2 minutos; solo reenvía tu pedido (y las fotos, si las hay).",
            en: "I couldn't build the carousel right now because the AI services are overloaded. Please try again in a minute or two — just resend your request (and photos, if any)." }[lang] || "";
          selectedProvider = "none";
        }
      }
      if (!reply && fileRequest) {
        try {
          const made = await createKiraFile({ format: fileRequest.format, request: textMessage, history, groqHistory, userId: req.user.id, step, langHint: voiceInfo?.language });
          fileMeta = made.file;
          reply = made.reply;
          selectedProvider = made.provider;
        } catch (fileErr) {
          // Não cair numa resposta de texto qualquer: o usuário pediu um arquivo.
          console.warn("[kira-file] criação falhou:", fileErr.status || fileErr.message);
          const lang = detectLanguage(textMessage, WHISPER_LANG[String(voiceInfo?.language || "").toLowerCase()] || "pt");
          step("file-render", "Não foi possível gerar o arquivo agora", "serviços de IA sobrecarregados", "done");
          reply = {
            pt: "Não consegui gerar o arquivo agora: os serviços de IA estão sobrecarregados neste momento. Tente de novo em 1 ou 2 minutos — seu pedido não se perdeu, é só reenviar.",
            es: "No pude generar el archivo ahora: los servicios de IA están sobrecargados en este momento. Inténtalo de nuevo en 1 o 2 minutos; solo tienes que reenviar tu pedido.",
            en: "I couldn't generate the file right now because the AI services are overloaded. Please try again in a minute or two — just resend your request."
          }[lang];
          selectedProvider = "none";
        }
      }
      // KIRA_WEB_SEARCH_V1: perguntas sobre o presente são respondidas com pesquisa real na web.
      if (!reply && !wantsArtifact && !editingArtifact && !wantsImage && !image?.data && needsWebSearch(textMessage)) {
        try {
          searchInfo = await webSearchAnswer({
            message: textMessage, history, groqHistory, systemInstruction: systemPrompt(),
            searchGemini: geminiWebSearch,
            searchGroq: GROQ_ENABLED ? (systemInstruction, msg, hist) => callGroqWebSearch({ systemInstruction, message: msg, history: hist }) : null,
            onProgress: step
          });
          reply = searchInfo.text;
          selectedProvider = searchInfo.provider;
        } catch (searchErr) {
          console.warn("[kira-search] indisponível; resposta sem pesquisa:", searchErr.status || searchErr.message);
          step('search', 'Pesquisa indisponível agora', 'respondendo com o conhecimento interno', 'done');
        }
      }
      if (!reply) {
        if (wantsArtifact) step('understand', 'Entendendo o pedido');
        else if (editingArtifact) step('read', 'Lendo os arquivos do projeto', existingArtifact?.name || '');
        else if (image?.data) step('look', 'Analisando a imagem');
        else step('think', 'Pensando na resposta');
      }
      if(!reply && complexity!=="advanced" && !editingArtifact && !wantsArtifact && !image && (route.task==="chat_small" || route.task==="chat")){
        try{
          const extra=await callExtraPool({systemInstruction:systemPrompt(),message:textMessage,history:groqHistory,maxTokens:700});
          reply=extra.text; route.selectedProvider=extra.provider; route.selectedModel=extra.model;
          selectedProvider=extra.provider; selectedModel=extra.model;
        }catch(extraErr){
          if(extraErr.code!=="no_extra_provider") console.warn("[router] provedores extras indisponíveis:",extraErr.message);
        }
      }
      if(!reply && !image && !audio && route.task==="chat_small" && route.providers[0]?.provider==="openai" && OPENAI_ENABLED){
        reply=await callOpenAIText({systemInstruction:systemPrompt(),message:textMessage,history:groqHistory,model:route.providers[0].model,maxTokens:900});
        route.selectedProvider="openai"; route.selectedModel=route.providers[0].model;
        selectedProvider="openai"; selectedModel=route.providers[0].model;
      }
      const projectBrief = editingArtifact && existingArtifact ? await getProjectBrief(req.user.id, existingArtifact.id).catch(() => null) : null;
      // KIRA_VISUAL_REFERENCE_V1: print/mockup anexado vira referência visual do projeto (antes era descartado).
      const referenceParts = image?.data ? [{ text: VISUAL_REFERENCE_NOTE }, { inlineData: { mimeType: image.mimeType || "image/jpeg", data: image.data } }] : [];
      // KIRA_REQUIREMENTS_V1: pedidos complexos viram um checklist verificável antes da geração.
      if (wantsArtifact && !reply && isComplexProjectRequest(textMessage)) {
        const extracted = await extractRequirements(textMessage, askRequirementsModel);
        requirements = extracted.requirements;
        console.info(`[kira-requirements] source=${extracted.source} count=${requirements.length}`);
        step('understand', `Checklist com ${requirements.length} requisitos`, requirements.slice(0, 3).map(r => r.text).join(' · '), 'done');
      } else if (wantsArtifact && !reply) step('understand', 'Pedido entendido', '', 'done');
      if (wantsArtifact && !reply) {
        const brief = buildDesignBrief(textMessage);
        step('design', 'Direção visual definida', `${brief.domain} · ${brief.fonts.display} + ${brief.fonts.body}`, 'done');
        step('build', 'Construindo o projeto', 'escrevendo os arquivos');
      } else if (editingArtifact && !reply) step('edit', 'Aplicando as alterações');
      // KIRA_PROJECT_INTEGRITY_V1: projetos com banco seguem a estrutura full-stack e passam pelas checagens completas.
      const databaseProject = Boolean((wantsArtifact || editingArtifact) && detectDatabaseRequest(textMessage));
      const deliveryAsk = "\n\nAo chamar a função, preencha também summary (o que foi feito, 3 a 5 tópicos curtos) e suggestions (3 próximos passos específicos para este projeto), no idioma do pedido.";
      const projectPrompt = (issues=[]) => (isComplexProjectRequest(textMessage) || databaseProject ? developerPrompt(textMessage,issues,requirements) : artifactQualityPrompt(textMessage,issues)) + (databaseProject ? databaseProjectPrompt() : "") + deliveryAsk;
      const aiContents = editingArtifact
        ? [{ role: "user", parts: [{ text: artifactEditPrompt(existingArtifact, textMessage, projectBrief) + (databaseProject ? databaseProjectPrompt() : "") + deliveryAsk }, ...referenceParts] }]
        : (wantsArtifact
          ? [...history, { role: "user", parts: [{ text: projectPrompt() }, ...referenceParts] }]
          : contents);
      // KIRA_ADVANCED_GROQ_FIRST_V1: apenas conversa técnica, nunca workspace.
      if (!reply && complexity==="advanced" && !editingArtifact && !wantsArtifact && !image && !audio && GROQ_ENABLED) {
        try {
          const preferredModel=process.env.KIRA_ADVANCED_GROQ_MODEL || "openai/gpt-oss-20b";
          reply=await callGroqFallback({
            systemInstruction:systemPrompt(), message:textMessage, history:groqHistory, preferredModel,
            onSelectedModel:(model)=>{selectedModel=model;}
          });
          if(reply) {
            selectedProvider="groq";
            route.selectedProvider="groq";
            route.selectedModel=selectedModel || preferredModel;
            console.info("[kira-router] advanced=groq-first selected="+route.selectedModel);
          }
        } catch(e) {
          console.warn("[kira-router] advanced Groq falhou; seguindo Gemini:",e.status || e.message);
        }
      }
      const data = reply ? null : await callGemini({
        systemInstruction: systemPrompt(),
        contents: aiContents,
        forceFunctionName: editingArtifact ? "update_artifact" : (wantsArtifact ? "create_document" : undefined)
      });
      if(data){selectedProvider="gemini"; selectedModel=data._kiraModel || GEMINI_MODEL;}
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCall = parts.find((p) => p.functionCall)?.functionCall;

      if (functionCall?.name === "create_file") {
        // O modelo decidiu gerar um arquivo no meio da conversa ("me manda isso em PDF").
        const format = FILE_FORMATS[functionCall.args?.format] ? functionCall.args.format : "pdf";
        const made = await createKiraFile({ format, request: textMessage, presetSpec: functionCall.args, history, groqHistory, userId: req.user.id, step, langHint: voiceInfo?.language });
        fileMeta = made.file;
        reply = made.reply;
      } else if (functionCall?.name === "generate_image") {
        const prompt = functionCall.args?.prompt || textMessage;
        const result = await createFaithfulImage({ request: prompt, ask: askRequirementsModel, askVision: askVisionModel, generate: generateKiraImage, onProgress: step });
        imageUrl = result.url;
        reply = "Aqui está a imagem que você pediu.";
            } else if (functionCall?.name === "update_artifact" && editingArtifact) {
        const args=functionCall.args||{};
        const changes=Array.isArray(args.changes)?args.changes:[];
        const applied=applyFileOperations(existingArtifact.files,changes);
        if(!applied.manifest.created.length&&!applied.manifest.updated.length&&!applied.manifest.deleted.length) throw new Error("Nenhuma alteração válida retornada.");
        let normalized=repairGeneratedHtml(repairMissingDependencies(repairRouterFutureFlags(applied.files).files).files);
        // KIRA_MEMORY_V1: a edição não pode quebrar o que o pedido original exigia (nem introduzir erros de React).
        const briefReqs=projectBrief?.requirements||[];
        const reactBefore=new Set([...inspectReactProject(existingArtifact.files).issues, ...inspectProjectIntegrity(existingArtifact.files).blocking]);
        const regressions=()=>{
          const before=verifyRequirements(existingArtifact.files,briefReqs);
          const after=verifyRequirements(normalized.files,briefReqs);
          const lost=after.missing.filter(m=>!before.missing.some(b=>b.id===m.id));
          const newReact=[...inspectReactProject(normalized.files).issues, ...inspectProjectIntegrity(normalized.files,{database:databaseProject}).blocking].filter(i=>!reactBefore.has(i));
          if(databaseProject) newReact.push(...inspectProjectIntegrity(normalized.files,{database:true}).soft.filter(i=>!reactBefore.has(i)));
          return { lost, newReact, issues:[...lost.map(r=>`a edição removeu/quebrou o requisito original "${r.text}" (${r.reason})`), ...newReact] };
        };
        let regression=regressions();
        if(regression.issues.length){
          step('edit', `Conferindo a edição · ${regression.issues.length} ponto(s) quebrado(s)`, regression.issues[0].slice(0,110));
          console.warn(`[kira-edit] regressions=${regression.issues.length} first="${regression.issues[0].slice(0,120)}"`);
          try{
            const fixData=await callGemini({ systemInstruction:systemPrompt(), contents:[{role:"user",parts:[{text:projectFixPrompt(`${textMessage}\n\n(Edição de um projeto existente. Mantenha a alteração pedida e restaure o que foi quebrado.)`, { files: normalized.files, issues: regression.issues, req:{ missing: regression.lost }, visual:{ issues: [] } }, briefReqs)}]}], forceFunctionName:"update_artifact" });
            const fixCall=(fixData.candidates?.[0]?.content?.parts||[]).find(p=>p.functionCall)?.functionCall;
            const fixChanges=Array.isArray(fixCall?.args?.changes)?fixCall.args.changes:[];
            if(fixChanges.length){
              const fixed=applyFileOperations(normalized.files,fixChanges);
              const previous=normalized;
              normalized=repairGeneratedHtml(repairMissingDependencies(fixed.files).files);
              const after=regressions();
              if(after.issues.length<=regression.issues.length){
                regression=after;
                for(const key of ["created","updated","deleted"]) applied.manifest[key]=[...new Set([...applied.manifest[key],...fixed.manifest[key]])];
              } else normalized=previous;
            }
          }catch(fixErr){ console.warn("[kira-edit] correção de regressão falhou:", fixErr.status||fixErr.message); }
          console.info(`[kira-edit] regressions_after_fix=${regression.issues.length}`);
        }
        const updated=await saveVersionWithOperations(req.user.id,existingArtifact.id,await withProjectImages(normalized.files),args.summary||textMessage.slice(0,160),applied.manifest);
        artifactName=updated.name; artifactFiles=updated.files; responseArtifactId=updated.id; artifactVersion=updated.version;
        step('edit', 'Alterações aplicadas', `${applied.manifest.created.length+applied.manifest.updated.length+applied.manifest.deleted.length} arquivo(s) · v${artifactVersion}`, 'done');
        reply=`Atualizei **${artifactName}** para a **v${artifactVersion}**.`;
        deliveryInfo={ mode:"edit", summary:args.summary||"", suggestions:args.suggestions||[], manifest:applied.manifest };
      } else if (functionCall?.name === "create_document") {
        const parseArtifactArgs = (args={}) => ({
          name: args.projectName || "projeto",
          files: Array.isArray(args.files)
            ? args.files.filter(f=>f?.path && typeof f.content==="string" && f.content.trim())
                .map(f=>({path:String(f.path).trim(),content:f.content,language:f.language||""}))
            : []
        });

        const normalizeFiles=files=>{
          const base=repairImageSources(repairPackageJsonNewlines(repairWebConnections(files))).files;
          const deps=repairMissingDependencies(repairRouterFutureFlags(base).files);
          if(deps.added.length) console.info(`[kira-integrity] deps_added=${deps.added.join(",")}`);
          return deps.files;
        };
        const complex=isComplexProjectRequest(textMessage) || databaseProject;
        // Avalia uma versão do projeto: estrutura (bloqueia), requisitos (fidelidade) e visual (acabamento).
        const evaluate=(files,coverage)=>{
          const quality=validateArtifact(files,textMessage);
          const dev=complex ? analyzeProject(files,textMessage) : {ok:true,issues:[]};
          const visual=inspectVisualQuality(files,textMessage);
          const req=verifyRequirements(files,requirements,coverage);
          const integrity=inspectProjectIntegrity(files,{database:databaseProject});
          const structural=[...new Set([...quality.issues,...dev.issues,...integrity.blocking])];
          return { files: quality.files.length ? quality.files : files, coverage, structural, soft:integrity.soft, visual, req,
            issues:[...structural,...requirementIssues(req),...integrity.soft,...visual.issues] };
        };
        // Melhor versão: menos erros estruturais, depois mais requisitos atendidos, depois melhor nota visual.
        const better=(a,b)=> a.structural.length!==b.structural.length ? a.structural.length<b.structural.length
          : a.req.missing.length!==b.req.missing.length ? a.req.missing.length<b.req.missing.length
          : a.soft.length!==b.soft.length ? a.soft.length<b.soft.length
          : a.visual.score>=b.visual.score;
        const logEval=(label,e)=>console.info(`[kira-developer] ${label} structural=${e.structural.length} requirements=${e.req.covered}/${e.req.total} integrity_soft=${e.soft.length} visual=${e.visual.score}${e.structural.length?` first="${e.structural[0].slice(0,100)}"`:""}`);

        const finishReason=candidate?.finishReason;
        if(finishReason && finishReason!=="STOP") console.warn(`[kira-developer] finish_reason=${finishReason}`);
        let parsed=parseArtifactArgs(functionCall.args||{});
        const projectName=parsed.name;
        let best=evaluate(normalizeFiles(parsed.files),functionCall.args?.coverage);
        logEval("attempt=1",best);
        step('build', 'Fase 1 finalizada', `${best.files.length} arquivos gerados`, 'done');
        step('verify', 'Verificando requisitos e código');
        const verifyDetail=e=>`${e.req.total?`${e.req.covered}/${e.req.total} requisitos · `:''}${e.structural.length} erro(s) · visual ${e.visual.score}/100`;
        step('verify', 'Verificação concluída', verifyDetail(best), 'done');
        const hadFixPhase=best.issues.length>0;
        if(hadFixPhase) step('fix', `Fase 2 · ajustando ${best.issues.length} ponto(s)`);

        // Tentativa 2: projeto cortado ou sem arquivos essenciais → regenera inteiro; senão → correção cirúrgica,
        // que mantém o que já está certo e só reescreve/cria os arquivos com problema.
        const missingCore=best.structural.some(i=>/^falta |nenhum arquivo válido|package\.json/.test(i));
        if(best.issues.length && (finishReason==="MAX_TOKENS" || missingCore || best.files.length<2)){
          const retryData=await callGemini({ systemInstruction:systemPrompt(), contents:[{role:"user",parts:[{text:projectPrompt(best.issues)}, ...referenceParts]}], forceFunctionName:"create_document" });
          const retryCall=(retryData.candidates?.[0]?.content?.parts||[]).find(p=>p.functionCall)?.functionCall;
          if(retryCall?.name==="create_document"){
            const retried=evaluate(normalizeFiles(parseArtifactArgs(retryCall.args||{}).files),retryCall.args?.coverage);
            logEval("attempt=2 mode=regenerate",retried);
            if(better(retried,best)) best=retried;
          }
        }
        for(let pass=1; pass<=(databaseProject?3:2) && best.issues.length; pass++){
          // Problemas só visuais na 2ª passada não justificam outra chamada.
          if(pass===2 && !best.structural.length && !best.req.missing.length && !best.soft.length) break;
          if(pass===3 && !best.structural.length && !best.soft.length) break; // 3ª passada só para erros e banco de dados
          try{
            const fixData=await callGemini({ systemInstruction:systemPrompt(), contents:[{role:"user",parts:[{text:projectFixPrompt(textMessage,best,requirements)}, ...referenceParts]}], forceFunctionName:"update_artifact" });
            const fixCall=(fixData.candidates?.[0]?.content?.parts||[]).find(p=>p.functionCall)?.functionCall;
            const changes=Array.isArray(fixCall?.args?.changes)?fixCall.args.changes:[];
            if(!changes.length) break;
            const applied=applyFileOperations(best.files,changes);
            const fixed=evaluate(normalizeFiles(applied.files),best.coverage);
            logEval(`fix=${pass} changed=${changes.length}`,fixed);
            if(better(fixed,best)) best=fixed; else break;
          }catch(fixErr){
            console.warn("[kira-developer] correção cirúrgica falhou:",fixErr.status||fixErr.message);
            break;
          }
        }

        if(hadFixPhase) step('fix', 'Fase 2 finalizada', verifyDetail(best), 'done');
        if(best.structural.length){
          const e=new Error(`Artifact reprovado no Developer Agent: ${best.structural.join("; ")}`);
          e.code="artifact_quality_failed";
          throw e;
        }

        artifactName=projectName;
        artifactFiles=best.files;
        reply=artifactSuccessReply(artifactFiles); fidelityNote=requirementsNote(best.req);
        deliveryInfo={ mode:"create", summary:functionCall.args?.summary||"", suggestions:functionCall.args?.suggestions||[] };
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
      // Não anunciar uma imagem que não foi gerada.
      if (wantsImage) {
        console.warn("[kira-image] generation_failed:", err.message);
        return res.status(err.quota ? 429 : 502).json({
          error: err.imageUnavailable ? err.message : "Não consegui gerar a imagem agora. Tente novamente."
        });
      }
      // Preservar a análise visual: não substituir imagens por um fallback apenas textual.
// Áudios já transcritos podem utilizar o fallback textual.
      if (image?.data) {
        console.warn(`[kira-multimodal] unavailable kind=${audio?.data ? 'audio' : 'image'} status=${err.status || 'error'}`);
        return res.status(502).json({ error: audio?.data
          ? 'Não consegui processar o áudio neste momento. O serviço de compreensão de áudio está indisponível; tente novamente.'
          : 'Não consegui analisar a imagem neste momento. O serviço de visão está indisponível; tente novamente.' });
      }
      if (GROQ_ENABLED) {
        try {
          if (editingArtifact) {
            const patch = await callGroqArtifactUpdateFallback({ systemInstruction: systemPrompt(), message: artifactEditPrompt(existingArtifact, textMessage) });
            const applied=applyFileOperations(existingArtifact.files,patch.changes);
            const normalized=repairGeneratedHtml(applied.files);
            const updated=await saveVersionWithOperations(req.user.id,existingArtifact.id,await withProjectImages(normalized.files),patch.summary,applied.manifest);
            artifactName=updated.name; artifactFiles=updated.files; responseArtifactId=updated.id; artifactVersion=updated.version;
            reply = `Atualizei **${artifactName}** para a **v${artifactVersion}**.`;
            deliveryInfo = { mode: "edit", summary: patch.summary || "", suggestions: [], manifest: applied.manifest };
          } else if (wantsArtifact) {
            // KIRA_PROJECT_ARTIFACT_FIX_V1: usar modelo comprovado em projetos.
            const artifact = await callGroqArtifactFallback({ systemInstruction: systemPrompt(), message: isComplexProjectRequest(textMessage) ? developerPrompt(textMessage,[],requirements) : artifactQualityPrompt(textMessage), preferredModel: process.env.KIRA_ARTIFACT_GROQ_MODEL || "openai/gpt-oss-120b", onSelectedModel: (model) => { selectedModel=model; } });
            artifactName = artifact.projectName;
            artifactFiles = repairImageSources(repairPackageJsonNewlines(repairWebConnections(artifact.files))).files;
            console.info(`[kira-visual] provider=groq score=${inspectVisualQuality(artifactFiles,textMessage).score}`);
            const quality=validateArtifact(artifactFiles,textMessage);
            const devQuality=isComplexProjectRequest(textMessage) ? analyzeProject(artifactFiles,textMessage) : {ok:true,issues:[]};
            let issues=[...quality.issues,...devQuality.issues];
            let packageRepaired=false; // KIRA_V4_PACKAGE_PRESERVE_FIX
             // KIRA_TARGETED_PACKAGE_REPAIR_V1
             // Conserta apenas package.json, sem enviar os outros arquivos nem regenerar o projeto.
             if(issues.length===1 && issues[0]==="package.json contém JSON inválido"){
               const pkg=artifactFiles.find(f=>String(f.path).replace(/\\/g,"/")==="package.json");
               if(pkg){
                 try{
                   const fixed=await callGroqPackageJsonRepair({
                     originalContent:pkg.content,
                     projectRequest:textMessage,
                     onSelectedModel:(model)=>{selectedModel=model;}
                   });
                   const candidate=artifactFiles.map(f=>f===pkg?{...f,content:fixed}:f);
                   const checked=analyzeProject(candidate,textMessage);
                   const basic=validateArtifact(candidate,textMessage);
                   if(checked.ok && basic.ok){
                     artifactFiles=candidate;
                     issues=[];
                     packageRepaired=true;
                     console.info('[kira-package-targeted] status=repaired');
                   }else{
                     console.warn('[kira-package-targeted] status=rejected reason=validation_failed');
                   }
                 }catch(packageError){
                   console.warn('[kira-package-targeted] status=failed code='+String(packageError.code||packageError.status||'unknown'));
                 }
               }
             }
             if(issues.length===1 && issues[0]==="package.json contém JSON inválido"){
               throw new Error('package.json inválido; reparo pontual não aprovado. Projeto não salvo.');
             }
            // KIRA_ARTIFACT_TARGETED_REPAIR_V4: solicitar apenas arquivos ausentes.
            if (issues.length) {
              const missing = new Set();
              for (const issue of issues) {
                if (issue === "falta package.json para a stack solicitada") missing.add("package.json");
                else if (issue === "falta index.html") missing.add("index.html");
                else if (issue === "falta src/main.jsx/tsx") missing.add("src/main.jsx");
                else if (issue === "falta src/App.jsx/tsx") missing.add("src/App.jsx");
                else if (/^falta (style\.css|script\.js)$/.test(issue)) missing.add(issue.slice(6));
              }
              const missingOnly = missing.size > 0 && issues.every(issue =>
                issue === "falta package.json para a stack solicitada" ||
                issue === "falta index.html" ||
                issue === "falta src/main.jsx/tsx" ||
                issue === "falta src/App.jsx/tsx" ||
                /^falta (style\.css|script\.js)$/.test(issue)
              );
              if (!missingOnly) throw new Error(`Artifact incompleto; reparo limitado para economizar tokens: ${issues.slice(0,5).join('; ')}`);
              const existingPaths = artifactFiles.map(f => f.path);
              const repairMessage = `Pedido original: ${textMessage.slice(0,2000)}\n` +
                `Arquivos que JÁ existem (não gere novamente): ${existingPaths.join(', ')}\n` +
                `Gere SOMENTE estes arquivos ausentes, com conteúdo completo: ${[...missing].join(', ')}. ` +
                `Retorne objeto JSON com projectName e files (path, content). Não inclua arquivos existentes. Preserve a stack solicitada.`;
              console.info(`[kira-artifact] targeted_missing=${missing.size} retry=1`);
              const repaired = await callGroqArtifactFallback({ systemInstruction: systemPrompt(), message: repairMessage,
                preferredModel: process.env.KIRA_ARTIFACT_GROQ_MODEL || "openai/gpt-oss-120b",
                onSelectedModel: model => { selectedModel=model; } });
              const existingSet = new Set(existingPaths.map(p => p.replaceAll('\\','/')));
              const requestedSet = new Set(missing);
              const additions = repaired.files.filter(f => requestedSet.has(f.path.replaceAll('\\','/')) && !existingSet.has(f.path.replaceAll('\\','/')));
              if (!additions.length) throw new Error('Reparo não retornou arquivos ausentes; projeto não salvo.');
              const combined = repairPackageJsonNewlines(repairWebConnections([...artifactFiles, ...additions]));
              const retryQuality = validateArtifact(combined,textMessage);
              const retryDev = isComplexProjectRequest(textMessage) ? analyzeProject(combined,textMessage) : {ok:true,issues:[]};
              const retryIssues = [...retryQuality.issues,...retryDev.issues];
              if (retryIssues.length) throw new Error(`Reparo parcial reprovado: ${retryIssues.slice(0,5).join('; ')}`);
              artifactFiles=retryQuality.files;
              console.info(`[kira-artifact] targeted_repair=ok files=${artifactFiles.length}`);
            } else if (!packageRepaired) {
              // Nunca sobrescrever o package.json reparado com o snapshot anterior.
              artifactFiles=quality.files;
            }
            const groqReq = verifyRequirements(artifactFiles, requirements, []);
            if (requirements.length) console.info(`[kira-developer] provider=groq requirements=${groqReq.covered}/${groqReq.total}`);
            reply = artifactSuccessReply(artifactFiles); fidelityNote = requirementsNote(groqReq);
            deliveryInfo = { mode: "create", summary: "", suggestions: [] };
          } else {
            reply = await callGroqFallback({ systemInstruction: systemPrompt(), message: textMessage, history: groqHistory, onSelectedModel: (model) => { selectedModel=model; } });
          }
          usedFallback = true;
          selectedProvider="groq";
        } catch (groqErr) {
          console.error(`[kira-artifact] fallback_failed status=${groqErr.status || "none"} code=${groqErr.code || "none"} reason=${groqErr.message}`);
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

    // KIRA_WEB_SEARCH_V1: se a resposta admitir que está desatualizada ("meu conhecimento vai até 2023"), pesquisa e responde de novo.
    if (!searchInfo && reply && !artifactFiles?.length && !imageUrl && !image?.data && !wantsArtifact && !editingArtifact && looksOutdated(reply)) {
      console.info("[kira-search] trigger=outdated_reply");
      try {
        searchInfo = await webSearchAnswer({
          message: textMessage, history, groqHistory, systemInstruction: systemPrompt(),
          searchGemini: geminiWebSearch,
          searchGroq: GROQ_ENABLED ? (systemInstruction, msg, hist) => callGroqWebSearch({ systemInstruction, message: msg, history: hist }) : null,
          onProgress: step
        });
        reply = searchInfo.text;
      } catch (searchErr) {
        console.warn("[kira-search] nova tentativa com pesquisa falhou:", searchErr.status || searchErr.message);
      }
    }
    if (reply && selectedProvider) console.info(`[kira-provider] selected=${selectedProvider} model=${selectedModel || "not-reported"} intent=${intentKind} complexity=${complexity}`);
    // KIRA_HTML_ARTIFACT_REPAIR_V1_INTEGRATION
    if (artifactFiles?.length) {
      const repairedHtml = repairGeneratedHtml(artifactFiles);
      artifactFiles = repairedHtml.files;
      if (repairedHtml.repairedFiles) {
        console.info(`[kira-html-repair] repaired_files=${repairedHtml.repairedFiles} escapes=${repairedHtml.repairedEscapes}`);
        reply = artifactSuccessReply(artifactFiles);
      }
    }
    // KIRA_ARTIFACT_NEWLINE_REPAIR_V1_INTEGRATION
    if (artifactFiles?.length) {
      const repairedNewlines = repairArtifactNewlines(artifactFiles, inspectProjectSyntax);
      artifactFiles = repairedNewlines.files;
      if (repairedNewlines.fixed) {
        console.info(`[kira-newline] repaired_files=${repairedNewlines.fixed} tokens=${repairedNewlines.tokens}`);
        reply = artifactSuccessReply(artifactFiles);
      }
    }
    if (artifactFiles?.length) step('quality', 'Validação final de sintaxe e qualidade');
    // Quality Gate: valida o resultado FINAL, após os reparos e antes da persistência.
    if (artifactFiles?.length) {
      try {
        const report=inspectProjectFiles(artifactFiles);
        console.info('[kira-quality] checked='+report.filesChecked+' issues='+report.issues.length+' warnings='+report.warnings.length);
        for(const item of report.issues.slice(0,12))console.warn('[kira-quality] issue='+item);
        for(const item of report.warnings.slice(0,12))console.warn('[kira-quality] warning='+item);
        if (!report.ok) return res.status(422).json({ error: 'Projeto não salvo: validação final encontrou problemas: ' + report.issues.slice(0,3).join('; ') });
      } catch (qualityError) {
        console.warn('[kira-quality] validator_error='+qualityError.message);
        return res.status(422).json({ error: 'Projeto não salvo: não foi possível concluir a validação final.' });
      }
    }
    if (artifactFiles?.length) {
      try {
        const syntax = inspectProjectSyntax(artifactFiles);
        console.info(`[kira-syntax] checked=${syntax.checked} skipped=${syntax.skipped} issues=${syntax.issues.length} warnings=${syntax.warnings.length}`);
        for (const issue of syntax.issues.slice(0, 12)) console.warn(`[kira-syntax] issue=${issue}`);
        for (const warning of syntax.warnings.slice(0, 12)) console.warn(`[kira-syntax] warning=${warning}`);
if (syntax.issues.length) {
  let repaired = false;

  if (GROQ_ENABLED && !responseArtifactId) {
    try {
      const result = await repairProjectSyntax({
        files: artifactFiles,
        syntax,
        requestRepair: async (message) =>
          callGroqArtifactUpdateFallback({
            systemInstruction: systemPrompt(),
            message
          }),
        inspectSyntax: inspectProjectSyntax,
        inspectQuality: inspectProjectFiles
      });

      if (result.repaired) {
        artifactFiles = result.files;
        reply = artifactSuccessReply(artifactFiles);
        repaired = true;
        console.info("[kira-syntax-repair] success");
      }
    } catch (repairError) {
      console.warn(
        "[kira-syntax-repair] failed:",
        repairError.message
      );
    }
  }

  if (!repaired) {
    return res.status(422).json({
      error:
        "Projeto não salvo: problemas de sintaxe: " +
        syntax.issues.slice(0, 3).join("; ")
    });
  }
}
      } catch (error) { console.warn(`[kira-syntax] validator_error=${error.message}`); return res.status(422).json({ error: "Projeto não salvo: não foi possível verificar a sintaxe." }); }
    }
    if (artifactFiles?.length) step('quality', 'Validação final concluída', '', 'done');
    // KIRA_PROJECT_DELIVERY_V1: entrega explicada (o que foi feito, como rodar, banco, estrutura e sugestões).
    if (deliveryInfo && artifactFiles?.length) {
      try {
        reply = projectDeliveryMessage({ ...deliveryInfo, files: artifactFiles, name: artifactName || "Projeto", version: artifactVersion || 1,
          lang: ["pt", "es", "en"].includes(detectLanguage(textMessage, "pt")) ? detectLanguage(textMessage, "pt") : "pt" });
      } catch (deliveryErr) { console.warn("[kira-delivery] falhou:", deliveryErr.message); }
    }
    if (fidelityNote && artifactFiles?.length) reply += fidelityNote;
    if (artifactFiles?.length && !responseArtifactId) {
      artifactFiles = await withProjectImages(artifactFiles);
      const createdArtifact = await createArtifactVersioned(req.user.id, conv.id, artifactName || "Artifact", artifactFiles, "Criação inicial");
      responseArtifactId = createdArtifact.id;
      artifactVersion = createdArtifact.version;
      const meta=inferProjectMetadata(createdArtifact.name,createdArtifact.files);
      await updateProjectMetadata(req.user.id,createdArtifact.id,meta);
      // KIRA_MEMORY_V1: ficha do projeto (pedido original + checklist) para as próximas edições.
      await saveProjectBrief(req.user.id,createdArtifact.id,{ request: textMessage.slice(0, 6000), requirements: requirements.length ? requirements : extractRequirementsHeuristic(textMessage), createdAt: new Date().toISOString() }).catch(e=>console.warn("[kira-memory] ficha do projeto não salva:", e.message));
      await setActiveProject(req.user.id,conv.id,createdArtifact.id);
    }

    if(responseArtifactId) await setActiveProject(req.user.id,conv.id,responseArtifactId);
    if (artifactFiles?.length) step('save', responseArtifactId ? `Projeto pronto · v${artifactVersion || 1}` : 'Projeto pronto', '', 'done');
    else if (!imageUrl && !searchInfo && !fileMeta) step('think', 'Resposta pronta', '', 'done');
    const hadAttachment = Boolean(image?.data || audio?.data);

    await appendMessages(req.user.id, conv.id, [
      { role: "user", content: textMessage, hadAttachment },
      { role: "assistant", content: reply, imageUrl, documentName, documentContent, artifactName, artifactFiles, artifactId: responseArtifactId, artifactVersion,
        searched: Boolean(searchInfo), searchQueries: searchInfo?.queries || [], visitedSites: searchInfo?.sources || [], searchEntryPoint: searchInfo?.entryPoint || null, file: fileMeta }
    ]);

    if(history.length===0 && route.task==="chat_small" && complexity==="simple" && reply && !imageUrl && !artifactFiles?.length && !image && !audio && !searchInfo && !fileMeta){
      await putCachedResponse(cacheFingerprint(textMessage),normalizeForCache(textMessage),reply,route.providers[0]?.model||"fallback");
    }
    // KIRA_MEMORY_V1: resumo e memória atualizados depois da resposta (não atrasam o usuário).
    setImmediate(() => { updateMemoryInBackground({ userId: req.user.id, conversationId: conv.id, memoryOn }).catch(e => console.warn("[kira-memory] atualização falhou:", e.message)); });
    res.json({ conversationId: conv.id, title: conv.title, reply, imageUrl, documentName, documentContent, artifactName, artifactFiles, artifactId: responseArtifactId, artifactVersion, usedFallback, route, cacheHit:false,
      sources: searchInfo?.sources || [], searchQueries: searchInfo?.queries || [], searchEntryPoint: searchInfo?.entryPoint || "", file: fileMeta, voice: voiceInfo });
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
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });

    // Limpeza inicial e periódica dos limites de autenticação.
    async function cleanupAuthLimits() {
      try {
        const removed = await cleanupExpiredAuthLimits();

        if (removed > 0) {
          console.log(`[AUTH] ${removed} registros expirados removidos.`);
        }
      } catch (err) {
        console.error("[AUTH] Falha na limpeza dos limites:", err);
      }
    }

    void cleanupAuthLimits();

    const cleanupTimer = setInterval(
      cleanupAuthLimits,
      24 * 60 * 60 * 1000
    );

    cleanupTimer.unref();
  })
  .catch((err) => {
    console.error("Falha ao inicializar o armazenamento de dados:", err);
    process.exit(1);
  });
