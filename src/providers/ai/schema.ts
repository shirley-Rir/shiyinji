import { z } from "zod";

const boundedNumber = (min: number, max: number) => z.number().min(min).max(max);

export const modelInterpretationSchema = z.object({
  current_mood: z.array(z.string()).min(1).max(4),
  target_mood: z.array(z.string()).min(1).max(4),
  activity: z.string().nullable(),
  environment: z.array(z.string()).max(5),
  social_state: z.enum(["alone", "with_others", "unknown"]),
  valence: boundedNumber(-1, 1),
  arousal: boundedNumber(0, 1),
  target_energy: boundedNumber(0, 100),
  lyric_tolerance: z.enum(["none", "low", "medium", "high"]),
  familiarity_bias: boundedNumber(0, 1),
  language_preferences: z.array(z.string()).max(5),
  transition: z.string().nullable(),
  hard_constraints: z.array(z.string()).max(6),
  safety_risk: z.enum(["none", "watch", "high"]),
  confidence: boundedNumber(0, 1),
  clarification: z.string().nullable(),
});

export type ModelInterpretation = z.infer<typeof modelInterpretationSchema>;
