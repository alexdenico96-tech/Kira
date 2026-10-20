import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { getAuthVersion } from "./store.js";
dotenv.config();
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error("JWT_SECRET deve estar configurado com pelo menos 32 caracteres.");

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, ver: user.authVersion ?? 0 }, SECRET, { expiresIn: "30d", algorithm: "HS256" });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Não autenticado." });
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || !Number.isInteger(payload.ver)) throw new Error("Token inválido");
    const version = await getAuthVersion(payload.sub);
    if (version === null || version !== payload.ver) throw new Error("Sessão revogada");
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
}
