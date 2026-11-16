
import { useEffect, useRef, useState } from "react";
import "./styles/KiraMidnight.css";
import "./styles/KiraMotion.css";

import InputBar from "./components/InputBar.jsx";
import MessageThread from "./components/MessageThread.jsx";
import Sidebar from "./components/Sidebar.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import ArtifactWorkspace from "./components/ArtifactWorkspace.jsx";
import KiraAurora from "./components/KiraAurora.jsx";
import { mergeProgress, modeFromStep } from "./components/KiraProgress.jsx";

import { useTheme } from "./lib/useTheme.js";

import {
  getStoredSession,
  clearSession,
  listConversations,
  getConversation,
  sendMessageStream,
  deleteConversation,
  deleteAllConversations
} from "./lib/api.js";

const SUGGESTIONS = [
  "Me dê 5 ideias de posts para redes sociais sobre produtividade",
  "Gere uma imagem de um astronauta surfando numa onda neon",
  "Cria um documento com o plano técnico de um app de finanças pessoais"
];

// Espelha a detecção de pedidos explícitos de imagem do backend.
// A decisão definitiva de gerar a imagem continua sendo do servidor.
function isImageGenerationRequest(value) {
  const text = String(value || "").trim();

  if (!text) return false;

  // Não confundir pedidos de interfaces e código com geração de imagens.
  if (
    /\b(html|css|javascript|jsx|tsx|site|website|landing page|c[oó]digo|componente|aplicativo|app|p[aá]gina web)\b/i.test(
      text
    )
  ) {
    return false;
  }

  return /(?:\b(?:crie|cria|criar|gere|gera|gerar|desenhe|desenha|desenhar|produza|fa[cç]a|quero)\b.{0,90}\b(?:imagem|foto|fotografia|ilustra[cç][aã]o|retrato|arte visual)\b|\b(?:imagem|foto|fotografia|ilustra[cç][aã]o|retrato)\b.{0,50}\b(?:de|do|da|com|mostrando)\b|\b(?:generate|create|draw|make)\b.{0,90}\b(?:image|picture|photo|portrait|illustration)\b)/i.test(
    text
  );
}

export default function App() {
  const [theme, setTheme] = useTheme();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState(() => getStoredSession());

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const [loadingLabel, setLoadingLabel] = useState("pensando…");
  const [generatingImage, setGeneratingImage] = useState(false);
  // Fases em tempo real enviadas pelo servidor (construindo, fase 1 finalizada...).
  const [progress, setProgress] = useState({ steps: [], mode: "chat", startedAt: 0 });

  const [error, setError] = useState(null);
  const [activeArtifact, setActiveArtifact] = useState(null);

  const started = messages.length > 0;

  useEffect(() => {
    if (session) refreshConversations();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function refreshConversations() {
    try {
      const list = await listConversations(session.token);
      setConversations(list);
    } catch (e) {
      if (e.message?.includes("Sessão")) {
        handleLogout();
      }
    }
  }

  async function handleSelectConversation(id) {
    try {
      const conv = await getConversation(session.token, id);

      setActiveId(conv.id);
      setMessages(conv.messages);

      const latest = [...(conv.messages || [])]
        .reverse()
        .find((m) => m.artifactFiles?.length);

      setActiveArtifact(
        latest
          ? {
              id: latest.artifactId || null,
              version: latest.artifactVersion || 1,
              name: latest.artifactName || "Artifact",
              files: latest.artifactFiles
            }
          : null
      );
    } catch (e) {
      setError(e.message);
    }
  }

  function handleNewConversation() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setActiveArtifact(null);
  }

  async function handleDeleteConversation(id) {
    try {
      await deleteConversation(session.token, id);

      setConversations((list) =>
        list.filter((c) => c.id !== id)
      );

      if (id === activeId) {
        handleNewConversation();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleClearAllHistory() {
    try {
      await deleteAllConversations(session.token);

      setConversations([]);
      handleNewConversation();
    } catch (e) {
      setError(e.message);
    }
  }

  function handleLogout() {
    clearSession();

    setSession(null);
    setConversations([]);
    setActiveId(null);
    setMessages([]);

    setLoading(false);
    setGeneratingImage(false);
  }

  async function handleSubmit(text, attachments = {}) {
    const value = (text ?? input).trim();
    const { image, audio } = attachments;

    if (!value && !image && !audio) return false;
    if (submittingRef.current) return false;

    submittingRef.current = true;

    const userMessage = {
      role: "user",
      content:
        value ||
        (image && !audio
          ? "Descreva essa imagem."
          : "") // só áudio: o balão mostra o que a Kira ouviu (transcrição)
    };

    if (image) {
      userMessage.previewImage =
        `data:${image.mimeType};base64,${image.data}`;
    }

    if (audio) {
      userMessage.hadAudio = true;
      userMessage.audioPreviewUrl = attachments.audioPreviewUrl;
    }

    // Só ativa a animação para pedidos explícitos de imagem.
    // Uma foto enviada para análise não ativa esse efeito.
    const shouldAnimateImage =
      !image &&
      !audio &&
      !activeArtifact?.id &&
      isImageGenerationRequest(value);

    setMessages((m) => [...m, userMessage]);
    setInput("");
    setError(null);

    setGeneratingImage(shouldAnimateImage);
    setLoadingLabel(
      shouldAnimateImage
        ? "criando sua imagem…"
        : image
          ? "olhando a imagem…"
          : audio
            ? "ouvindo o áudio…"
            : "pensando…"
    );

    setLoading(true);
    const startedAt = Date.now();
    let liveSteps = [];
    let liveMode = shouldAnimateImage ? "image" : image ? "vision" : audio ? "audio" : "chat";
    setProgress({ steps: [], startedAt, mode: liveMode });

    try {
      const res = await sendMessageStream(
        session.token,
        value,
        activeId,
        {
          image,
          audio,
          artifactId: activeArtifact?.id || null
        },
        (event) => {
          liveSteps = mergeProgress(liveSteps, event);
          liveMode = modeFromStep(event.id, liveMode);
          if (liveMode === "image") setGeneratingImage(true);
          setProgress({ steps: liveSteps, mode: liveMode, startedAt });
        }
      );
      // Deixa os ícones das fontes visíveis por um instante antes de a resposta começar a ser escrita.
      if (liveSteps.some((step) => step.icons?.length)) {
        await new Promise((resolve) => setTimeout(resolve, 1400));
      }
      const trace = liveSteps.length
        ? {
            steps: liveSteps.map((step) => ({ ...step, state: "done" })),
            seconds: Math.max(1, Math.round((Date.now() - startedAt) / 1000))
          }
        : null;

      setActiveId(res.conversationId);

      setMessages((m) => [
        // KIRA_AUDIO_FIDELITY_V1: mostra no áudio do usuário o que a Kira ouviu.
        ...(res.voice
          ? m.map((msg, index) => (index === m.length - 1 && msg.role === "user" ? { ...msg, voice: res.voice } : msg))
          : m),
        {
          role: "assistant",
          content: res.reply,
          reveal: true,
          sources: res.sources || [],
          searchQueries: res.searchQueries || [],
          searchEntryPoint: res.searchEntryPoint || "",
          file: res.file || null,
          imageUrl: res.imageUrl,
          documentName: res.documentName,
          documentContent: res.documentContent,
          artifactName: res.artifactName,
          artifactFiles: res.artifactFiles,
          artifactId: res.artifactId,
          artifactVersion: res.artifactVersion,
          trace
        }
      ]);

      if (res.artifactFiles?.length) {
        setActiveArtifact({
          id: res.artifactId || null,
          version: res.artifactVersion || 1,
          name: res.artifactName || "Artifact",
          files: res.artifactFiles
        });
      }

      refreshConversations();

      return true;
    } catch (e) {
      setError(e.message);

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: e.message,
          isError: true
        }
      ]);

      return false;
    } finally {
      submittingRef.current = false;

      setLoading(false);
      setGeneratingImage(false);
      setLoadingLabel("pensando…");
      setProgress((current) => ({ ...current, steps: [] }));
    }
  }

  if (!session) {
    return (
      <LoginScreen
        onAuthenticated={(token, user) =>
          setSession({ token, user })
        }
      />
    );
  }

  return (
    <div className="kira-shell h-[100dvh] flex overflow-hidden">
      <KiraAurora busy={loading} />
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        onClearAll={handleClearAllHistory}
        onLogout={handleLogout}
        onOpenSettings={() => setSettingsOpen(true)}
        username={session.user.username}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        setTheme={setTheme}
        token={session.token}
      />

      <div className="flex-1 flex min-w-0 gap-2.5">
        <div className="kira-panel kira-panel--main flex-1 flex flex-col min-w-0">
          {!started ? (
            <main className="flex-1 flex flex-col items-center justify-center px-4 gap-8 -mt-16">
              <h1 className="float-slow font-display font-semibold text-3xl md:text-4xl text-paper text-center tracking-tight">
                Pronto quando você quiser
              </h1>

              <InputBar
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                loading={loading}
                autoFocus
              />

              <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSubmit(s)}
                    className="kira-message text-xs font-body text-mist border border-line bg-panel2/50 backdrop-blur rounded-full px-4 py-2 hover:border-neon/50 hover:text-paper hover:-translate-y-0.5 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </main>
          ) : (
            <>
              <main className="flex-1 overflow-y-auto px-4">
                <MessageThread
                  messages={messages}
                  loading={loading}
                  loadingLabel={loadingLabel}
                  generatingImage={generatingImage}
                  progress={progress}
                  token={session.token}
                  onOpenArtifact={setActiveArtifact}
                />
              </main>

              <footer
                className="px-4 pb-6 pt-2"
                style={{
                  paddingBottom:
                    "max(1.5rem, env(safe-area-inset-bottom))"
                }}
              >
                <InputBar
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSubmit}
                  loading={loading}
                />
              </footer>
            </>
          )}
        </div>

        {activeArtifact && (
          <ArtifactWorkspace
            artifact={activeArtifact}
            token={session.token}
            onArtifactChange={setActiveArtifact}
            onRequestFix={handleSubmit}
            onClose={() => setActiveArtifact(null)}
          />
        )}
      </div>
    </div>
  );
}
