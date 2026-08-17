import type { NcmApiClient, NcmTasteProfile } from "./netease-client";

type SessionClient = Pick<NcmApiClient, "loginWithPhone" | "createQr" | "checkQr" | "getLoginStatus" | "getTasteProfile">;

type SessionSource = "password" | "qr";

export type NcmSession = {
  cookie: string;
  userId: number;
  source: SessionSource;
  connectedAt: string;
};

export interface NcmSessionPersistence {
  load(appUserId: string): Promise<NcmSession | null>;
  save(appUserId: string, session: NcmSession): Promise<void>;
  delete(appUserId: string): Promise<void>;
}

type SessionConfig = {
  authMode?: "none" | "password" | "qr";
  phone?: string;
  md5Password?: string;
};

export type NcmConnectionStatus = {
  status: "disconnected" | "waiting" | "scanned" | "connected" | "unavailable";
  source: SessionSource | null;
  connectedAt: string | null;
  message: string | null;
  taste: { likedCount: number; recordCount: number; preferredGenres: string[] } | null;
};

export class NcmSessionManager {
  private readonly sessions = new Map<string, NcmSession>();
  private readonly pendingQr = new Map<string, string>();
  private readonly tastes = new Map<string, { expiresAt: number; value: NcmTasteProfile }>();
  private readonly passwordAttempts = new Map<string, Promise<NcmSession | null>>();
  private passwordFailure: string | null = null;
  private readonly restorationAttempts = new Map<string, Promise<NcmSession | null>>();

  constructor(private readonly client: SessionClient, private readonly config: SessionConfig = {}, private readonly persistence?: NcmSessionPersistence) {}

  async getSession(appUserId: string) {
    const existing = this.sessions.get(appUserId);
    if (existing) return existing;
    const restored = await this.restoreSession(appUserId);
    if (restored) return restored;
    if (this.config.authMode !== "password" || !this.config.phone || !this.config.md5Password) return null;
    let passwordAttempt = this.passwordAttempts.get(appUserId);
    if (!passwordAttempt) {
      passwordAttempt = this.loginWithConfiguredAccount(appUserId);
      this.passwordAttempts.set(appUserId, passwordAttempt);
    }
    return passwordAttempt;
  }

  async getTaste(appUserId: string, session: NcmSession): Promise<NcmTasteProfile> {
    const cached = this.tastes.get(appUserId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.client.getTasteProfile(session.userId, session.cookie);
    this.tastes.set(appUserId, { value, expiresAt: Date.now() + 10 * 60 * 1000 });
    return value;
  }

  async createQr(appUserId: string) {
    const qr = await this.client.createQr();
    this.pendingQr.set(appUserId, qr.key);
    return qr;
  }

  async checkQr(appUserId: string, key: string) {
    if (this.pendingQr.get(appUserId) !== key) throw new Error("NCM_QR_INVALID_KEY");
    const result = await this.client.checkQr(key);
    if (result.code === 803 && result.cookie) {
      const account = await this.client.getLoginStatus(result.cookie);
      const session: NcmSession = { cookie: result.cookie, userId: account.userId, source: "qr", connectedAt: new Date().toISOString() };
      await this.persistence?.save(appUserId, session);
      this.sessions.set(appUserId, session);
      this.pendingQr.delete(appUserId);
      this.tastes.delete(appUserId);
    }
    if (result.code === 800) {
      this.pendingQr.delete(appUserId);
      return { status: "disconnected" as const, source: null, connectedAt: null, message: "二维码已过期，请重新生成", taste: null };
    }
    return this.getStatus(appUserId, result.code === 802 ? "scanned" : undefined);
  }

  async disconnect(appUserId: string) {
    this.sessions.delete(appUserId);
    this.pendingQr.delete(appUserId);
    this.tastes.delete(appUserId);
    this.restorationAttempts.delete(appUserId);
    this.passwordAttempts.delete(appUserId);
    await this.persistence?.delete(appUserId);
  }

  async getStatus(appUserId: string, transientStatus?: "scanned"): Promise<NcmConnectionStatus> {
    const session = this.sessions.get(appUserId);
    if (session) {
      const taste = await this.getTaste(appUserId, session).catch(() => null);
      return {
        status: "connected",
        source: session.source,
        connectedAt: session.connectedAt,
        message: null,
        taste: taste ? { likedCount: taste.likedIds.size, recordCount: taste.playCounts.size, preferredGenres: taste.preferredGenres.slice(0, 6) } : null,
      };
    }
    if (transientStatus) return { status: transientStatus, source: null, connectedAt: null, message: null, taste: null };
    if (this.pendingQr.has(appUserId)) return { status: "waiting", source: null, connectedAt: null, message: null, taste: null };
    if (this.passwordFailure) return { status: "unavailable", source: null, connectedAt: null, message: this.passwordFailure, taste: null };
    return { status: "disconnected", source: null, connectedAt: null, message: null, taste: null };
  }

  private async loginWithConfiguredAccount(appUserId: string) {
    try {
      const login = await this.client.loginWithPhone(this.config.phone!, this.config.md5Password!);
      const session: NcmSession = { cookie: login.cookie, userId: login.userId, source: "password", connectedAt: new Date().toISOString() };
      await this.persistence?.save(appUserId, session);
      this.sessions.set(appUserId, session);
      return session;
    } catch (error) {
      this.passwordFailure = error instanceof Error && error.message.includes("-460")
        ? "密码登录被网易云风控拦截，请使用二维码连接"
        : "本地账号连接失败，请使用二维码连接";
      return null;
    }
  }

  private async restoreSession(appUserId: string) {
    if (!this.persistence) return null;
    let attempt = this.restorationAttempts.get(appUserId);
    if (!attempt) {
      attempt = this.persistence.load(appUserId).then((session) => {
        if (session) this.sessions.set(appUserId, session);
        return session;
      }).catch(() => null);
      this.restorationAttempts.set(appUserId, attempt);
    }
    return attempt;
  }
}
