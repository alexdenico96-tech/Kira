import { useState } from "react";
import { login, register, storeSession, forgotPassword, resetPassword } from "../lib/api.js";

export default function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const resetToken = new URLSearchParams(window.location.search).get("resetToken");

  async function handleLoginOrRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data =
        currentMode === "login" ? await login(username.trim(), password) : await register(username.trim(), email.trim(), password);
      storeSession(data.token, data.user);
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await forgotPassword(email.trim());
      setInfo(data.message || "Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPassword(resetToken, newPassword);
      window.history.replaceState({}, "", window.location.pathname);
      setInfo("Senha redefinida! Já pode entrar com a senha nova.");
      setMode("login");
      setPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const titles = {
    login: "Entre para continuar sua conversa",
    register: "Crie sua conta para começar",
    "forgot-find": "Vamos recuperar seu acesso",
    "forgot-reset": "Escolha uma nova senha"
  };

  const currentMode = resetToken ? "forgot-reset" : mode;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-8">
          <img src="/logo.png" alt="Kira" className="w-14 h-14 rounded-2xl object-cover" />
          <h1 className="font-display font-semibold text-2xl text-paper">Kira</h1>
          <p className="text-mist text-sm font-body text-center">{titles[currentMode]}</p>
        </div>

        {(currentMode === "login" || currentMode === "register") && (
          <form onSubmit={handleLoginOrRegister} className="flex flex-col gap-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuário"
              autoComplete="username"
              className="rounded-lg bg-panel2 border border-line px-4 py-3 text-paper placeholder:text-mist/70 font-body text-sm outline-none focus:border-neon/50"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Senha"
              autoComplete={currentMode === "login" ? "current-password" : "new-password"}
              className="rounded-lg bg-panel2 border border-line px-4 py-3 text-paper placeholder:text-mist/70 font-body text-sm outline-none focus:border-neon/50"
            />

            {currentMode === "register" && (
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Seu e-mail"
                autoComplete="email"
                className="rounded-lg bg-panel2 border border-line px-4 py-3 text-paper placeholder:text-mist/70 font-body text-sm outline-none focus:border-neon/50"
              />
            )}

            {error && <p className="text-coral text-xs font-mono">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password || (currentMode === "register" && !email.trim())}
              className="rounded-lg bg-gradient-to-r from-neon to-neon2 text-ink font-display font-semibold text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mt-1"
            >
              {loading ? "Aguarde…" : currentMode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        )}

        {currentMode === "forgot-find" && (
          <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Seu e-mail cadastrado"
              autoComplete="email"
              className="rounded-lg bg-panel2 border border-line px-4 py-3 text-paper placeholder:text-mist/70 font-body text-sm outline-none focus:border-neon/50"
            />
            {error && <p className="text-coral text-xs font-mono">{error}</p>}
            {info && <p className="text-teal text-xs font-body">{info}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="rounded-lg bg-gradient-to-r from-neon to-neon2 text-ink font-display font-semibold text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mt-1"
            >
              {loading ? "Aguarde…" : "Enviar link de recuperação"}
            </button>
          </form>
        )}

        {currentMode === "forgot-reset" && (
          <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              placeholder="Nova senha (mín. 6 caracteres)"
              autoComplete="new-password"
              className="rounded-lg bg-panel2 border border-line px-4 py-3 text-paper placeholder:text-mist/70 font-body text-sm outline-none focus:border-neon/50"
            />
            {error && <p className="text-coral text-xs font-mono">{error}</p>}
            <button
              type="submit"
              disabled={loading || newPassword.length < 6}
              className="rounded-lg bg-gradient-to-r from-neon to-neon2 text-ink font-display font-semibold text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mt-1"
            >
              {loading ? "Aguarde…" : "Redefinir senha"}
            </button>
          </form>
        )}

        <div className="flex flex-col items-center gap-1.5 mt-4">
          {currentMode === "login" && (
            <>
              <button
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs font-body text-mist hover:text-paper transition-colors"
              >
                Não tem conta? Crie uma
              </button>
              <button
                onClick={() => {
                  setMode("forgot-find");
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs font-body text-mist hover:text-paper transition-colors"
              >
                Esqueci minha senha
              </button>
            </>
          )}
          {currentMode !== "login" && (
            <button
              onClick={() => {
                setMode("login");
                setError(null);
                setInfo(null);
              }}
              className="text-xs font-body text-mist hover:text-paper transition-colors"
            >
              Voltar para o login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
