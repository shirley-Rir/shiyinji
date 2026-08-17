import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProfile } from "../../src/domain/profile";
import { createProfileSummary } from "../../src/domain/discovery";
import { MockAIProvider } from "../../src/providers/ai/mock";
import { MockMusicProvider } from "../../src/providers/music/mock";
import { RecommendationService } from "../../src/services/recommendation";

test("recommendation ranks real provider candidates and preserves score reasons", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "今天很疲惫，想安静休息，不要太伤感。" })).context;
  const service = new RecommendationService(new MockMusicProvider());
  const plan = await service.recommend(context, createDefaultProfile("test-user"), 5);

  assert.equal(plan.modelVersion, "weighted-ranker-v2");
  assert.equal(plan.tracks.length, 5);
  assert.equal(plan.tracks[0].position, 1);
  assert.equal(plan.tracks[0].role, "top_pick");
  assert.ok(plan.tracks[0].id.startsWith("mock:"));
  assert.ok(plan.tracks[0].reason.length > 8);
  assert.ok(plan.tracks[0].score >= plan.tracks[1].score);
});

test("hard lyric constraint removes tracks with lyrics before ranking", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "开始工作，需要专注，只听纯音乐不要歌词。" })).context;
  const service = new RecommendationService(new MockMusicProvider());
  const plan = await service.recommend(context, createDefaultProfile("test-user"), 5);

  assert.ok(plan.tracks.length > 0);
  assert.ok(plan.tracks.every((track) => track.features.lyricDensity === "none"));
});

test("second-stage ranking uses account familiarity in the requested direction", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "今天想听熟悉一点的歌。" })).context;
  context.familiarityBias = 0.9;
  const mock = new MockMusicProvider();
  const source = await mock.retrieveCandidates({ context, profile: createDefaultProfile("test-user"), limit: 2 });
  const candidates = [
    { ...source[0], id: "mock:familiar", features: { ...source[0].features, familiarity: 0.92 } },
    { ...source[0], id: "mock:new", features: { ...source[0].features, familiarity: 0.08 } },
  ];
  const provider = {
    name: "familiarity-test",
    async retrieveCandidates() { return candidates; },
    async filterPlayable(trackIds: string[]) { return trackIds; },
    async resolvePlayback() { throw new Error("not used"); },
  };
  const plan = await new RecommendationService(provider).recommend(context, createDefaultProfile("test-user"), 2);
  assert.equal(plan.tracks[0].id, "mock:familiar");
  assert.match(plan.tracks[0].reason, /熟悉/);
});

test("hybrid recommendation searches model drafts before ranking", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "准备工作，想安静专注" })).context;
  const service = new RecommendationService(new MockMusicProvider(), ai);
  const plan = await service.recommend(context, createDefaultProfile("test-user"), 5);

  assert.equal(plan.modelVersion, "draft-search-v1+weighted-ranker-v2");
  assert.equal(plan.brief?.draftTracks.length, 5);
  assert.equal(plan.tracks.length, 5);
  assert.ok(plan.tracks.some((track) => track.retrieval?.source === "draft"));
  assert.ok(plan.tracks.some((track) => /低干扰|情绪|开阔|稳定|熟悉/.test(track.reason)));
});

test("invalid model drafts fall back to context retrieval", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "旅行路上想听歌" })).context;
  const planner = {
    name: "invalid-draft-planner",
    async planRecommendation(input: Parameters<MockAIProvider["planRecommendation"]>[0]) {
      const brief = await ai.planRecommendation(input);
      return { ...brief, draftTracks: brief.draftTracks.map((track, index) => ({ ...track, title: `不存在的歌曲${index}` })) };
    },
  };
  const plan = await new RecommendationService(new MockMusicProvider(), planner).recommend(context, createDefaultProfile("test-user"), 5);

  assert.equal(plan.tracks.length, 5);
  assert.ok(plan.tracks.every((track) => track.retrieval?.source === "search_fallback"));
});

test("planner outages are visible in diagnostics while recommendation falls back", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "安静工作" })).context;
  const planner = { name: "unavailable", async planRecommendation(): Promise<never> { throw new Error("AI_PROVIDER_ERROR:429:busy"); } };
  const plan = await new RecommendationService(new MockMusicProvider(), planner).recommend(context, createDefaultProfile("test-user"), 5);

  assert.equal(plan.tracks.length, 5);
  assert.equal(plan.modelVersion, "weighted-ranker-v2");
  assert.equal(plan.diagnostics?.plannerFallbackReason, "unavailable");
});

test("disabled personalization produces an empty model profile summary", () => {
  const profile = createDefaultProfile("private-user");
  profile.personalizationEnabled = false;
  const summary = createProfileSummary(profile);

  assert.deepEqual(summary.likedGenres, []);
  assert.deepEqual(summary.longTermTraits, []);
  assert.deepEqual(summary.representativeTracks, []);
});

test("explore ranking keeps account taste while preferring unheard tracks", async () => {
  const ai = new MockAIProvider();
  const context = (await ai.interpretContext({ text: "想发现没听过的新歌，保持我喜欢的器乐和低能量风格" })).context;
  context.familiarityBias = 0.1;
  const mock = new MockMusicProvider();
  const source = await mock.retrieveCandidates({ context, profile: createDefaultProfile("test-user"), limit: 1 });
  const candidates = [
    {
      ...source[0],
      id: "mock:taste-fit",
      title: "New Quiet Instrumental",
      artist: "New Artist A",
      features: { ...source[0].features, genres: ["器乐"], languages: [], energy: 34, lyricDensity: "none" as const, familiarity: 0.08 },
    },
    {
      ...source[0],
      id: "mock:taste-miss",
      title: "New Loud Vocal",
      artist: "New Artist B",
      features: { ...source[0].features, genres: ["摇滚"], languages: ["英语"], energy: 88, lyricDensity: "high" as const, familiarity: 0.08 },
    },
  ];
  const provider = {
    name: "profile-ranking-test",
    async retrieveCandidates() { return candidates; },
    async filterPlayable(trackIds: string[]) { return trackIds; },
    async resolvePlayback() { throw new Error("not used"); },
  };
  const profile = createDefaultProfile("test-user");
  profile.musicProfile = {
    userId: profile.userId,
    provider: "netease",
    version: 1,
    analyzedAt: new Date().toISOString(),
    confidence: 0.88,
    sourceCoverage: { playlistCount: 3, libraryTrackCount: 120, analyzedTrackCount: 60, lyricTrackCount: 20, historyTrackCount: 40 },
    genres: [{ value: "器乐", weight: 0.92, confidence: 0.9, evidenceCount: 30 }],
    languages: [],
    artists: [],
    lyricThemes: [],
    playlistThemes: [],
    preferredEnergy: { center: 35, range: [20, 50], confidence: 0.86 },
    preferredValence: { center: 0.1, range: [-0.2, 0.4], confidence: 0.74 },
    lyricPreference: { instrumentalRatio: 0.7, preferredDensity: "none", narrativeStrength: 0.15 },
    diversity: { artistDiversity: 0.8, genreDiversity: 0.5, noveltyTolerance: 0.65 },
    preferenceClusters: [],
    representativeTracks: [],
  };

  const plan = await new RecommendationService(provider).recommend(context, profile, 2);
  assert.equal(plan.tracks[0].id, "mock:taste-fit");
  assert.ok(plan.tracks[0].scoreBreakdown.explicitPreference > plan.tracks[1].scoreBreakdown.explicitPreference);
  assert.ok(plan.tracks.every((track) => track.features.familiarity < 0.2));
});

test("direct song requests bypass recommendation planning and return one exact track", async () => {
  const mock = new MockMusicProvider();
  const context = (await new MockAIProvider().interpretContext({ text: "普通情境" })).context;
  context.requestIntent = "direct_play";
  context.directPlay = { title: "雨停之后", artist: "拾音记演示曲库", versionHint: "studio" };
  let plannerCalls = 0;
  const planner = { name: "must-not-run", async planRecommendation(): Promise<never> { plannerCalls += 1; throw new Error("should not run"); } };
  const plan = await new RecommendationService(mock, planner).recommend(context, createDefaultProfile("test-user"), 5);

  assert.equal(plannerCalls, 0);
  assert.equal(plan.modelVersion, "direct-search-v1");
  assert.equal(plan.tracks.length, 1);
  assert.equal(plan.tracks[0].title, "雨停之后");
  assert.equal(plan.tracks[0].reason, "按你的点歌请求播放《雨停之后》");
});
