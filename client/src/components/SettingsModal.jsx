import { useEffect, useState } from "react";
import { X, Sun, Moon, HelpCircle, Gauge, MessageSquareHeart, Send } from "lucide-react";
import { getUsage, sendFeedback } from "../lib/api.js";

const TABS = [
  { id: "appearance", label: "Aparência", icon: Sun },
  { id: "help", label: "Central de ajuda", icon: HelpCircle },
  { id: "usage", label: "Limite de uso", icon: Gauge },
  { id: "feedback", label: "Comentários", icon: MessageSquareHeart }
];

function AppearanceTab({ theme, setTheme }) {
  return (
    <div>
      <p className="text-sm text-mist font-body mb-4">Escolha como a Kira aparece pra você.</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setTheme("dark")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            theme === "dark" ? "border-neon bg-panel2" : "border-line hover:border-neon/40"
          }`}
        >
          <Moon size={18} className="text-neon mb-2" />
          <p className="text-sm font-body font-medium text-paper">Escuro</p>
          <p className="text-xs font-body text-mist mt-0.5">Azul neon, fundo escuro</p>
        </button>
        <button
          onClick={() => setTheme("light")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            theme === "light" ? "border-neon bg-panel2" : "border-line hover:border-neon/40"
          }`}
        >
          <Sun size={18} className="text-neon mb-2" />
          <p className="text-sm font-body font-medium text-paper">Claro</p>
          <p className="text-xs font-body text-mist mt-0.5">Fundo claro, alto contraste</p>
        </button>
      </div>
    </div>
  );
}

function HelpTab() {
  const items = [
    { q: "Como converso com a Kira?", a: "Digite sua pergunta na caixa de texto e aperte Enter ou o botão de enviar. Ela responde perguntas, ajuda com ideias e é uma parceira de programação." },
    { q: "Como envio uma imagem?", a: "Clique no ícone de imagem ao lado da caixa de texto, escolha um arquivo, e pergunte o que quiser sobre ela." },
    { q: "Como envio um áudio?", a: "Clique no ícone de microfone para começar a gravar, e clique de novo para parar. O áudio é enviado junto da sua próxima mensagem." },
    { q: "Como peço uma imagem gerada?", a: "Peça algo como \"gera uma imagem de...\" ou \"desenha...\" — a Kira entende o pedido e gera a imagem sozinha." },
    { q: "Minhas conversas ficam salvas?", a: "Sim, o histórico fica salvo por conta (visível na barra lateral) e só você tem acesso às suas próprias conversas." },
    { q: "Posso apagar uma conversa?", a: "Passe o mouse sobre ela na barra lateral e clique no ícone de lixeira. Ou use \"Limpar histórico\" para apagar tudo de uma vez." },
    { q: "Dá pra instalar a Kira como app?", a: "Sim — no Android, use o menu do Chrome e \"Adicionar à tela inicial\". No iPhone, use o botão de compartilhar do Safari e \"Adicionar à Tela de Início\"." }
  ];
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i}>
          <p className="text-sm font-body font-medium text-paper">{item.q}</p>
          <p className="text-sm font-body text-mist mt-1 leading-relaxed">{item.a}</p>
        </div>
      ))}
    </div>
  );
}

function UsageBar({ label, count, max }) {
  const pct = Math.min(100, Math.round((count / max) * 100));
  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs font-mono text-mist mb-1">
        <span>{label}</span>
        <span>
          {count} / {max}
        </span>
      </div>
      <div className="h-2 rounded-full bg-panel2 border border-line overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 85 ? "bg-coral" : "bg-neon"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function UsageTab({ token }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getUsage(token)
      .then(setUsage)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return <p className="text-sm text-coral font-body">{error}</p>;
  if (!usage) return <p className="text-sm text-mist font-body">Carregando…</p>;

  return (
    <div>
      <UsageBar label="Suas mensagens (últimos 15 min)" count={usage.user.count} max={usage.user.max} />
      <UsageBar label="Uso total do app hoje (todos os usuários)" count={usage.daily.count} max={usage.daily.max} />
      <p className="text-xs font-body text-mist mt-3 leading-relaxed">
        Esses limites protegem a cota gratuita da IA. O limite pessoal reseta a cada 15 minutos; o limite total do
        app reseta à meia-noite.
      </p>
    </div>
  );
}

function FeedbackTab({ token }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await sendFeedback(token, message.trim());
      setStatus("sent");
      setMessage("");
    } catch (e2) {
      setError(e2.message);
      setStatus("error");
    }
  }

  return (
    <div>
      <p className="text-sm text-mist font-body mb-3">
        Achou um bug, tem uma ideia ou quer contar como está sendo usar a Kira? Escreva aqui.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Seu comentário…"
          className="w-full rounded-lg bg-panel2 border border-line px-3 py-2.5 text-sm text-paper placeholder:text-mist/60 font-body outline-none focus:border-neon/50 resize-none"
        />
        <button
          type="submit"
          disabled={!message.trim() || status === "sending"}
          className="flex items-center gap-2 rounded-lg bg-neon text-ink text-sm font-body font-semibold px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <Send size={14} />
          Enviar
        </button>
        {status === "sent" && <p className="text-xs text-teal font-body">Obrigada! Seu comentário foi enviado.</p>}
        {status === "error" && <p className="text-xs text-coral font-body">{error}</p>}
      </form>
    </div>
  );
}

export default function SettingsModal({ open, onClose, theme, setTheme, token }) {
  const [tab, setTab] = useState("appearance");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[85vh] rounded-2xl border border-line bg-panel shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-display font-semibold text-paper text-base">Configurações</h2>
          <button onClick={onClose} className="text-mist hover:text-paper transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-line shrink-0 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-body whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id ? "border-neon text-paper" : "border-transparent text-mist hover:text-paper"
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 overflow-y-auto">
          {tab === "appearance" && <AppearanceTab theme={theme} setTheme={setTheme} />}
          {tab === "help" && <HelpTab />}
          {tab === "usage" && <UsageTab token={token} />}
          {tab === "feedback" && <FeedbackTab token={token} />}
        </div>
      </div>
    </div>
  );
}
