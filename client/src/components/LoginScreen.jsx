import { useMemo, useState } from "react";
import { register, login, forgotPassword, resetPassword, storeSession } from "../lib/api.js";
import LegalModal, { TERMS_VERSION, DISCLAIMER_VERSION } from "./LegalDocuments.jsx";

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

  const inputClass="w-full rounded-xl bg-panel2 border border-line px-4 py-3 text-sm text-paper placeholder:text-mist/60 outline-none focus:border-neon/50";
  return (
    <div className="min-h-[100dvh] bg-ink text-paper relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-80"
        style={{background:"radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--kira-accent) 18%, transparent), transparent 30%), radial-gradient(circle at 82% 78%, color-mix(in srgb, var(--kira-accent2) 12%, transparent), transparent 28%)"}} />
      <div className="relative min-h-[100dvh] grid lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden lg:flex flex-col justify-between p-12 xl:p-16 border-r border-line">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Kira" className="w-11 h-11 rounded-2xl shadow-lg" />
            <div><p className="font-display font-semibold text-paper">Kira</p><p className="text-xs text-mist">Inteligência para criar, conversar e construir.</p></div>
          </div>
          <div className="max-w-xl">
            <div className="inline-flex items-center rounded-full border border-line bg-panel2 px-3 py-1.5 text-xs text-neon mb-6">Kira AI Workspace</div>
            <h1 className="font-display text-5xl xl:text-6xl font-semibold tracking-[-0.04em] leading-[1.02] text-paper">
              Suas ideias,<br/><span className="text-neon">transformadas em realidade.</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-mist max-w-lg">Converse com IA, desenvolva projetos, analise conteúdo e organize seu trabalho em um só lugar.</p>
          </div>
          <p className="text-xs text-mist">Kira • Ambiente seguro e privado por conta</p>
        </section>

        <main className="flex items-center justify-center p-5 sm:p-8">
          <div className="w-full max-w-md">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
              <img src="/logo.png" alt="Kira" className="w-11 h-11 rounded-2xl" />
              <div><p className="font-display font-semibold text-paper">Kira</p><p className="text-xs text-mist">AI Workspace</p></div>
            </div>

            <div className="rounded-[28px] border border-line bg-panel/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
              <div className="mb-6">
                <p className="text-xs font-medium text-neon mb-2">{mode==="register"?"NOVA CONTA":mode==="forgot"?"RECUPERAÇÃO":mode==="reset"?"SEGURANÇA":"BEM-VINDO"}</p>
                <h2 className="font-display font-semibold text-paper text-2xl tracking-tight">{mode==="register"?"Crie sua conta":mode==="forgot"?"Recupere seu acesso":mode==="reset"?"Defina uma nova senha":"Entre na Kira"}</h2>
                <p className="text-sm text-mist mt-2">{mode==="register"?"Comece a criar com a Kira em poucos segundos.":mode==="login"?"Continue de onde você parou.":""}</p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                {(mode==="login" || mode==="register") && <input className={inputClass} value={username} onChange={e=>setUsername(e.target.value)} placeholder="Usuário" autoComplete="username" required />}
                {(mode==="register" || mode==="forgot") && <input className={inputClass} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail" autoComplete="email" required />}
                {(mode==="login" || mode==="register") && <input className={inputClass} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha" autoComplete={mode==="register"?"new-password":"current-password"} minLength={6} required />}
                {mode==="reset" && <input className={inputClass} type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Nova senha" minLength={6} required />}

                {mode==="register" && (
                  <div className="rounded-2xl border border-line bg-panel2/50 p-4 space-y-3">
                    <label className="flex gap-2.5 items-start text-xs text-mist leading-relaxed cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-current" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)} />
                      <span>Li e aceito os <button type="button" onClick={()=>setLegalOpen(true)} className="text-neon hover:underline">Termos e Condições de Uso</button>.</span>
                    </label>
                    <label className="flex gap-2.5 items-start text-xs text-mist leading-relaxed cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-current" checked={disclaimerAccepted} onChange={e=>setDisclaimerAccepted(e.target.checked)} />
                      <span>Li e compreendo o <button type="button" onClick={()=>setLegalOpen(true)} className="text-neon hover:underline">Aviso Legal e Descargo de Responsabilidade</button>.</span>
                    </label>
                    <button type="button" onClick={()=>setLegalOpen(true)} className="text-xs text-neon hover:underline">Ler documentos completos</button>
                  </div>
                )}

                {error && <p className="rounded-xl border border-coral/30 bg-coral/5 px-3 py-2.5 text-xs text-coral">{error}</p>}
                {notice && <p className="rounded-xl border border-line bg-panel2 px-3 py-2.5 text-xs text-teal">{notice}</p>}
                <button disabled={busy || (mode==="register" && (!termsAccepted || !disclaimerAccepted))} className="w-full rounded-xl bg-neon text-white font-semibold py-3.5 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-[.99]">
                  {busy?"Aguarde…":mode==="register"?"Criar minha conta":mode==="forgot"?"Enviar link":mode==="reset"?"Alterar senha":"Entrar"}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-line flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                {mode!=="login" && <button onClick={()=>setMode("login")} className="text-mist hover:text-paper">Já tenho conta</button>}
                {mode==="login" && <button onClick={()=>setMode("register")} className="text-neon hover:underline">Criar conta</button>}
                {mode==="login" && <button onClick={()=>setMode("forgot")} className="text-mist hover:text-paper">Esqueci minha senha</button>}
                <button onClick={()=>setLegalOpen(true)} className="text-mist hover:text-paper">Termos e responsabilidade</button>
              </div>
            </div>
          </div>
        </main>
      </div>
      <LegalModal open={legalOpen} onClose={()=>setLegalOpen(false)} />
    </div>
  );
}
