import { useMemo } from "react";
import {
  SandpackProvider,
  SandpackPreview,
  SandpackConsole,
  SandpackLayout
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

export default function ProjectRunner({ files = [] }) {
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
            <SandpackConsole
              style={{ height: 160 }}
            />
          </div>
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
