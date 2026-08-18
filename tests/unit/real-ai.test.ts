import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleAIProvider } from "../../src/providers/ai/real";
import { ResilientContextAIProvider } from "../../src/providers/ai/resilient";
import { MockAIProvider } from "../../src/providers/ai/mock";
import { createDefaultProfile, createProfileSummary, type StructuredContext } from "../../src/domain";

const modelOutput = {
  current_mood: ["疲惫"],
  target_mood: ["专注"],
  activity: "学习",
  environment: ["室内"],
  social_state: "alone",
  valence: -0.2,
  arousal: 0.3,
  target_energy: 42,
  lyric_tolerance: "low",
  familiarity_bias: 0.6,
  language_preferences: [],
  transition: "从疲惫到专注",
  hard_constraints: [],
  safety_risk: "none",
  confidence: 0.86,
  clarification: null,
};

const recommendationOutput = {
  discovery_intent: { mode: "balanced", novelty_level: 0.55, allow_user_library: true, allow_adjacent_artists: true, allow_platform_search: true, excluded_sources: [], reason: "兼顾熟悉感与探索" },
  desired_sound: { energy_range: [30, 55], lyric_density: "low", genres: ["轻电子"], moods: ["专注"], instruments: ["钢琴"], tempo_words: ["稳定"], language_preferences: [] },
  search_lanes: [
    { lane: "scene", query: "专注 轻电子", weight: 0.7, expected_role: "top_pick" },
    { lane: "fresh", query: "轻电子 新歌", weight: 0.3, expected_role: "exploration" },
  ],
  avoid: { genres: [], moods: [], artists: [], tracks: [], reasons: [] },
  draft_tracks: Array.from({ length: 10 }, (_, index) => ({ title: `测试歌曲${index + 1}`, artist: `测试歌手${index + 1}`, version_hint: "studio", fit_reason: "稳定且不过分打扰", risk_notes: [] })),
  explanation_focus: ["情境匹配", "画像延展"],
};

test("real AI provider maps structured JSON into the shared context contract", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-model",
    thinking: "disabled",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] });
    },
  });

  const result = await provider.interpretContext({ text: "有点累，准备看书", timezone: "Asia/Shanghai" });
  assert.equal(result.context.activity, "学习");
  assert.equal(result.context.targetEnergy, 42);
  assert.equal(result.provider, "real-ai:text-model");
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
  assert.deepEqual(requestBody?.thinking, { type: "disabled" });
});

test("lyrics identification returns only high-confidence song entities", async () => {
  let requestBody: { model?: string; response_format?: unknown; messages?: Array<{ content?: unknown }> } | undefined;
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ is_lyrics: true, title: "平凡之路", artist: "朴树", confidence: 0.94 }) } }] });
    },
  });

  const result = await provider.identifyLyrics("我曾经跨过山和大海");
  assert.deepEqual(result, { title: "平凡之路", artist: "朴树", confidence: 0.94 });
  assert.equal(requestBody?.model, "text-model");
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
  assert.match(JSON.stringify(requestBody?.messages), /歌词片段识别器/);
});

test("lyrics identification rejects uncertain matches", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ is_lyrics: true, title: "猜测歌曲", artist: null, confidence: 0.62 }) } }] }),
  });

  assert.equal(await provider.identifyLyrics("一句模糊的话"), null);
});

test("vision requests use the configured vision model and multimodal content", async () => {
  let requestBody: { model?: string; messages?: Array<{ content?: unknown }> } | undefined;
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-model",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(modelOutput)}\n\`\`\`` } }] });
    },
  });

  const result = await provider.interpretContext({ text: "", image: { name: "scene.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,dGVzdA==" } });
  assert.equal(result.context.source, "image");
  assert.equal(requestBody?.model, "vision-model");
  assert.equal(requestBody?.messages?.length, 1);
  assert.ok(Array.isArray(requestBody?.messages?.[0]?.content));
  assert.equal("response_format" in (requestBody ?? {}), false);
  const content = requestBody?.messages?.[0]?.content as Array<{ type?: string; text?: string; image_url?: { url?: string } }>;
  assert.equal(content.find((item) => item.type === "image_url")?.image_url?.url, "dGVzdA==");
  assert.match(content.find((item) => item.type === "text")?.text ?? "", /拾音记/);
});

test("vision requests pass a private signed image URL through unchanged", async () => {
  let requestBody: { messages?: Array<{ content?: unknown }> } | undefined;
  const signedUrl = "https://example.cos.ap-nanjing.myqcloud.com/context-images/u/scene.jpg?sign=temporary";
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-model",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] });
    },
  });

  await provider.interpretContext({ text: "", image: { name: "scene.jpg", type: "image/jpeg", size: 4, url: signedUrl } });

  const content = requestBody?.messages?.[0]?.content as Array<{ type?: string; image_url?: { url?: string } }>;
  assert.equal(content.find((item) => item.type === "image_url")?.image_url?.url, signedUrl);
});

test("vision requests use a second visual model when the primary is rate limited", async () => {
  const requestedModels: string[] = [];
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-primary",
    visionFallbackModel: "vision-fallback",
    maxRetries: 0,
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      requestedModels.push(body.model);
      return body.model === "vision-primary"
        ? Response.json({ error: { message: "busy" } }, { status: 429 })
        : Response.json({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] });
    },
  });

  const result = await provider.interpretContext({ text: "", image: { name: "scene.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,dGVzdA==" } });

  assert.deepEqual(requestedModels, ["vision-primary", "vision-fallback"]);
  assert.equal(result.provider, "real-ai:vision-fallback");
  assert.equal(result.context.source, "image");
});

test("image context replaces an unknown listening target with the observed atmosphere", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-model",
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...modelOutput, current_mood: ["开阔", "宁静"], target_mood: ["未知"], environment: ["空旷山路", "阴天"] }) } }] }),
  });
  const result = await provider.interpretContext({ text: "", image: { name: "road.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,dGVzdA==" } });
  assert.deepEqual(result.context.targetMood, ["开阔", "宁静"]);
});

test("vision requests use the fallback when the primary returns malformed content", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-primary",
    visionFallbackModel: "vision-fallback",
    maxRetries: 0,
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string; max_tokens: number };
      if (body.model === "vision-primary") return Response.json({ choices: [{ message: { content: "看起来是一条公路" } }] });
      assert.equal(body.max_tokens, 800);
      return Response.json({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] });
    },
  });

  const result = await provider.interpretContext({ text: "", image: { name: "scene.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,dGVzdA==" } });
  assert.equal(result.provider, "real-ai:vision-fallback");
});

test("deterministic safety guard cannot be downgraded by model output", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] }),
  });
  const result = await provider.interpretContext({ text: "我现在有伤害自己的念头" });
  assert.equal(result.context.safetyRisk, "high");
});

test("explicit no-lyrics input overrides a weaker model interpretation", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...modelOutput, lyric_tolerance: "low", hard_constraints: ["no lyrics"] }) } }] }),
  });
  const result = await provider.interpretContext({ text: "准备学习，不要歌词" });
  assert.equal(result.context.lyricTolerance, "none");
  assert.deepEqual(result.context.hardConstraints, ["不要歌词"]);
});

test("transient provider rate limits are retried", async () => {
  let attempts = 0;
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    maxRetries: 1,
    retryBaseMs: 1,
    fetch: async () => {
      attempts += 1;
      return attempts === 1
        ? Response.json({ error: { message: "busy" } }, { status: 429 })
        : Response.json({ choices: [{ message: { content: JSON.stringify(modelOutput) } }] });
    },
  });
  await provider.interpretContext({ text: "准备学习" });
  assert.equal(attempts, 2);
});

test("text context falls back to local rules after a transient provider outage", async () => {
  const primary = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    maxRetries: 0,
    fetch: async () => Response.json({ error: { message: "busy" } }, { status: 429 }),
  });
  const provider = new ResilientContextAIProvider(primary, new MockAIProvider());

  const result = await provider.interpretContext({ text: "准备学习，想安静专注，不要歌词" });

  assert.equal(result.context.activity, "工作或学习");
  assert.equal(result.context.lyricTolerance, "none");
  assert.equal(result.provider, "fallback-rules:mock-ai-v1");
});

test("image-only context does not pretend to understand an image during provider outage", async () => {
  const primary = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    visionModel: "vision-model",
    maxRetries: 0,
    fetch: async () => Response.json({ error: { message: "busy" } }, { status: 503 }),
  });
  const provider = new ResilientContextAIProvider(primary, new MockAIProvider());

  await assert.rejects(
    provider.interpretContext({ text: "", image: { name: "scene.png", type: "image/png", size: 4, dataUrl: "data:image/png;base64,dGVzdA==" } }),
    /AI_PROVIDER_ERROR:503/,
  );
});

test("network failures are normalized and text requests use the local fallback", async () => {
  const primary = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    maxRetries: 0,
    fetch: async () => { throw new TypeError("connection reset with sensitive details"); },
  });
  const provider = new ResilientContextAIProvider(primary, new MockAIProvider());

  const result = await provider.interpretContext({ text: "在旅行路上，想听开阔一点的" });
  assert.equal(result.context.activity, "旅行途中");
  assert.equal(result.provider, "fallback-rules:mock-ai-v1");
});

test("malformed model output uses the local fallback for text context", async () => {
  const primary = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    maxRetries: 0,
    fetch: async () => Response.json({ choices: [{ message: { content: "not-json" } }] }),
  });
  const provider = new ResilientContextAIProvider(primary, new MockAIProvider());

  const result = await provider.interpretContext({ text: "工作时想专注，不要歌词" });
  assert.equal(result.context.lyricTolerance, "none");
  assert.equal(result.provider, "fallback-rules:mock-ai-v1");
});

test("explicit denial keeps ambiguous distress at watch instead of high", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...modelOutput, safety_risk: "high" }) } }] }),
  });
  const result = await provider.interpretContext({ text: "最近觉得活着没意思，但我不准备伤害自己" });
  assert.equal(result.context.safetyRisk, "watch");
});

test("ordinary low mood cannot be upgraded to safety risk by the general model", async () => {
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ ...modelOutput, safety_risk: "watch" }) } }] }),
  });
  const result = await provider.interpretContext({ text: "今天被否定了很多次，心里很堵，只想安静待一会儿" });
  assert.equal(result.context.safetyRisk, "none");
});

test("recommendation planner sends only compressed profile data and returns searchable drafts", async () => {
  let requestText = "";
  const provider = new OpenAICompatibleAIProvider({
    apiKey: "test-key",
    baseUrl: "https://model.example/v1",
    textModel: "text-model",
    fetch: async (_input, init) => {
      requestText = String(init?.body);
      return Response.json({ choices: [{ message: { content: JSON.stringify(recommendationOutput) } }] });
    },
  });
  const profile = createDefaultProfile("private-user-id");
  const result = await provider.planRecommendation({
    context: { ...modelContext(), hardConstraints: ["不要歌单内歌曲"] },
    profile,
    profileSummary: { ...createProfileSummary(profile), representativeTracks: [{ providerTrackId: "1", title: "测试歌曲1", artist: "测试歌手1", source: "playlist" }] },
    requestedMode: "explore",
    draftCount: 10,
  });

  assert.equal(result.discoveryIntent.mode, "explore");
  assert.equal(result.discoveryIntent.allowUserLibrary, false);
  assert.equal(result.draftTracks.length, 9);
  assert.ok(result.draftTracks.every((track) => track.artist));
  assert.equal(requestText.includes("private-user-id"), false);
  assert.equal(requestText.includes("context_evidence"), true);
});

function modelContext(): StructuredContext {
  return {
    source: "text" as const,
    requestIntent: "recommendation",
    directPlay: null,
    currentMood: modelOutput.current_mood,
    targetMood: modelOutput.target_mood,
    activity: modelOutput.activity,
    environment: modelOutput.environment,
    socialState: "alone",
    valence: modelOutput.valence,
    arousal: modelOutput.arousal,
    targetEnergy: modelOutput.target_energy,
    lyricTolerance: "low",
    familiarityBias: modelOutput.familiarity_bias,
    languagePreferences: modelOutput.language_preferences,
    transition: modelOutput.transition,
    hardConstraints: modelOutput.hard_constraints,
    safetyRisk: "none",
    confidence: modelOutput.confidence,
  };
}
