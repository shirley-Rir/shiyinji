import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProfile } from "../../src/domain/profile";
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
