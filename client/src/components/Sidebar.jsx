import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, LogOut, MessageSquare, Trash2, X, Menu, Settings } from "lucide-react";

export default function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, onClearAll, onLogout, onOpenSettings, username }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setCollapsed(mobile);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // No celular, "recolhida" significa totalmente fora da tela — nenhuma faixa fica
  // flutuando por cima do chat. No desktop, continua sendo a faixa fina só com ícones.
  if (isMobile && collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label="Abrir menu"
        className="fixed z-40 flex items-center justify-center w-10 h-10 rounded-full bg-panel/90 border border-line/70 backdrop-blur-sm text-paper shadow-lg"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))", left: "0.75rem" }}
      >
        <Menu size={18} />
      </button>
    );
  }

  const width = isMobile ? "w-72" : collapsed ? "w-16" : "w-64";

  return (
    <>
      {isMobile && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setCollapsed(true)} />
      )}

      <aside
        className={`${width} ${
          isMobile ? "fixed inset-y-0 left-0 z-40" : "relative"
        } shrink-0 border-r border-line/70 bg-panel/90 backdrop-blur-sm flex flex-col h-full transition-[width] duration-200 ease-in-out overflow-hidden`}
      >
        <div className="p-3 flex items-center justify-between border-b border-line/70 shrink-0">
          <div className={`flex items-center gap-2 min-w-0 ${collapsed && !isMobile ? "hidden" : ""}`}>
            <img src="/logo.png" alt="Kira" className="w-7 h-7 shrink-0 rounded-full object-cover" />
            <span className="font-display font-semibold text-paper text-sm truncate">Kira</span>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            className="w-7 h-7 flex items-center justify-center rounded-md text-mist hover:text-paper hover:bg-panel2 transition-colors shrink-0"
          >
            {isMobile ? <X size={16} /> : collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="p-3 shrink-0">
          <button
            onClick={() => {
              onNew();
              if (isMobile) setCollapsed(true);
            }}
            title="Nova conversa"
            className={`w-full flex items-center gap-2 rounded-lg border border-line hover:border-neon/50 text-paper text-sm font-body py-2.5 transition-colors ${
              collapsed && !isMobile ? "justify-center px-0" : "px-3"
            }`}
          >
            <Plus size={16} />
            {(!collapsed || isMobile) && <span>Nova conversa</span>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 space-y-0.5">
          {(!collapsed || isMobile) && conversations.length === 0 && (
            <p className="text-mist text-xs font-body px-2 py-4 text-center">Suas conversas aparecem aqui.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group w-full flex items-center gap-1 rounded-lg transition-colors ${
                c.id === activeId ? "bg-panel2 text-paper" : "text-mist hover:bg-panel2/60 hover:text-paper"
              }`}
            >
              <button
                onClick={() => {
                  onSelect(c.id);
                  if (isMobile) setCollapsed(true);
                }}
                title={c.title}
                className={`flex-1 min-w-0 flex items-center gap-2 text-left text-sm font-body px-3 py-2 truncate ${
                  collapsed && !isMobile ? "justify-center px-0" : ""
                }`}
              >
                <MessageSquare size={14} className="shrink-0" />
                {(!collapsed || isMobile) && <span className="truncate">{c.title || "Nova conversa"}</span>}
              </button>
              {(!collapsed || isMobile) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                  title="Apagar conversa"
                  className="shrink-0 mr-1 w-6 h-6 flex items-center justify-center rounded text-mist opacity-0 group-hover:opacity-100 hover:text-coral hover:bg-coral/10 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {(!collapsed || isMobile) && conversations.length > 0 && (
          <div className="px-3 pb-2 shrink-0">
            {confirmClear ? (
              <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2.5 space-y-2">
                <p className="text-xs text-coral font-body">Apagar todo o histórico de conversas? Isso não pode ser desfeito.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                    }}
                    className="flex-1 text-xs font-body font-semibold rounded-md bg-coral text-ink py-1.5 hover:opacity-90 transition-opacity"
                  >
                    Apagar tudo
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="w-7 flex items-center justify-center rounded-md border border-line text-mist hover:text-paper transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="w-full flex items-center gap-2 justify-center text-xs font-body text-mist hover:text-coral border border-line hover:border-coral/40 rounded-lg py-2 transition-colors"
              >
                <Trash2 size={13} />
                Limpar histórico
              </button>
            )}
          </div>
        )}

        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={() => {
              onOpenSettings();
              if (isMobile) setCollapsed(true);
            }}
            title="Configurações"
            className={`w-full flex items-center gap-2 text-sm font-body text-mist hover:text-paper hover:bg-panel2/60 rounded-lg py-2 transition-colors ${
              collapsed && !isMobile ? "justify-center px-0" : "px-3"
            }`}
          >
            <Settings size={15} />
            {(!collapsed || isMobile) && <span>Configurações</span>}
          </button>
        </div>

        <div className={`p-3 border-t border-line/70 flex items-center gap-2 shrink-0 ${collapsed && !isMobile ? "justify-center" : "justify-between"}`}>
          {(!collapsed || isMobile) && <span className="text-xs font-body text-mist truncate">{username}</span>}
          <button
            onClick={onLogout}
            title="Sair"
            className="text-mist hover:text-coral transition-colors shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
