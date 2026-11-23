import { useEffect, useMemo, useState } from "react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
  SandpackLayout,
  useSandpack
} from "@codesandbox/sandpack-react";
import { buildSandpackPreviewConfig } from "../lib/projectPreviewConfig";

function ProjectDiagnostics({ onDiagnosticsChange }) {
  const { sandpack } = useSandpack();
  const [visibleError, setVisibleError] = useState("");

  const currentError = sandpack.error
    ? String(sandpack.error.message || sandpack.error)
    : "";

  useEffect(() => {
    if (currentError) {
      setVisibleError(currentError);
    } else if (sandpack.status === "idle") {
      setVisibleError("");
    }
  }, [currentError, sandpack.status]);

  useEffect(() => {
    onDiagnosticsChange?.(visibleError);
  }, [visibleError, onDiagnosticsChange]);

  // KIRA_FULLSTACK_PREVIEW_V1: tempo esgotado não é erro do código — explica e deixa tentar de novo.
  if (sandpack.status === "timeout") {
    return (
      <div className="border-t border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-100">
        <p className="font-semibold">A pré-visualização demorou demais para iniciar.</p>
        <p className="mt-1 text-xs text-amber-200/80">
          Isso não é erro no seu projeto: o empacotador do navegador (CodeSandbox) não respondeu a tempo. Costuma acontecer com internet lenta,
          bloqueadores de anúncio/extensões de privacidade que bloqueiam <code>codesandbox.io</code>, ou na primeira vez que as bibliotecas são baixadas.
        </p>
        <button type="button" onClick={() => sandpack.runSandpack()} className="mt-2 rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!visibleError) return null;

  return (
    <div className="border-t border-red-500/30 bg-red-950/30 p-3">
      <h3 className="mb-2 text-sm font-semibold text-red-300">
        Erros encontrados no projeto
      </h3>
      <div className="rounded-lg border border-red-500/20 bg-black/30 p-3">
        <p className="whitespace-pre-wrap break-words font-mono text-xs text-red-200">
          {visibleError}
        </p>
      </div>
    </div>
  );
}

export default function ProjectRunner({ files = [], onDiagnosticsChange }) {
  const preview = useMemo(
    () => buildSandpackPreviewConfig(files),
    [files]
  );

  return (
    <div className="h-full min-h-0 w-full overflow-auto bg-[#06101f]">
      <SandpackProvider
        template={preview.template}
        files={preview.files}
        customSetup={preview.customSetup}
        options={{
          autorun: true,
          // Projetos grandes baixam muitas dependências na primeira execução (padrão do Sandpack: 40 s).
          bundlerTimeOut: 90000,
          recompileMode: "delayed",
          recompileDelay: 500
        }}
        theme="dark"
      >
        <SandpackLayout>
          <div className="flex w-full flex-col">
            <SandpackPreview
              showNavigator
              showRefreshButton
              showOpenInCodeSandbox={false}
              style={{ height: "65vh" }}
            />
            <ProjectDiagnostics onDiagnosticsChange={onDiagnosticsChange} />
            <SandpackConsole style={{ height: 160 }} />
          </div>
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
