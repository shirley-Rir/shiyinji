import { env } from "cloudflare:workers";
import { sendQqSmtpMail } from "./qq-smtp";

export async function sendVerificationEmail(input: { email: string; code: string; purpose: "register" | "login" }) {
  const provider = env.EMAIL_PROVIDER ?? (env.APP_ENV === "production" ? "qq-smtp" : "console");
  if (provider === "console") {
    if (env.APP_ENV === "production") throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
    console.info(`[shiyinji-auth] ${input.purpose} code requested for ${maskEmail(input.email)}`);
    return;
  }
  const action = input.purpose === "register" ? "注册" : "登录";
  const subject = `拾音记${action}验证码`;
  const html = `<div style="font-family:Arial,sans-serif;color:#171816"><h2>拾音记</h2><p>你的${action}验证码是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${input.code}</p><p>验证码 10 分钟内有效。如非本人操作，请忽略这封邮件。</p></div>`;
  if (provider === "qq-smtp") {
    if (!env.QQ_SMTP_USER || !env.QQ_SMTP_AUTH_CODE) throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
    try {
      await sendQqSmtpMail({
        host: env.QQ_SMTP_HOST ?? "smtp.qq.com",
        port: Number(env.QQ_SMTP_PORT ?? 465),
        user: env.QQ_SMTP_USER,
        authCode: env.QQ_SMTP_AUTH_CODE,
        fromName: env.EMAIL_FROM_NAME ?? "拾音记",
        clientHostname: env.EMAIL_CLIENT_HOSTNAME ?? "music.shilrey.top",
        timeoutMs: Number(env.EMAIL_TIMEOUT_MS ?? 15_000),
      }, { to: input.email, subject, html });
      return;
    } catch (error) {
      console.error("[shiyinji-email] QQ SMTP delivery failed", safeSmtpError(error));
      throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
    }
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject,
      html,
    }),
  });
  if (!response.ok) throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
}

function safeSmtpError(error: unknown) {
  const message = error instanceof Error ? error.message : "SMTP_UNKNOWN_ERROR";
  return message.replace(/[^A-Z0-9:_-]/gi, "").slice(0, 80);
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}
