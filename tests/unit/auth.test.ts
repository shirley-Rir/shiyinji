import assert from "node:assert/strict";
import test from "node:test";
import { clearSessionCookie, readSessionToken, sessionCookie } from "@/src/server/auth-cookie";
import { hashPassword, hashValue, randomToken, randomVerificationCode, verifyPassword } from "@/src/services/auth-crypto";
import { codeLoginRequest, passwordLoginRequest, registerRequest, requestEmailCodeRequest } from "@/src/server/request";
import { buildMimeMessage } from "@/src/services/qq-smtp";

test("password hashing verifies the intended password only", async () => {
  const stored = await hashPassword("a useful passphrase", "fixed-test-salt", 1_000);
  assert.equal(await verifyPassword("a useful passphrase", stored.hash, stored.salt, stored.iterations), true);
  assert.equal(await verifyPassword("wrong password", stored.hash, stored.salt, stored.iterations), false);
});

test("tokens and verification codes have the expected shape", async () => {
  assert.match(randomToken(), /^[A-Za-z0-9_-]{40,}$/);
  assert.match(randomVerificationCode(), /^\d{6}$/);
  assert.equal(await hashValue("same", "salt"), await hashValue("same", "salt"));
  assert.notEqual(await hashValue("same", "salt"), await hashValue("same", "other-salt"));
});

test("auth request schemas normalize email and reject weak input", () => {
  assert.equal(requestEmailCodeRequest.parse({ email: " Name@Example.COM ", purpose: "register" }).email, "name@example.com");
  assert.equal(passwordLoginRequest.safeParse({ email: "user@example.com", password: "short" }).success, false);
  assert.equal(codeLoginRequest.safeParse({ email: "user@example.com", code: "12345" }).success, false);
  assert.equal(registerRequest.safeParse({ email: "user@example.com", code: "123456", password: "long-enough", display_name: "拾音者" }).success, true);
});

test("session cookies are HttpOnly, scoped and secure on HTTPS", () => {
  const request = new Request("https://music.example.com/api");
  const cookie = sessionCookie("token value", new Date("2030-01-01T00:00:00.000Z"), request);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /; Secure/);
  assert.equal(readSessionToken(new Request("https://music.example.com", { headers: { cookie } })), "token value");
  assert.match(clearSessionCookie(request), /Max-Age=0/);
});

test("QQ SMTP message encodes Chinese headers and body without leaking raw HTML lines", () => {
  const message = buildMimeMessage(
    { user: "sender@qq.com", fromName: "拾音记", clientHostname: "music.shilrey.top" },
    { to: "listener@example.com", subject: "拾音记登录验证码", html: "<p>验证码：123456</p>" },
  );
  assert.match(message, /From: =\?UTF-8\?B\?/);
  assert.match(message, /Subject: =\?UTF-8\?B\?/);
  assert.match(message, /Content-Transfer-Encoding: base64/);
  assert.doesNotMatch(message, /验证码：123456/);
  assert.doesNotMatch(message, /\n\./);
});
