export type ContextSource = "text" | "image" | "text_image";
export type SocialState = "alone" | "with_others" | "unknown";
export type LyricTolerance = "none" | "low" | "medium" | "high";
export type SafetyRisk = "none" | "watch" | "high";
export type MusicRequestIntent = "recommendation" | "direct_play";
export type DirectPlayRequest = {
  title: string;
  artist: string | null;
  versionHint: "studio" | "live" | "acoustic" | "remix" | "any";
};

export type ContextInput = {
  text: string;
  image?: {
    name: string;
    type: string;
    size: number;
    dataUrl?: string;
  };
  timezone?: string;
};

export type StructuredContext = {
  source: ContextSource;
  requestIntent: MusicRequestIntent;
  directPlay: DirectPlayRequest | null;
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
