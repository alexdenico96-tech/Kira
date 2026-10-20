import { createHash } from "node:crypto";
import { consumeAuthLimit } from "./store.js";

function keyFor(kind, value) {
  return createHash("sha256").update(`${kind}:${String(value).toLowerCase()}`).digest("hex");
}

export function authLimit(kind, maxAttempts, windowSeconds, identity = () => "") {
  return async (req, res, next) => {
    try {
      // req.ip respeita o proxy confiável configurado no Express.
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const subject = identity(req);
      const keys = [keyFor(`${kind}:ip`, ip)];
      if (subject) keys.push(keyFor(`${kind}:subject`, subject));
      let retryAfter = 0;
      for (const key of keys) {
        const result = await consumeAuthLimit(key, maxAttempts, windowSeconds);
        if (!result.allowed) retryAfter = Math.max(retryAfter, result.retryAfter);
      }
      if (retryAfter) {
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({ error: "Muitas tentativas. Aguarde e tente novamente." });
      }
      next();
    } catch (err) { next(err); }
  };
}
