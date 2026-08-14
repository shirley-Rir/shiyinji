export type ContextSource = "text" | "image" | "text_image";
export type SocialState = "alone" | "with_others" | "unknown";
export type LyricTolerance = "none" | "low" | "medium" | "high";
export type SafetyRisk = "none" | "watch" | "high";

export type ContextInput = {
  text: string;
  image?: {
    name: string;
    type: string;
    size: number;
  };
  timezone?: string;
};

export type StructuredContext = {
  source: ContextSource;
  currentMood: string[];
  targetMood: string[];
  activity: string | null;
  environment: string[];
  socialState: SocialState;
  valence: number;
  arousal: number;
  targetEnergy: number;
  lyricTolerance: LyricTolerance;
  familiarityBias: number;
  languagePreferences: string[];
  transition: string | null;
  hardConstraints: string[];
  safetyRisk: SafetyRisk;
  confidence: number;
};

export type ContextInterpretation = {
  context: StructuredContext;
  clarification: string | null;
  provider: string;
};
