import assert from "node:assert/strict";
import test from "node:test";
import { MockAIProvider } from "../../src/providers/ai/mock";

test("mock AI produces the shared context contract for focused work", async () => {
  const provider = new MockAIProvider();
  const result = await provider.interpretContext({ text: "我要开始工作，想安静专注，不要歌词。" });

  assert.equal(result.context.activity, "工作或学习");
  assert.equal(result.context.lyricTolerance, "none");
  assert.ok(result.context.targetMood.includes("专注"));
  assert.ok(result.context.confidence >= 0.55);
  assert.equal(result.clarification, null);
});

test("mock AI keeps multimodal input in the same domain shape", async () => {
  const provider = new MockAIProvider();
  const result = await provider.interpretContext({ text: "", image: { name: "scene.jpg", type: "image/jpeg", size: 1024 } });

  assert.equal(result.context.source, "image");
  assert.ok(result.context.environment.includes("图片情境"));
  assert.equal(typeof result.context.targetEnergy, "number");
});
