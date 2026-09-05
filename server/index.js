import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { signToken, requireAuth } from "./lib/auth.js";
import { checkUserRateLimit, hasDailyBudget, consumeDailyBudget, getUserUsage, getDailyUsage } from "./lib/rateLimit.js";
import { callGemini, buildPollinationsUrl, callHomeAssistant, HOME_ASSISTANT_ENABLED, GEMINI_MODEL } from "./lib/gemini.js";
import { sendEmail, verificationEmailHtml, resetPasswordEmailHtml } from "./lib/email.js";
import {
  initStore,
  findUserByUsername,
  findUserByEmail,
  findUserByVerifyToken,
  findUserByResetToken,
  createUser,
  setVerifyToken,
  markEmailVerified,
  setResetToken,
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
// Limite maior que o padrão (100kb) para caber imagens/áudio em base64 anexados ao chat.
app.use(express.json({ limit: "20mb" }));

const APP_URL = process.env.APP_URL || "http://localhost:5173";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newToken() {
  return randomBytes(24).toString("hex");
}

const SYSTEM_PROMPT = `Você é Kira, uma assistente de IA conversacional, útil e direta.
Você ajuda com quatro tipos de tarefa, e deve reconhecer qual delas se aplica a cada pergunta:
1. Conversa geral: responda perguntas, explique conceitos, ajude a resolver problemas. Pode se alongar um pouco mais quando o assunto pedir profundidade — não precisa ser sempre curta.
2. Ideias: quando pedirem brainstorm, sugestões, planejamento ou criatividade, traga opções concretas e variadas, não só uma resposta genérica.
3. Programação: você é uma parceira de programação. Ajude a escrever, revisar, depurar e explicar código. Sempre que mostrar código, use blocos de código markdown com a linguagem indicada (ex: \`\`\`javascript). Explique decisões técnicas quando ajudar, e aponte possíveis bugs ou melhorias mesmo que não tenham sido perguntados.
4. Imagens e áudio: você consegue enxergar imagens e ouvir áudios que o usuário enviar — descreva, analise ou responda sobre eles normalmente. Você também pode GERAR uma imagem: quando o usuário pedir para criar/desenhar/ilustrar algo, chame a ferramenta generate_image com um prompt bem detalhado (estilo, iluminação, composição), de preferência em inglês.
${HOME_ASSISTANT_ENABLED ? "5. Controle de dispositivos: você tem acesso à ferramenta control_device, que controla dispositivos reais conectados via Home Assistant. Use só quando o usuário pedir claramente para ligar/desligar/ativar algo físico da casa." : ""}

Responda sempre no mesmo idioma da última mensagem do usuário (português ou espanhol).

Regras de formatação (IMPORTANTE, sua resposta é renderizada como Markdown puro):
- Nunca use tags HTML soltas como <br>, <b>, <div> etc. Para quebra de parágrafo, use uma linha em branco.
- Use tabelas Markdown (com | e ---) apenas quando fizer sentido comparar itens lado a lado.
- Use ##/### para títulos apenas em respostas longas que se beneficiam de seções.
- Prefira frases diretas e parágrafos curtos a listas gigantes quando uma explicação corrida for mais natural.

Se te perguntarem seu nome, diga que se chama Kira.`;

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, emailVerified: user.emailVerified };
}

// ---------- Auth ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: "Usuário obrigatório e senha com no mínimo 6 caracteres." });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verifyToken = newToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    let user;
    try {
      user = await createUser({ username: username.trim(), email: email.trim(), passwordHash, verifyToken, verifyExpires });
    } catch (err) {
      if (err.message === "USERNAME_TAKEN") return res.status(409).json({ error: "Esse nome de usuário já existe. Escolha outro." });
      if (err.message === "EMAIL_TAKEN") return res.status(409).json({ error: "Já existe uma conta com esse e-mail." });
      throw err;
    }

    try {
      await sendEmail({
        to: user.email,
        subject: "Confirme seu e-mail na Kira",
        html: verificationEmailHtml(APP_URL, verifyToken)
      });
    } catch (err) {
      console.error("Falha ao enviar e-mail de verificação:", err.message);
      // Não falha o cadastro por causa disso — o usuário pode pedir reenvio depois.
    }

    const token = signToken(user);
    res.json({ token, user: publicUser({ ...user, emailVerified: false }) });
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

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await findUserByUsername(req.user.username);
  res.json({ user: user ? publicUser(user) : req.user });
});

// Link clicado direto no e-mail — não é uma chamada de API do frontend, é navegação real do navegador.
app.get("/api/auth/verify", async (req, res) => {
  const { token } = req.query;
  const user = token ? await findUserByVerifyToken(token) : null;
  if (!user || !user.verifyExpires || new Date(user.verifyExpires) < new Date()) {
    return res.redirect(`${APP_URL}/?verifyError=1`);
  }
  await markEmailVerified(user.id);
  res.redirect(`${APP_URL}/?verified=1`);
});

app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
  try {
    const user = await findUserByUsername(req.user.username);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });

    const verifyToken = newToken();
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await setVerifyToken(user.id, verifyToken, verifyExpires);
    await sendEmail({
      to: user.email,
      subject: "Confirme seu e-mail na Kira",
      html: verificationEmailHtml(APP_URL, verifyToken)
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui reenviar o e-mail agora." });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = email ? await findUserByEmail(email) : null;
    if (user) {
      const resetToken = newToken();
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await setResetToken(user.id, resetToken, resetExpires);
      try {
        await sendEmail({
          to: user.email,
          subject: "Redefinir sua senha na Kira",
          html: resetPasswordEmailHtml(APP_URL, resetToken)
        });
      } catch (err) {
        console.error("Falha ao enviar e-mail de redefinição:", err.message);
      }
    }
    // Sempre responde sucesso, exista ou não a conta — evita confirmar quais e-mails têm cadastro.
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui processar o pedido agora." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "A senha precisa ter no mínimo 6 caracteres." });
    }
    const user = token ? await findUserByResetToken(token) : null;
    if (!user || !user.resetExpires || new Date(user.resetExpires) < new Date()) {
      return res.status(400).json({ error: "Esse link expirou ou já foi usado. Peça uma redefinição nova." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await updatePassword(user.id, passwordHash);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui redefinir sua senha agora." });
  }
});

// ---------- Conversations (private per user) ----------

app.get("/api/conversations", requireAuth, async (req, res) => {
  const conversations = await listConversations(req.user.id);
  res.json(conversations);
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
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Escreva algo antes de enviar." });
    }
    await createFeedback(req.user.id, req.user.username, message.trim().slice(0, 2000));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Não consegui salvar seu comentário agora. Tente de novo." });
  }
});

// Trunca cada mensagem do histórico para evitar prompts enormes.
function trimHistory(history, { maxMessages = 8, maxCharsPerMessage = 2000 } = {}) {
  return history.slice(-maxMessages).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content.length > maxCharsPerMessage ? m.content.slice(0, maxCharsPerMessage) + "…" : m.content }]
  }));
}

function friendlyGeminiError(err) {
  if (err.code === "missing_key") {
    return "GEMINI_API_KEY não configurada. Copie server/.env.example para server/.env e adicione sua chave gratuita de aistudio.google.com/apikey.";
  }
  if (err.status === 503 || err.code === "UNAVAILABLE") {
    return "O Gemini está sobrecarregado no momento (isso é do lado do Google, acontece em picos de uso). Já tentei de novo automaticamente algumas vezes — espere um pouco e tente mandar a mensagem outra vez.";
  }
  if (err.status === 429 || err.code === "RESOURCE_EXHAUSTED") {
    return "Você atingiu o limite de uso gratuito do Gemini por agora (esse limite é diário e reseta sozinho). Aguarde um pouco e tente de novo.";
  }
  if (err.status === 401 || err.status === 403) {
    return "A chave da API Gemini foi rejeitada. Confira o valor de GEMINI_API_KEY no arquivo .env do servidor.";
  }
  if (err.status === 404) {
    return "O modelo configurado (GEMINI_MODEL) não existe ou foi descontinuado — isso acontece com frequência do lado do Google. Tente definir GEMINI_MODEL=gemini-flash-latest no .env, ou confira os nomes disponíveis em aistudio.google.com.";
  }
  return "Não consegui falar com a IA agora. Tente novamente em instantes.";
}

// ---------- Chat (Kira) ----------

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    const { message, conversationId, image, audio } = req.body;
    // image/audio (opcionais): { mimeType: "image/png", data: "<base64 sem prefixo data:>" }

    if ((!message || typeof message !== "string") && !image && !audio) {
      return res.status(400).json({ error: "Envie uma mensagem, uma imagem ou um áudio." });
    }

    const rl = checkUserRateLimit(req.user.id);
    if (!rl.allowed) {
      return res.status(429).json({
        error: `Você atingiu o limite de mensagens por enquanto. Tente de novo em ${rl.resetInMinutes} minuto(s).`
      });
    }
    if (!hasDailyBudget()) {
      return res.status(429).json({
        error: "O app atingiu o limite diário de uso gratuito da IA (compartilhado entre todos os usuários). Tente novamente amanhã."
      });
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

    let data;
    try {
      data = await callGemini({ systemInstruction: SYSTEM_PROMPT, contents });
    } catch (err) {
      console.error(`[chat] Gemini falhou (status ${err.status}, code ${err.code}):`, err.message);
      return res.status(502).json({ error: friendlyGeminiError(err) });
    }

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCall = parts.find((p) => p.functionCall)?.functionCall;

    let imageUrl = null;
    let reply;

    if (functionCall?.name === "generate_image") {
      const prompt = functionCall.args?.prompt || textMessage;
      imageUrl = buildPollinationsUrl(prompt);
      reply = `Aqui está a imagem que você pediu:\n\n*"${prompt}"*`;
    } else if (functionCall?.name === "control_device") {
      const { domain, service, entity_id } = functionCall.args || {};
      try {
        await callHomeAssistant({ domain, service, entity_id });
        reply = `Pronto — executei **${service}** em \`${entity_id}\`.`;
      } catch (err) {
        console.error("[chat] Home Assistant falhou:", err.message);
        reply = `Não consegui executar esse comando no Home Assistant: ${err.message}`;
      }
    } else {
      reply =
        parts
          .map((p) => p.text)
          .filter(Boolean)
          .join("\n")
          .trim() || "Não consegui gerar uma resposta agora.";
    }

    const hadAttachment = Boolean(image?.data || audio?.data);

    await appendMessages(req.user.id, conv.id, [
      { role: "user", content: textMessage, hadAttachment },
      { role: "assistant", content: reply, imageUrl }
    ]);

    res.json({ conversationId: conv.id, title: conv.title, reply, imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno no servidor.", details: String(err) });
  }
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL, homeAssistant: HOME_ASSISTANT_ENABLED })
);

// Em produção, o frontend compilado (client/dist) pode ser servido pelo próprio backend,
// permitindo publicar tudo como um único serviço. Veja o README, seção "Deploy em produção".
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
