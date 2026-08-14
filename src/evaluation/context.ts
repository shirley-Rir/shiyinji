import type { LyricTolerance, SafetyRisk, StructuredContext } from "@/src/domain";
import { z } from "zod";

export type ContextEvalCase = {
  id: string;
  category: "travel" | "study" | "work" | "emotional_support";
  input: { text: string; timezone?: string };
  expected: {
    activityAny?: string[];
    currentMoodAny?: string[];
    targetMoodAny?: string[];
    environmentAny?: string[];
    energyRange?: [number, number];
    lyricToleranceAny?: LyricTolerance[];
    safetyRisk?: SafetyRisk;
  };
};

export type ContextEvalResult = {
  id: string;
  category: ContextEvalCase["category"];
  score: number;
  checks: Record<string, boolean>;
  context: StructuredContext;
};

export const contextEvalCasesSchema = z.array(z.object({
  id: z.string().min(1),
  category: z.enum(["travel", "study", "work", "emotional_support"]),
  input: z.object({ text: z.string().min(1), timezone: z.string().optional() }),
  expected: z.object({
    activityAny: z.array(z.string()).optional(),
    currentMoodAny: z.array(z.string()).optional(),
    targetMoodAny: z.array(z.string()).optional(),
    environmentAny: z.array(z.string()).optional(),
    energyRange: z.tuple([z.number(), z.number()]).optional(),
    lyricToleranceAny: z.array(z.enum(["none", "low", "medium", "high"])).optional(),
    safetyRisk: z.enum(["none", "watch", "high"]).optional(),
  }),
}));

export function scoreContextCase(testCase: ContextEvalCase, context: StructuredContext): ContextEvalResult {
  const checks: Record<string, boolean> = {};
  const expected = testCase.expected;
  if (expected.activityAny) checks.activity = includesAny(context.activity ? [context.activity] : [], expected.activityAny);
  if (expected.currentMoodAny) checks.currentMood = includesAny(context.currentMood, expected.currentMoodAny);
  if (expected.targetMoodAny) checks.targetMood = includesAny(context.targetMood, expected.targetMoodAny);
  if (expected.environmentAny) checks.environment = includesAny(context.environment, expected.environmentAny);
  if (expected.energyRange) checks.targetEnergy = context.targetEnergy >= expected.energyRange[0] && context.targetEnergy <= expected.energyRange[1];
  if (expected.lyricToleranceAny) checks.lyricTolerance = expected.lyricToleranceAny.includes(context.lyricTolerance);
  if (expected.safetyRisk) checks.safetyRisk = context.safetyRisk === expected.safetyRisk;
  const values = Object.values(checks);
  return { id: testCase.id, category: testCase.category, score: values.filter(Boolean).length / values.length, checks, context };
}

function includesAny(actual: string[], expected: string[]) {
  return actual.some((value) => expected.some((candidate) => value.includes(candidate) || candidate.includes(value)));
}
