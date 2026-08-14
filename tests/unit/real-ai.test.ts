import test from "node:test";
import assert from "node:assert/strict";
import { OpenAICompatibleAIProvider } from "../../src/providers/ai/real";

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

test("real AI provider maps structured JSON into the shared context contract", async () => {
  let requestBody: Record<string, unknown> | undefined;
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

  const result = await provider.interpretContext({ text: "有点累，准备看书", timezone: "Asia/Shanghai" });
  assert.equal(result.context.activity, "学习");
  assert.equal(result.context.targetEnergy, 42);
  assert.equal(result.provider, "real-ai:text-model");
  assert.deepEqual(requestBody?.response_format, { type: "json_object" });
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
  assert.ok(Array.isArray(requestBody?.messages?.[1]?.content));
  assert.equal("response_format" in (requestBody ?? {}), false);
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
