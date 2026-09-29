const SMALL_CHAT_MAX = Number(process.env.ROUTER_SMALL_CHAT_CHARS || 1800);
const LARGE_ARTIFACT_CHARS = Number(process.env.ROUTER_LARGE_ARTIFACT_CHARS || 24000);

export function classifyRequest({ message="", image, audio, editingArtifact=false, wantsArtifact=false, projectChars=0 }) {
  if (image?.data || audio?.data) return "multimodal";
  if (editingArtifact) return projectChars > LARGE_ARTIFACT_CHARS ? "artifact_large" : "code_edit";
  if (wantsArtifact) return projectChars > LARGE_ARTIFACT_CHARS ? "artifact_large" : "code_create";
  if (message.length <= SMALL_CHAT_MAX) return "chat_small";
  return "chat";
}

export function routeRequest(input) {
  const task = classifyRequest(input);
  const openai = Boolean(process.env.OPENAI_API_KEY);
  const groq = Boolean(process.env.GROQ_API_KEY);
  const gemini = Boolean(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY);
  let providers;
  if (task === "chat_small") providers = [
    ...(openai ? [{provider:"openai", model:process.env.OPENAI_SMALL_MODEL || "gpt-4o-mini"}] : []),
    ...(groq ? [{provider:"groq", model:"configured-small"}] : []),
    ...(gemini ? [{provider:"gemini", model:process.env.GEMINI_MODEL || "gemini-flash-latest"}] : [])
  ];
  else if (task === "multimodal") providers = [
    ...(gemini ? [{provider:"gemini", model:process.env.GEMINI_MODEL || "gemini-flash-latest"}] : []),
    ...(openai ? [{provider:"openai", model:process.env.OPENAI_MULTIMODAL_MODEL || "gpt-4o-mini"}] : [])
  ];
  else providers = [
    ...(gemini ? [{provider:"gemini", model:process.env.GEMINI_MODEL || "gemini-flash-latest"}] : []),
    ...(groq ? [{provider:"groq", model:"configured-code"}] : []),
    ...(openai ? [{provider:"openai", model:process.env.OPENAI_CODE_MODEL || "gpt-4o-mini"}] : [])
  ];
  return { task, providers };
}

export function estimateChars(files=[]) {
  return files.reduce((n,f)=>n+String(f?.content||"").length,0);
}
