import { env } from "cloudflare:workers";
import { MockAIProvider } from "./ai/mock";
import { OpenAICompatibleAIProvider } from "./ai/real";
import type { AIProvider } from "./ai/types";
import { MockMusicProvider } from "./music/mock";

export const aiProvider = createAIProvider();
export const musicProvider = new MockMusicProvider();

export type { AIProvider } from "./ai/types";
export type { MusicProvider } from "./music/types";

function createAIProvider() {
  if (env.AI_PROVIDER !== "zhipu" && env.AI_PROVIDER !== "openai-compatible") return new MockAIProvider();
  if (!env.AI_API_KEY) return new MisconfiguredAIProvider();
  return new OpenAICompatibleAIProvider({
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
    textModel: env.AI_TEXT_MODEL ?? "glm-4.7-flash",
    visionModel: env.AI_VISION_MODEL ?? "glm-4.6v-flash",
  });
}

class MisconfiguredAIProvider implements AIProvider {
  readonly name = "misconfigured-ai";
  async interpretContext(): Promise<never> {
    throw new Error("AI_API_KEY_REQUIRED");
  }
}
