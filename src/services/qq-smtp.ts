import { connect, type TLSSocket } from "node:tls";

type QqSmtpConfig = {
  host: string;
  port: number;
  user: string;
  authCode: string;
  fromName: string;
  clientHostname: string;
  timeoutMs: number;
};

type MailInput = { to: string; subject: string; html: string };

export async function sendQqSmtpMail(config: QqSmtpConfig, input: MailInput) {
  assertEmail(config.user);
  assertEmail(input.to);
  const socket = await openSocket(config);
  const smtp = new SmtpConversation(socket);
  try {
    await smtp.expect([220]);
    await smtp.command(`EHLO ${sanitizeHostname(config.clientHostname)}`, [250]);
    await smtp.command("AUTH LOGIN", [334]);
    await smtp.command(base64Ascii(config.user), [334]);
    await smtp.command(base64Ascii(config.authCode), [235]);
    await smtp.command(`MAIL FROM:<${config.user}>`, [250]);
    await smtp.command(`RCPT TO:<${input.to}>`, [250, 251]);
    await smtp.command("DATA", [354]);
    await smtp.writeData(buildMimeMessage(config, input));
    await smtp.expect([250]);
    await smtp.command("QUIT", [221]).catch(() => undefined);
  } finally {
    socket.destroy();
  }
}

export function buildMimeMessage(config: Pick<QqSmtpConfig, "user" | "fromName" | "clientHostname">, input: MailInput) {
  assertEmail(config.user);
  assertEmail(input.to);
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${sanitizeHostname(config.clientHostname)}>`,
    `From: ${encodeHeader(config.fromName)} <${config.user}>`,
    `To: <${input.to}>`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${wrapBase64(base64Utf8(input.html))}`;
}

async function openSocket(config: QqSmtpConfig) {
  return new Promise<TLSSocket>((resolve, reject) => {
    const socket = connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("SMTP_CONNECTION_TIMEOUT"));
    }, config.timeoutMs);
    socket.once("secureConnect", () => { clearTimeout(timer); resolve(socket); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

class SmtpConversation {
  private buffer = "";
  private lines: string[] = [];
  private replies: string[] = [];
  private waiters: Array<(reply: string) => void> = [];

  constructor(private readonly socket: TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => this.accept(String(chunk)));
    socket.on("error", () => this.flush("451 SMTP connection failed"));
    socket.on("close", () => this.flush("451 SMTP connection closed"));
  }

  async command(value: string, expected: number[]) {
    this.socket.write(`${value}\r\n`);
    return this.expect(expected);
  }

  async writeData(message: string) {
    const escaped = message.replace(/\r?\n\./g, "\r\n..");
    this.socket.write(`${escaped}\r\n.\r\n`);
  }

  async expect(expected: number[]) {
    const reply = await this.nextReply();
    const code = Number(reply.slice(0, 3));
    if (!expected.includes(code)) throw new Error(`SMTP_REJECTED:${Number.isFinite(code) ? code : "UNKNOWN"}`);
    return reply;
  }

  private nextReply() {
    const ready = this.replies.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise<string>((resolve) => this.waiters.push(resolve));
  }

  private accept(chunk: string) {
    this.buffer += chunk;
    const parts = this.buffer.split("\r\n");
    this.buffer = parts.pop() ?? "";
    for (const line of parts) {
      this.lines.push(line);
      if (/^\d{3} /.test(line)) {
        const reply = this.lines.join("\r\n");
        this.lines = [];
        this.push(reply);
      }
    }
  }

  private push(reply: string) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(reply); else this.replies.push(reply);
  }

  private flush(reply: string) {
    while (this.waiters.length) this.waiters.shift()?.(reply);
  }
}

function assertEmail(value: string) {
  if (!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(value)) throw new Error("SMTP_INVALID_EMAIL");
}

function sanitizeHostname(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  return clean || "localhost";
}

function encodeHeader(value: string) {
  const clean = value.replace(/[\r\n]/g, " ").trim();
  return `=?UTF-8?B?${base64Utf8(clean)}?=`;
}

function base64Ascii(value: string) {
  return btoa(value);
}

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}
