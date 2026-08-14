import { env } from "cloudflare:workers";
import { MockAIProvider } from "./ai/mock";
import { OpenAICompatibleAIProvider } from "./ai/real";
import type { AIProvider, RecommendationPlanner } from "./ai/types";
import { MockMusicProvider } from "./music/mock";
import { NcmApiClient } from "./music/netease-client";
import { NeteaseMusicProvider } from "./music/netease";
import { NcmSessionManager } from "./music/netease-session";

export const aiProvider = createAIProvider();
export const recommendationPlanner: RecommendationPlanner = aiProvider;
const music = createMusicProvider();
export const musicProvider = music.provider;
export const neteaseSessionManager = music.sessions;

export type { AIProvider, RecommendationPlanner } from "./ai/types";
export type { MusicProvider } from "./music/types";

function createAIProvider() {
  if (env.AI_PROVIDER !== "zhipu" && env.AI_PROVIDER !== "openai-compatible") return new MockAIProvider();
  if (!env.AI_API_KEY) return new MisconfiguredAIProvider();
  return new OpenAICompatibleAIProvider({
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
    textModel: env.AI_TEXT_MODEL ?? "glm-4.7-flash",
    visionModel: env.AI_VISION_MODEL ?? "glm-4.6v-flash",
    thinking: "disabled",
    timeoutMs: Number(env.AI_TIMEOUT_MS ?? 30_000),
    maxRetries: Number(env.AI_MAX_RETRIES ?? 3),
    retryBaseMs: Number(env.AI_RETRY_BASE_MS ?? 1_000),
  });
}

class MisconfiguredAIProvider implements AIProvider, RecommendationPlanner {
  readonly name = "misconfigured-ai";
  async interpretContext(): Promise<never> {
    throw new Error("AI_API_KEY_REQUIRED");
  }
  async planRecommendation(): Promise<never> {
    throw new Error("AI_API_KEY_REQUIRED");
  }
}

function createMusicProvider() {
  if (env.MUSIC_PROVIDER !== "netease") return { provider: new MockMusicProvider(), sessions: null };
  const client = new NcmApiClient(env.NCM_API_BASE_URL ?? "http://127.0.0.1:4000");
  const sessions = new NcmSessionManager(client, {
    authMode: env.NCM_AUTH_MODE ?? "none",
    phone: env.NCM_PHONE,
    md5Password: env.NCM_MD5_PASSWORD,
  });
  return { provider: new NeteaseMusicProvider(client, {
    playbackLevel: env.NCM_PLAYBACK_LEVEL ?? "standard",
    allowTrial: env.NCM_ALLOW_TRIAL === "true",
  }, sessions), sessions };
}
