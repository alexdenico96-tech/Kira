import dotenv from "dotenv";
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Kira <onboarding@resend.dev>";

export async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    // Modo desenvolvimento: sem chave configurada, não envia de verdade — só mostra no
    // terminal, pra você conseguir testar o fluxo sem precisar configurar e-mail ainda.
    console.warn(`[email] RESEND_API_KEY não configurada. E-mail não enviado.\n  Para: ${to}\n  Assunto: ${subject}\n  Conteúdo:\n${html}`);
    return { skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao enviar e-mail: ${text}`);
  }

  return res.json();
}

export function verificationEmailHtml(appUrl, token) {
  const link = `${appUrl}/api/auth/verify?token=${token}`;
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
      <h2>Confirme seu e-mail na Kira</h2>
      <p>Clique no botão abaixo para confirmar seu e-mail e liberar todos os recursos da sua conta.</p>
      <p><a href="${link}" style="display:inline-block;background:#3FA9FF;color:#060B18;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Confirmar e-mail</a></p>
      <p style="color:#888;font-size:12px;">Se você não criou uma conta na Kira, ignore este e-mail.</p>
    </div>
  `;
}

export function resetPasswordEmailHtml(appUrl, token) {
  const link = `${appUrl}/?resetToken=${token}`;
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
      <h2>Redefinir sua senha na Kira</h2>
      <p>Clique no botão abaixo para escolher uma nova senha. Esse link expira em 1 hora.</p>
      <p><a href="${link}" style="display:inline-block;background:#3FA9FF;color:#060B18;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Redefinir senha</a></p>
      <p style="color:#888;font-size:12px;">Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>
    </div>
  `;
}
