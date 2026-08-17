import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { contextEvalCasesSchema, scoreContextCase } from "../../src/evaluation/context";
import type { StructuredContext } from "../../src/domain";

test("context evaluation dataset covers all four product scenarios", async () => {
  const cases = contextEvalCasesSchema.parse(JSON.parse(await readFile("tests/fixtures/context-eval-cases.json", "utf8")));
  assert.equal(cases.length, 32);
  assert.deepEqual(new Set(cases.map((item) => item.category)), new Set(["travel", "study", "work", "emotional_support"]));
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
});

test("context scorer accepts semantic labels and bounded numeric expectations", () => {
  const context: StructuredContext = {
    source: "text", requestIntent: "recommendation", directPlay: null, currentMood: ["有些疲惫"], targetMood: ["进入专注"], activity: "论文学习", environment: ["图书馆室内"], socialState: "alone",
    valence: -0.1, arousal: 0.4, targetEnergy: 45, lyricTolerance: "low", familiarityBias: 0.5, languagePreferences: [], transition: "从疲惫到专注", hardConstraints: [], safetyRisk: "none", confidence: 0.9,
  };
  const result = scoreContextCase({ id: "sample", category: "study", input: { text: "test" }, expected: { activityAny: ["学习"], currentMoodAny: ["疲惫"], targetMoodAny: ["专注"], environmentAny: ["图书馆"], energyRange: [35, 55], lyricToleranceAny: ["low"], safetyRisk: "none" } }, context);
  assert.equal(result.score, 1);
});
