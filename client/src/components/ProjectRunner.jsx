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
