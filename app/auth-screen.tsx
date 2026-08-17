"use client";

import { ArrowRight, KeyRound, Mail, Music2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { loginWithAccountCode, loginWithAccountPassword, registerAccount, requestAuthCode, type AuthUser } from "@/src/client/api";

type Mode = "password" | "code" | "register";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendCode() {
    if (!email.trim()) { setError("请先填写邮箱"); return; }
    try {
      setSending(true); setError(""); setMessage("");
      const result = await requestAuthCode(email, mode === "register" ? "register" : "login");
      setMessage(result.dev_code ? `本地验证码：${result.dev_code}` : "验证码已发送，请查看邮箱");
      if (result.dev_code) setCode(result.dev_code);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "验证码发送失败");
    } finally { setSending(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setBusy(true); setError("");
      const result = mode === "register"
        ? await registerAccount({ email, code, password, displayName })
        : mode === "code"
          ? await loginWithAccountCode(email, code)
          : await loginWithAccountPassword(email, password);
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "登录失败，请稍后重试");
    } finally { setBusy(false); }
  }

  function switchMode(next: Mode) {
    setMode(next); setError(""); setMessage(""); setCode(""); setPassword("");
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <div className="auth-brand"><span><Music2 size={20} /></span>拾音记</div>
        <div>
          <p className="eyebrow">你的音乐画像，从账号开始</p>
          <h1>把每一次喜欢，<br />留给下一次此刻。</h1>
          <p>登录后，你的歌单分析、情境偏好和反馈会安全地归属于同一个账号。</p>
        </div>
        <div className="auth-note"><span>01</span>文字与图片理解情境 <span>02</span>账号级音乐画像 <span>03</span>完整歌曲播放</div>
      </section>
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-form-heading">
            <p>{mode === "register" ? "创建账号" : "欢迎回来"}</p>
            <h2>{mode === "register" ? "开始积累你的声音偏好" : "继续听属于你的推荐"}</h2>
          </div>
          {mode !== "register" && (
            <div className="auth-tabs" role="tablist" aria-label="登录方式">
              <button type="button" className={mode === "password" ? "is-active" : ""} onClick={() => switchMode("password")}>密码登录</button>
              <button type="button" className={mode === "code" ? "is-active" : ""} onClick={() => switchMode("code")}>验证码登录</button>
            </div>
          )}
          {mode === "register" && <label className="auth-field"><span>昵称</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="怎么称呼你" required /></label>}
          <label className="auth-field"><span>邮箱</span><div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></div></label>
          {(mode === "code" || mode === "register") && <label className="auth-field"><span>验证码</span><div><KeyRound size={17} /><input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="6 位验证码" required /><button type="button" className="send-code" onClick={() => void sendCode()} disabled={sending}>{sending ? "发送中" : "发送验证码"}</button></div></label>}
          {(mode === "password" || mode === "register") && <label className="auth-field"><span>密码</span><div><KeyRound size={17} /><input type="password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder={mode === "register" ? "至少 8 位" : "输入密码"} required /></div></label>}
          {message && <p className="auth-message" role="status">{message}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "请稍候" : mode === "register" ? "注册并进入" : "登录"}<ArrowRight size={18} /></button>
          <p className="auth-switch">{mode === "register" ? "已经有账号？" : "第一次来拾音记？"}<button type="button" onClick={() => switchMode(mode === "register" ? "password" : "register")}>{mode === "register" ? "返回登录" : "注册账号"}</button></p>
        </form>
      </section>
    </main>
  );
}
