import { useEffect, useMemo, useState } from "react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
  SandpackLayout,
  useSandpack
} from "@codesandbox/sandpack-react";

function normalizePath(path) {
  return "/" + String(path || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

function prepareFiles(files) {
  const result = {};

  for (const file of files || []) {
    if (!file?.path) continue;

    result[normalizePath(file.path)] = {
      code: String(file.content ?? "")
    };
  }

  const entry = result["/src/main.jsx"] ||
    result["/src/main.tsx"];

  if (entry && !result["/src/index.js"]) {
    result["/src/index.js"] = {
      code: entry.code
    };
  }

  return result;
}

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
  const projectFiles = useMemo(
    () => prepareFiles(files),
    [files]
  );

  const dependencies = useMemo(() => {
    const packageFile = files.find(
      file => normalizePath(file.path) === "/package.json"
    );

    if (!packageFile) return {};

    try {
      const pkg = JSON.parse(packageFile.content);

      return {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {})
      };
    } catch {
      return {};
    }
  }, [files]);

  return (
    <div className="h-full min-h-0 w-full overflow-auto bg-[#06101f]">
      <SandpackProvider
        template="react"
        files={projectFiles}
        customSetup={{ dependencies }}
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
            <SandpackConsole
              style={{ height: 160 }}
            />
          </div>
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
