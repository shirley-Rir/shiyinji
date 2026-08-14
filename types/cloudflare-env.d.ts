declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AI_PROVIDER?: "mock" | "zhipu" | "openai-compatible";
    AI_API_KEY?: string;
    AI_BASE_URL?: string;
    AI_TEXT_MODEL?: string;
    AI_VISION_MODEL?: string;
  }
}
