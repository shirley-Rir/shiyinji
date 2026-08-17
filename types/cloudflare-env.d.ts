declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI_PROVIDER?: "mock" | "zhipu" | "openai-compatible";
    AI_API_KEY?: string;
    AI_BASE_URL?: string;
    AI_TEXT_MODEL?: string;
    AI_VISION_MODEL?: string;
    AI_VISION_FALLBACK_MODEL?: string;
    AI_TIMEOUT_MS?: string;
    AI_MAX_RETRIES?: string;
    AI_RETRY_BASE_MS?: string;
    MUSIC_PROVIDER?: "mock" | "netease";
    NCM_API_BASE_URL?: string;
    NCM_PLAYBACK_LEVEL?: string;
    NCM_ALLOW_TRIAL?: string;
    NCM_AUTH_MODE?: "none" | "password" | "qr";
    NCM_PHONE?: string;
    NCM_MD5_PASSWORD?: string;
    MUSIC_CREDENTIAL_ENCRYPTION_KEY?: string;
    APP_ENV?: "development" | "production";
    AUTH_EXPOSE_DEV_CODE?: string;
    AUTH_SESSION_DAYS?: string;
    EMAIL_PROVIDER?: "console" | "resend" | "qq-smtp";
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    QQ_SMTP_HOST?: string;
    QQ_SMTP_PORT?: string;
    QQ_SMTP_USER?: string;
    QQ_SMTP_AUTH_CODE?: string;
    EMAIL_FROM_NAME?: string;
    EMAIL_CLIENT_HOSTNAME?: string;
    EMAIL_TIMEOUT_MS?: string;
  }
}
