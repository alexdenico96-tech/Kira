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
    <div className="min-h-screen bg-ink flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="Kira" className="w-10 h-10 rounded-xl" />
          <div><h1 className="font-display text-xl font-semibold text-paper">Kira</h1><p className="text-xs text-mist">Sua assistente de IA</p></div>
        </div>
        <h2 className="font-display font-semibold text-paper text-lg mb-1">{mode==="register"?"Criar conta":mode==="forgot"?"Recuperar senha":mode==="reset"?"Nova senha":"Entrar"}</h2>
        <p className="text-sm text-mist mb-5">{mode==="register"?"Crie sua conta para começar a usar a Kira.":mode==="login"?"Entre para continuar suas conversas.":""}</p>

        <form onSubmit={submit} className="space-y-3">
          {(mode==="login" || mode==="register") && <input className={inputClass} value={username} onChange={e=>setUsername(e.target.value)} placeholder="Usuário" autoComplete="username" required />}
          {(mode==="register" || mode==="forgot") && <input className={inputClass} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail" autoComplete="email" required />}
          {(mode==="login" || mode==="register") && <input className={inputClass} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha" autoComplete={mode==="register"?"new-password":"current-password"} minLength={6} required />}
          {mode==="reset" && <input className={inputClass} type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Nova senha" minLength={6} required />}

          {mode==="register" && (
            <div className="rounded-xl border border-line bg-panel2/50 p-3 space-y-3">
              <label className="flex gap-2.5 items-start text-xs text-mist leading-relaxed cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-current" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)} />
                <span>Li e aceito os <button type="button" onClick={()=>setLegalOpen(true)} className="text-neon hover:underline">Termos e Condições de Uso</button> e compreendo que minha aceitação será registrada.</span>
              </label>
              <label className="flex gap-2.5 items-start text-xs text-mist leading-relaxed cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-current" checked={disclaimerAccepted} onChange={e=>setDisclaimerAccepted(e.target.checked)} />
                <span>Li e compreendo o <button type="button" onClick={()=>setLegalOpen(true)} className="text-neon hover:underline">Aviso Legal e Descargo de Responsabilidade</button>, incluindo as limitações de conteúdo gerado por IA.</span>
              </label>
              <button type="button" onClick={()=>setLegalOpen(true)} className="text-xs text-neon hover:underline">Ler documentos completos antes de aceitar</button>
            </div>
          )}

          {error && <p className="text-xs text-coral">{error}</p>}
          {notice && <p className="text-xs text-teal">{notice}</p>}
          <button disabled={busy || (mode==="register" && (!termsAccepted || !disclaimerAccepted))} className="w-full rounded-xl bg-neon text-ink font-semibold py-3 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy?"Aguarde…":mode==="register"?"Criar conta":mode==="forgot"?"Enviar link":mode==="reset"?"Alterar senha":"Entrar"}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {mode!=="login" && <button onClick={()=>setMode("login")} className="text-mist hover:text-paper">Já tenho conta</button>}
          {mode==="login" && <button onClick={()=>setMode("register")} className="text-neon hover:underline">Criar conta</button>}
          {mode==="login" && <button onClick={()=>setMode("forgot")} className="text-mist hover:text-paper">Esqueci minha senha</button>}
          <button onClick={()=>setLegalOpen(true)} className="text-mist hover:text-paper">Termos e responsabilidade</button>
        </div>
      </div>
      <LegalModal open={legalOpen} onClose={()=>setLegalOpen(false)} />
    </div>
  );
}
