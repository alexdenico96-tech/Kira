import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const SECRET = process.env.JWT_SECRET || "dev-secret-troque-isso-em-producao";

export function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, SECRET, { expiresIn: "30d" });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Não autenticado." });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
}
