// KIRA_ANDROID_APP_V1: Digital Asset Links do app Android (Trusted Web Activity gerado pelo PWABuilder).
export function androidAssetLinks(env = process.env) {
  const raw = String(env.ANDROID_ASSETLINKS_JSON || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      if (list.every(item => item?.target?.package_name && Array.isArray(item?.target?.sha256_cert_fingerprints))) return list;
      console.warn("[kira-android] ANDROID_ASSETLINKS_JSON não tem package_name/sha256_cert_fingerprints");
    } catch (err) { console.warn("[kira-android] ANDROID_ASSETLINKS_JSON inválido:", err.message); }
  }
  const pkg = String(env.ANDROID_PACKAGE_NAME || "").trim();
  const prints = String(env.ANDROID_SHA256_FINGERPRINTS || "").split(/[,\s]+/).map(f => f.trim().toUpperCase()).filter(f => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg) || !prints.length) return [];
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }];
}
