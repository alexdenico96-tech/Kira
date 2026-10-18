
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  LogOut,
  MessageSquare,
  Trash2,
  X,
  Menu,
  Settings,
  Search
} from "lucide-react";

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  onLogout,
  onOpenSettings,
  username
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [query, setQuery] = useState("");

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

  const compact = collapsed && !isMobile;

  const filtered = query.trim()
    ? conversations.filter((c) =>
        (c.title || "")
          .toLowerCase()
          .includes(query.trim().toLowerCase())
      )
    : conversations;

  if (isMobile && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Abrir menu"
        className="fixed z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel text-paper shadow-xl backdrop-blur-xl"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          left: "0.75rem"
        }}
      >
        <Menu size={19} />
      </button>
    );
  }

  return (
    <>
      {isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside
        className={[
          isMobile
            ? "fixed inset-y-0 left-0 z-40 w-72"
            : compact
              ? "relative w-[72px]"
              : "relative w-[272px]",
          "shrink-0 flex h-full flex-col overflow-hidden",
          "border-r border-line bg-panel/95 backdrop-blur-xl",
          "transition-[width] duration-300 ease-in-out"
        ].join(" ")}
      >
        <div
          className={[
            "flex h-[76px] shrink-0 items-center border-b border-line px-4",
            compact ? "justify-center" : "justify-between"
          ].join(" ")}
        >
          {!compact && (
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-neon/15 blur-md" />
                <img
                  src="/logo.png"
                  alt="Kira"
                  className="relative h-10 w-10 rounded-xl border border-line object-cover"
                />
              </div>

              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold tracking-tight text-paper">
                  Kira
                </p>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-mist">
                  AI Workspace
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={
              collapsed
                ? "Expandir barra lateral"
                : "Recolher barra lateral"
            }
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-mist hover:bg-panel2 hover:text-paper"
          >
            {isMobile ? (
              <X size={18} />
            ) : collapsed ? (
              <ChevronRight size={18} />
            ) : (
              <ChevronLeft size={18} />
            )}
          </button>
        </div>

        <div className="shrink-0 px-3 pb-3 pt-4">
          <button
            type="button"
            onClick={() => {
              onNew();
              setConfirmClear(false);
              if (isMobile) setCollapsed(true);
            }}
            title="Nova conversa"
            className={[
              "flex w-full items-center gap-2.5 rounded-xl",
              "border border-neon/30 bg-neon/10 py-3",
              "text-sm font-medium text-paper",
              "hover:border-neon/50 hover:bg-neon/15",
              compact ? "justify-center px-0" : "px-3.5"
            ].join(" ")}
          >
            <Plus size={18} className="shrink-0 text-neon" />
            {!compact && <span>Nova conversa</span>}
          </button>
        </div>

        {!compact && conversations.length > 0 && (
          <div className="shrink-0 px-3 pb-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel2 px-3 py-2.5 focus-within:border-neon/50">
              <Search
                size={15}
                className="shrink-0 text-mist"
              />

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar conversas..."
                aria-label="Buscar conversas"
                className="min-w-0 flex-1 bg-transparent text-xs text-paper outline-none placeholder:text-mist"
              />

              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpar busca"
                  className="shrink-0 text-mist hover:text-paper"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {!compact && (
          <div className="px-5 pb-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">
              Conversas
            </span>
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-2.5 pb-3">
          {!compact && conversations.length === 0 && (
            <div className="px-3 py-8 text-center">
              <MessageSquare
                size={23}
                className="mx-auto mb-3 text-mist"
              />
              <p className="text-xs leading-relaxed text-mist">
                Suas conversas aparecerão aqui.
              </p>
            </div>
          )}

          {!compact &&
            conversations.length > 0 &&
            filtered.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-mist">
                Nenhuma conversa encontrada.
              </p>
            )}

          {filtered.map((c) => {
            const active = c.id === activeId;

            return (
              <div
                key={c.id}
                className={[
                  "group relative flex w-full items-center gap-1 rounded-xl border",
                  active
                    ? "border-neon/20 bg-neon/10 text-paper"
                    : "border-transparent text-mist hover:bg-panel2 hover:text-paper"
                ].join(" ")}
              >
                {active && (
                  <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-neon" />
                )}

                <button
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    if (isMobile) setCollapsed(true);
                  }}
                  title={c.title || "Nova conversa"}
                  className={[
                    "flex min-w-0 flex-1 items-center gap-3 py-3 text-left text-[13px]",
                    compact
                      ? "justify-center px-0"
                      : "px-3.5"
                  ].join(" ")}
                >
                  <MessageSquare
                    size={16}
                    className={[
                      "shrink-0",
                      active ? "text-neon" : ""
                    ].join(" ")}
                  />

                  {!compact && (
                    <span className="truncate">
                      {c.title || "Nova conversa"}
                    </span>
                  )}
                </button>

                {!compact && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    title="Apagar conversa"
                    aria-label={`Apagar ${c.title || "conversa"}`}
                    className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-mist opacity-60 hover:bg-coral/10 hover:text-coral md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!compact && conversations.length > 0 && (
          <div className="shrink-0 px-3 pb-3">
            {confirmClear ? (
              <div className="space-y-3 rounded-xl border border-coral/30 bg-coral/10 p-3">
                <p className="text-xs leading-relaxed text-coral">
                  Apagar todo o histórico? Esta ação não pode ser desfeita.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                    }}
                    className="flex-1 rounded-lg bg-coral py-2 text-xs font-semibold text-ink"
                  >
                    Apagar tudo
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    aria-label="Cancelar"
                    className="flex w-9 items-center justify-center rounded-lg border border-line text-mist hover:text-paper"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2.5 text-xs text-mist hover:border-coral/40 hover:text-coral"
              >
                <Trash2 size={14} />
                Limpar histórico
              </button>
            )}
          </div>
        )}

        <div className="shrink-0 border-t border-line px-3 py-3">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              if (isMobile) setCollapsed(true);
            }}
            title="Configurações"
            className={[
              "flex w-full items-center gap-3 rounded-xl py-2.5",
              "text-sm text-mist hover:bg-panel2 hover:text-paper",
              compact
                ? "justify-center px-0"
                : "px-3"
            ].join(" ")}
          >
            <Settings size={17} className="shrink-0" />
            {!compact && <span>Configurações</span>}
          </button>
        </div>

        <div
          className={[
            "flex shrink-0 items-center gap-3 border-t border-line p-3",
            compact ? "justify-center" : "justify-between"
          ].join(" ")}
        >
          {!compact && (
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-panel2 text-sm font-semibold text-paper">
                {(username || "K").charAt(0).toUpperCase()}
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-paper">
                  {username}
                </p>
                <p className="text-[10px] text-mist">
                  Conta Kira
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onLogout}
            title="Sair"
            aria-label="Sair da conta"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-mist hover:bg-coral/10 hover:text-coral"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}
