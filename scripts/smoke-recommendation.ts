import { createDefaultProfile } from "../src/domain";
import { OpenAICompatibleAIProvider } from "../src/providers/ai/real";
import { NcmApiClient } from "../src/providers/music/netease-client";
import { NeteaseMusicProvider } from "../src/providers/music/netease";
import { RecommendationService } from "../src/services/recommendation";

const apiKey = process.env.AI_API_KEY;
if (!apiKey) throw new Error("请先在本地环境中设置 AI_API_KEY");

const inputText = process.argv.slice(2).join(" ").trim() || "在陌生城市夜里散步，想听点没听过但别太吵，不要我歌单里的";
const ai = new OpenAICompatibleAIProvider({
  apiKey,
  baseUrl: process.env.AI_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
  textModel: process.env.AI_TEXT_MODEL ?? "glm-4.7-flash",
  visionModel: process.env.AI_VISION_MODEL ?? "glm-4.6v-flash",
  thinking: "disabled",
  timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
  maxRetries: Number(process.env.AI_MAX_RETRIES ?? 3),
  retryBaseMs: Number(process.env.AI_RETRY_BASE_MS ?? 1_000),
});
const music = new NeteaseMusicProvider(new NcmApiClient(process.env.NCM_API_BASE_URL ?? "http://127.0.0.1:4000"), {
  playbackLevel: process.env.NCM_PLAYBACK_LEVEL ?? "standard",
  allowTrial: process.env.NCM_ALLOW_TRIAL === "true",
  enrichLimit: 8,
});
const profile = createDefaultProfile("local-smoke-user");
const service = new RecommendationService(music, ai);

const startedAt = performance.now();
const interpretation = await ai.interpretContext({ text: inputText, timezone: "Asia/Shanghai" });
const contextReadyAt = performance.now();
const plan = await service.recommend(interpretation.context, profile, 5, { discoveryMode: "auto" });
const completedAt = performance.now();

console.log(JSON.stringify({
  timing: {
    contextMs: Math.round(contextReadyAt - startedAt),
    recommendationMs: Math.round(completedAt - contextReadyAt),
  },
  context: {
    activity: interpretation.context.activity,
    targetMood: interpretation.context.targetMood,
    targetEnergy: interpretation.context.targetEnergy,
    familiarityBias: interpretation.context.familiarityBias,
    hardConstraints: interpretation.context.hardConstraints,
  },
  strategy: plan.brief ? {
    mode: plan.brief.discoveryIntent.mode,
    allowUserLibrary: plan.brief.discoveryIntent.allowUserLibrary,
    draftCount: plan.diagnostics?.draftCount ?? 0,
    matchedDraftCount: plan.diagnostics?.matchedDraftCount ?? 0,
    fallbackCandidateCount: plan.diagnostics?.fallbackCandidateCount ?? 0,
    failureCounts: plan.diagnostics?.failureCounts ?? {},
    resolutions: plan.diagnostics?.resolutions ?? [],
  } : null,
  tracks: plan.tracks.map((track) => ({
    position: track.position,
    title: track.title,
    artist: track.artist,
    reason: track.reason,
    source: track.retrieval?.source ?? "unknown",
    energy: track.features.energy,
    familiarity: track.features.familiarity,
  })),
}, null, 2));
