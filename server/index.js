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
import { callGroqFallback, callGroqArtifactFallback, GROQ_ENABLED } from "./lib/groq.js";
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
  createFeedback
} from "./lib/store.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const SYSTEM_PROMPT = `Você é Kira, uma assistente de IA conversacional, útil e direta.
Você ajuda com estes tipos de tarefa:
1. Conversa geral: responda perguntas, explique conceitos, ajude a resolver problemas.
2. Ideias: quando pedirem brainstorm, sugestões, planejamento ou criatividade, traga opções concretas e variadas.
3. Programação: você é parceira de programação. Escreva, revise, depure e explique código, sempre em blocos markdown com a linguagem indicada (ex: \`\`\`javascript).
4. Imagens e áudio: você entende imagens e áudios enviados. Também pode GERAR uma imagem: chame generate_image com um prompt detalhado (de preferência em inglês) quando pedirem para criar/desenhar algo.
5. Artifacts e projetos: quando o usuário pedir código, site, app, documento, plano, estrutura de projeto ou algo para criar/baixar/salvar, use create_document. Para projetos com mais de um arquivo, envie TODOS os arquivos juntos no mesmo artifact usando projectName + files. Nunca reduza um pedido de HTML/CSS/JS a apenas HTML. Respeite a tecnologia especificada pelo usuário. Se ele não especificar tecnologia, você pode sugerir ou escolher uma opção adequada e explicar brevemente a escolha; não troque silenciosamente a stack de um projeto existente.
${HOME_ASSISTANT_ENABLED ? "6. Controle de dispositivos: use control_device para ligar/desligar dispositivos reais via Home Assistant, só quando pedido claramente." : ""}

Responda sempre no mesmo idioma da última mensagem do usuário (português ou espanhol).

Tom de voz: converse de um jeito natural e direto, como uma pessoa competente conversando de verdade — não como um manual. Evite começar respostas com "Claro!" ou "Ótima pergunta!". Vá direto ao ponto. Prefira parágrafos corridos a listas quando uma explicação corrida for mais natural; use listas só quando itens são realmente paralelos entre si. Seja honesta mesmo quando a resposta é "não sei" ou "isso depende".

Regras de formatação (sua resposta é renderizada como Markdown puro):
- Nunca use tags HTML soltas como <br>, <b>, <div>. Para parágrafo novo, use uma linha em branco.
- Use tabelas Markdown só quando fizer sentido comparar itens lado a lado.
- Use ##/### só em respostas longas que se beneficiam de seções.

Se te perguntarem seu nome, diga que se chama Kira.`;

function publicUser(user) {
  return { id: user.id, username: user.username };
}

// ---------- Auth ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password || password.length < 6) {
      return res.status(400).json({ error: "Usuário, e-mail e senha com no mínimo 6 caracteres são obrigatórios." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await createUser({ username: username.trim(), email: email.trim().toLowerCase(), passwordHash });
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

// ---------- Chat (Kira) ----------

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { message, conversationId, image, audio } = req.body;
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
    const currentParts = [{ text: textMessage }];
    if (image?.data) currentParts.push({ inlineData: { mimeType: image.mimeType || "image/jpeg", data: image.data } });
    if (audio?.data) currentParts.push({ inlineData: { mimeType: audio.mimeType || "audio/webm", data: audio.data } });
    const contents = [...history, { role: "user", parts: currentParts }];

    consumeDailyBudget();

    let reply, imageUrl, documentName, documentContent, artifactName, artifactFiles;
    let usedFallback = false;

    // Quando o usuário pede explicitamente para criar/entregar arquivos ou um projeto,
    // garante que o Gemini devolva um artifact estruturado em vez de apenas Markdown.
    const wantsArtifact = /(?:cria|crie|criar|gera|gere|gerar|faça|fazer|monte|montar|desenvolva|desenvolver|entregue|quero|preciso|arquivo|arquivos|artifact|projeto|site|landing page|html|css|javascript|react|código|codigo)/i.test(textMessage)
      && /(?:arquivo|arquivos|artifact|projeto|site|landing page|html|css|javascript|react|código|codigo|download|baixar|pasta)/i.test(textMessage);

    try {
      const data = await callGemini({
        systemInstruction: SYSTEM_PROMPT,
        contents,
        forceFunctionName: wantsArtifact ? "create_document" : undefined
      });
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];
      const functionCall = parts.find((p) => p.functionCall)?.functionCall;

      if (functionCall?.name === "generate_image") {
        const prompt = functionCall.args?.prompt || textMessage;
        imageUrl = buildPollinationsUrl(prompt);
        reply = `Aqui está a imagem que você pediu:\n\n*"${prompt}"*`;
      } else if (functionCall?.name === "create_document") {
        const args = functionCall.args || {};
        if (Array.isArray(args.files) && args.files.length > 0) {
          artifactName = args.projectName || "projeto";
          artifactFiles = args.files
            .filter((file) => file?.path && typeof file.content === "string" && file.content.length > 0)
            .map((file) => ({ path: file.path, content: file.content, language: file.language || "" }));
          if (artifactFiles.length === 0) throw new Error("Gemini retornou create_document sem arquivos válidos.");
          reply = `Preparei o artifact **${artifactName}** com ${artifactFiles.length} arquivo(s). Abra para visualizar o projeto.`;
        } else {
          documentName = args.filename || "documento.md";
          documentContent = args.content || "";
          artifactName = args.projectName || documentName;
          artifactFiles = [{ path: documentName, content: documentContent, language: "" }];
          reply = `Preparei o artifact **${artifactName}**. Abra para visualizar.`;
        }
      } else if (functionCall?.name === "control_device") {
        const { domain, service, entity_id } = functionCall.args || {};
        try {
          await callHomeAssistant({ domain, service, entity_id });
          reply = `Pronto — executei **${service}** em \`${entity_id}\`.`;
        } catch (err) {
          reply = `Não consegui executar esse comando no Home Assistant: ${err.message}`;
        }
      } else {
        reply = parts.map((p) => p.text).filter(Boolean).join("\n").trim() || "Não consegui gerar uma resposta agora.";
      }
    } catch (err) {
      console.error(`[chat] Gemini falhou (status ${err.status}, code ${err.code}):`, err.message);
      if (GROQ_ENABLED) {
        try {
          if (wantsArtifact) {
            const artifact = await callGroqArtifactFallback({ systemInstruction: SYSTEM_PROMPT, message: textMessage });
            artifactName = artifact.projectName;
            artifactFiles = artifact.files;
            reply = `Preparei o artifact **${artifactName}** com ${artifactFiles.length} arquivo(s). Abra para visualizar o projeto.`;
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

    const hadAttachment = Boolean(image?.data || audio?.data);

    await appendMessages(req.user.id, conv.id, [
      { role: "user", content: textMessage, hadAttachment },
      { role: "assistant", content: reply, imageUrl, documentName, documentContent, artifactName, artifactFiles }
    ]);

    res.json({ conversationId: conv.id, title: conv.title, reply, imageUrl, documentName, documentContent, artifactName, artifactFiles, usedFallback });
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
