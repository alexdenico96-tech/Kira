import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Check, Code2, FileStack, Globe, ImageIcon, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { register, login, forgotPassword, resetPassword, storeSession } from "../lib/api.js";
import LegalModal, { TERMS_VERSION, DISCLAIMER_VERSION } from "./LegalDocuments.jsx";
import KiraAurora from "./KiraAurora.jsx";

const FEATURES = [
  { icon: Code2, title: "Projetos completos", text: "Sites e apps em HTML, React, Vue e outras stacks, com preview ao vivo, checklist do seu pedido e correção automática de erros." },
  { icon: ImageIcon, title: "Imagens fiéis", text: "Cada imagem é conferida contra o seu pedido antes de chegar até você. Se faltar algum detalhe, a Kira refaz." },
  { icon: Globe, title: "Pesquisa com fontes", text: "Perguntas sobre o presente são respondidas com busca na web, mostrando os sites consultados e citações no texto." },
  { icon: FileStack, title: "Arquivos profissionais", text: "PDF, Word, Excel, CSV e PowerPoint com temas, tabelas, fórmulas e anotações do apresentador, prontos para baixar." },
  { icon: Mic, title: "Voz e visão", text: "Envie áudios e fotos: a Kira transcreve, analisa e até transforma suas imagens em novos estilos." },
  { icon: Activity, title: "Trabalho transparente", text: "Acompanhe cada fase em tempo real — planejando, construindo, verificando — em vez de esperar no escuro." }
];

const DIFFERENTIALS = [
  { title: "Confere antes de entregar", text: "Projetos são verificados item por item contra o seu pedido, e as imagens recebem uma nota de fidelidade. O que não passa é corrigido antes de chegar até você." },
  { title: "Sempre disponível", text: "Vários provedores de IA trabalham em conjunto: se um fica sobrecarregado, outro assume automaticamente e a conversa continua." },
  { title: "Atualizada até hoje", text: "A Kira sabe a data atual e pesquisa na web quando o assunto muda com o tempo — cotações, notícias, versões, resultados." },
  { title: "Feita para o português", text: "Pensada para o Brasil desde o início: valores em R$, datas no nosso formato e planilhas que abrem direto no Excel." }
];

const DEMO_STEPS = [
  ["Checklist com 6 requisitos", "página inicial · carrinho · login"],
  ["Direção visual definida", "moderno · Space Grotesk + Inter"],
  ["Fase 1 finalizada", "14 arquivos gerados"],
  ["Verificação concluída", "6/6 requisitos · 0 erros"],
  ["Projeto pronto", "preview ao vivo disponível"]
];

// Cartão que simula as fases de trabalho da Kira, em loop.
function DemoProgress() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => setCount(c => (c >= DEMO_STEPS.length + 1 ? 1 : c + 1)), 1300);
    return () => clearInterval(timer);
  }, []);
  const visible = DEMO_STEPS.slice(0, Math.min(count, DEMO_STEPS.length));
  return (
    <div className="kira-progress kira-glow-border w-full" aria-hidden="true">
      <div className="kira-progress__head">
        <span className="kira-progress__orb" />
        <div>
          <p className="kira-progress__title">Kira está construindo</p>
          <p className="kira-progress__meta">loja virtual em React</p>
        </div>
      </div>
      <ol className="kira-steps">
        {visible.map(([label, detail], i) => {
          const active = i === visible.length - 1 && count <= DEMO_STEPS.length - 1;
          return (
            <li key={label} className={`kira-step kira-step--${active ? "active" : "done"}`}>
              <span className="kira-step__icon">{active ? <span className="kira-step__spinner" /> : <Check size={11} strokeWidth={3.2} />}</span>
              <div><p className="kira-step__label">{label}</p><p className="kira-step__detail">{detail}</p></div>
            </li>
          );
        })}
      </ol>
      <div className="kira-progress__bar"><span /></div>
    </div>
  );
}

export default function LoginScreen({ onAuthenticated }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const resetToken = params.get("reset");
  const [mode, setMode] = useState(resetToken ? "reset" : "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cardRef = useRef(null);

  function goTo(nextMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => cardRef.current?.querySelector("input")?.focus(), 450);
  }

  async function submit(e) {
    e.preventDefault(); setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "register") {
        if (!termsAccepted || !disclaimerAccepted) throw new Error("Você precisa ler e aceitar os Termos e o Aviso Legal para criar sua conta.");
        const data = await register(username, email, password, {
          termsAccepted, disclaimerAccepted,
          termsVersion: TERMS_VERSION, disclaimerVersion: DISCLAIMER_VERSION
        });
        storeSession(data.token, data.user); onAuthenticated(data.token, data.user); return;
      }
      if (mode === "login") {
        const data = await login(username, password);
        storeSession(data.token, data.user); onAuthenticated(data.token, data.user); return;
      }
      if (mode === "forgot") {
        await forgotPassword(email); setNotice("Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha."); return;
      }
      if (mode === "reset") {
        await resetPassword(resetToken, newPassword); setNotice("Senha alterada. Você já pode entrar.");
        window.history.replaceState({}, "", window.location.pathname); setMode("login"); return;
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const inputClass = "w-full rounded-2xl bg-panel2/80 border border-line px-4 py-3.5 text-sm text-paper placeholder:text-mist/60 outline-none transition focus:border-neon/60 focus:ring-4 focus:ring-neon/10";

  return (
    <div className="kira-landing min-h-[100dvh] text-paper relative">
      <KiraAurora busy={busy} />

      {/* Navegação */}
      <header className="kira-landing__nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
          <a href="#topo" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-xl" />
            <span className="font-display text-lg font-semibold tracking-tight">Kira</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-mist md:flex">
            <a href="#recursos" className="hover:text-paper transition-colors">Recursos</a>
            <a href="#diferenciais" className="hover:text-paper transition-colors">Diferenciais</a>
            <a href="#como-funciona" className="hover:text-paper transition-colors">Como funciona</a>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => goTo("login")} className="rounded-full px-4 py-2 text-sm text-paper hover:bg-panel2/70 transition-colors">Entrar</button>
            <button onClick={() => goTo("register")} className="kira-cta rounded-full px-4 py-2 text-sm font-semibold">Criar conta</button>
          </div>
        </div>
      </header>

      {/* Hero + acesso */}
      <section id="topo" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.1fr_.9fr] lg:pt-16">
        <div className="kira-message">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel2/60 px-3.5 py-1.5 text-xs text-mist backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_10px] shadow-teal" /> Atualizada em tempo real · pesquisa na web com fontes
          </span>
          <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl">
            Uma IA que pensa, pesquisa e <span className="kira-gradient-text">entrega pronto.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-mist sm:text-lg">
            Converse, crie sites e aplicativos com preview ao vivo, gere imagens fiéis ao que você imaginou e receba apresentações, planilhas e documentos prontos para usar — em português, num só lugar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button onClick={() => goTo("register")} className="kira-cta inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold">
              Começar agora <ArrowRight size={16} />
            </button>
            <a href="#recursos" className="inline-flex items-center gap-2 rounded-full border border-line bg-panel2/50 px-6 py-3.5 text-sm text-paper backdrop-blur hover:border-neon/50 transition-colors">
              Ver o que ela faz
            </a>
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[["5", "formatos de arquivo"], ["7", "temas visuais"], ["10", "layouts de slide"]].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-line bg-panel2/40 px-4 py-3 backdrop-blur">
                <dt className="font-display text-2xl font-semibold text-paper">{value}</dt>
                <dd className="mt-0.5 text-[11.5px] leading-snug text-mist">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div ref={cardRef} id="acesso" className="kira-message w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="kira-auth-card kira-glow-border rounded-[30px] p-6 sm:p-8">
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold tracking-[.14em] text-neon">{mode === "register" ? "NOVA CONTA" : mode === "forgot" ? "RECUPERAÇÃO" : mode === "reset" ? "SEGURANÇA" : "BEM-VINDO DE VOLTA"}</p>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-paper">{mode === "register" ? "Crie sua conta" : mode === "forgot" ? "Recupere seu acesso" : mode === "reset" ? "Defina uma nova senha" : "Entre na Kira"}</h2>
              <p className="mt-2 text-sm text-mist">{mode === "register" ? "Leva menos de um minuto." : mode === "login" ? "Continue de onde você parou." : mode === "forgot" ? "Enviaremos um link para o seu e-mail." : ""}</p>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {(mode === "login" || mode === "register") && <input className={inputClass} value={username} onChange={e => setUsername(e.target.value)} placeholder="Usuário" autoComplete="username" required />}
              {(mode === "register" || mode === "forgot") && <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" autoComplete="email" required />}
              {(mode === "login" || mode === "register") && <input className={inputClass} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "register" ? "Senha (mínimo 12 caracteres)" : "Senha"} autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 12 : 6} required />}
              {mode === "reset" && <input className={inputClass} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova senha" minLength={12} required />}

              {mode === "register" && (
                <div className="space-y-3 rounded-2xl border border-line bg-panel2/50 p-4">
                  <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-mist">
                    <input type="checkbox" className="mt-0.5 accent-current" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                    <span>Li e aceito os <button type="button" onClick={() => setLegalOpen(true)} className="text-neon hover:underline">Termos e Condições de Uso</button>.</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-mist">
                    <input type="checkbox" className="mt-0.5 accent-current" checked={disclaimerAccepted} onChange={e => setDisclaimerAccepted(e.target.checked)} />
                    <span>Li e compreendo o <button type="button" onClick={() => setLegalOpen(true)} className="text-neon hover:underline">Aviso Legal e Descargo de Responsabilidade</button>.</span>
                  </label>
                </div>
              )}

              {error && <p className="rounded-2xl border border-coral/30 bg-coral/5 px-3.5 py-2.5 text-xs text-coral">{error}</p>}
              {notice && <p className="rounded-2xl border border-line bg-panel2 px-3.5 py-2.5 text-xs text-teal">{notice}</p>}
              <button disabled={busy || (mode === "register" && (!termsAccepted || !disclaimerAccepted))} className="kira-cta w-full rounded-2xl py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? "Aguarde…" : mode === "register" ? "Criar minha conta" : mode === "forgot" ? "Enviar link" : mode === "reset" ? "Alterar senha" : "Entrar"}
              </button>
            </form>

            <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-line pt-5 text-xs">
              {mode !== "login" && <button onClick={() => setMode("login")} className="text-mist hover:text-paper">Já tenho conta</button>}
              {mode === "login" && <button onClick={() => setMode("register")} className="text-neon hover:underline">Criar conta</button>}
              {mode === "login" && <button onClick={() => setMode("forgot")} className="text-mist hover:text-paper">Esqueci minha senha</button>}
              <button onClick={() => setLegalOpen(true)} className="text-mist hover:text-paper">Termos</button>
            </div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-mist"><ShieldCheck size={13} /> Conversas privadas por conta · senhas protegidas com hash</p>
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-xs font-semibold tracking-[.16em] text-neon">RECURSOS</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Tudo o que você precisa para criar, sem trocar de ferramenta.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="kira-feature">
              <span className="kira-feature__icon"><Icon size={20} /></span>
              <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{text}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-mist">Arquivos que a Kira entrega:</span>
          {[["PDF", "#E5484D"], ["Word", "#2B7CD3"], ["Excel", "#1D9E5B"], ["CSV", "#12A594"], ["PowerPoint", "#E8692C"]].map(([name, color]) => (
            <span key={name} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ color, background: `${color}1f`, border: `1px solid ${color}55` }}>{name}</span>
          ))}
        </div>
      </section>

      {/* Diferenciais */}
      <section id="diferenciais" className="mx-auto max-w-6xl px-5 py-20">
        <div className="kira-panel rounded-[32px] p-7 sm:p-12">
          <p className="text-xs font-semibold tracking-[.16em] text-neon">DIFERENCIAIS</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Por que a Kira se destaca</h2>
          <p className="mt-4 max-w-2xl text-mist">Não basta responder rápido: a Kira foi construída para entregar resultados em que você pode confiar.</p>
          <div className="mt-10 grid gap-x-10 gap-y-9 md:grid-cols-2">
            {DIFFERENTIALS.map((item, i) => (
              <div key={item.title} className="flex gap-4">
                <span className="kira-diff-number">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-[.16em] text-neon">COMO FUNCIONA</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Do pedido ao resultado, em três passos.</h2>
          <ol className="mt-8 space-y-6">
            {[
              ["Peça do seu jeito", "Escreva, fale ou envie uma foto. Pode ser uma pergunta, um site, uma imagem ou uma apresentação."],
              ["Acompanhe cada fase", "A Kira planeja, constrói e verifica — e mostra cada etapa enquanto trabalha."],
              ["Receba e ajuste", "Baixe o arquivo, veja o preview ou peça mudanças: ela mantém o que já estava bom."]
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-4">
                <span className="kira-step-badge">{i + 1}</span>
                <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-mist">{text}</p></div>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex justify-center lg:justify-end"><div className="w-full max-w-md"><DemoProgress /></div></div>
      </section>

      {/* Chamada final */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="kira-final-cta rounded-[32px] px-7 py-12 text-center sm:px-12">
          <Sparkles className="mx-auto text-neon" size={26} />
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight">Pronto para começar?</h2>
          <p className="mx-auto mt-3 max-w-lg text-mist">Crie sua conta e faça o primeiro pedido em menos de um minuto.</p>
          <button onClick={() => goTo("register")} className="kira-cta mt-7 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold">Criar minha conta <ArrowRight size={16} /></button>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-7 text-xs text-mist sm:flex-row">
          <div className="flex items-center gap-2"><img src="/logo.png" alt="" className="h-6 w-6 rounded-lg" /> Kira · AI Workspace</div>
          <div className="flex gap-5">
            <button onClick={() => setLegalOpen(true)} className="hover:text-paper">Termos e responsabilidade</button>
            <button onClick={() => goTo("login")} className="hover:text-paper">Entrar</button>
          </div>
        </div>
      </footer>

      <LegalModal open={legalOpen} onClose={() => setLegalOpen(false)} />
    </div>
  );
}
