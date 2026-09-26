import { useEffect, useState } from "react";
import InputBar from "./components/InputBar.jsx";
import MessageThread from "./components/MessageThread.jsx";
import Sidebar from "./components/Sidebar.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { useTheme } from "./lib/useTheme.js";
import {
  getStoredSession,
  clearSession,
  listConversations,
  getConversation,
  sendMessage,
  deleteConversation,
  deleteAllConversations
} from "./lib/api.js";

const SUGGESTIONS = [
  "Me dê 5 ideias de posts para redes sociais sobre produtividade",
  "Gere uma imagem de um astronauta surfando numa onda neon",
  "Cria um documento com o plano técnico de um app de finanças pessoais"
];

export default function App() {
  const [theme, setTheme] = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState(() => getStoredSession());
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("pensando…");
  const [error, setError] = useState(null);

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
      if (e.message?.includes("Sessão")) handleLogout();
    }
  }

  async function handleSelectConversation(id) {
    try {
      const conv = await getConversation(session.token, id);
      setActiveId(conv.id);
      setMessages(conv.messages);
    } catch (e) {
      setError(e.message);
    }
  }

  function handleNewConversation() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
  }

  async function handleDeleteConversation(id) {
    try {
      await deleteConversation(session.token, id);
      setConversations((list) => list.filter((c) => c.id !== id));
      if (id === activeId) handleNewConversation();
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
  }

  async function handleSubmit(text, attachments = {}) {
    const value = (text ?? input).trim();
    const { image, audio } = attachments;
    if (!value && !image && !audio) return;
    if (loading) return;

    const userMessage = {
      role: "user",
      content: value || (image ? "Descreva essa imagem." : "Ouça esse áudio e responda.")
    };
    if (image) userMessage.previewImage = `data:${image.mimeType};base64,${image.data}`;
    if (audio) {
      userMessage.hadAudio = true;
      userMessage.audioPreviewUrl = attachments.audioPreviewUrl;
    }

    setMessages((m) => [...m, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    setLoadingLabel(image ? "olhando a imagem…" : audio ? "ouvindo o áudio…" : "pensando…");

    try {
      const res = await sendMessage(session.token, value, activeId, { image, audio });
      setActiveId(res.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: res.reply,
          imageUrl: res.imageUrl,
          documentName: res.documentName,
          documentContent: res.documentContent
        }
      ]);
      refreshConversations();
    } catch (e) {
      setError(e.message);
      setMessages((m) => [...m, { role: "assistant", content: e.message, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return <LoginScreen onAuthenticated={(token, user) => setSession({ token, user })} />;
  }

  return (
    <div className="h-screen flex overflow-hidden">
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

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} setTheme={setTheme} token={session.token} />

      <div className="flex-1 flex flex-col min-w-0">
        {!started ? (
          <main className="flex-1 flex flex-col items-center justify-center px-4 gap-8 -mt-16">
            <h1 className="float-slow font-display font-semibold text-3xl md:text-4xl text-paper text-center tracking-tight">
              Pronto quando você quiser
            </h1>
            <InputBar value={input} onChange={setInput} onSubmit={handleSubmit} loading={loading} autoFocus />
            <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  className="text-xs font-body text-mist border border-line rounded-full px-3.5 py-2 hover:border-neon/50 hover:text-paper transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </main>
        ) : (
          <>
            <main className="flex-1 overflow-y-auto px-4">
              <MessageThread messages={messages} loading={loading} loadingLabel={loadingLabel} />
            </main>
            <footer className="px-4 pb-6 pt-2" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
              <InputBar value={input} onChange={setInput} onSubmit={handleSubmit} loading={loading} />
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
