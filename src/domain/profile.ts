export type ExplicitPreferences = {
  likedArtists: string[];
  likedGenres: string[];
  dislikedArtists: string[];
  dislikedGenres: string[];
  languages: string[];
  familiarityBias: number;
};

export type ScenePreference = {
  targetEnergy: number;
  lyricTolerance: "none" | "low" | "medium" | "high";
  preferredTags: string[];
};

export type UserProfile = {
  userId: string;
  version: number;
  personalizationEnabled: boolean;
  explicit: ExplicitPreferences;
  longTermTraits: string[];
  scenePreferences: Record<string, ScenePreference>;
  negativeTrackIds: string[];
};

export const DEFAULT_EXPLICIT_PREFERENCES: ExplicitPreferences = {
  likedArtists: [],
  likedGenres: ["独立流行", "轻电子", "器乐"],
  dislikedArtists: [],
  dislikedGenres: [],
  languages: ["华语", "纯音乐"],
  familiarityBias: 0.68,
};

export function createDefaultProfile(userId: string): UserProfile {
  return {
    userId,
    version: 1,
    personalizationEnabled: true,
    explicit: DEFAULT_EXPLICIT_PREFERENCES,
    longTermTraits: ["克制", "温暖", "低干扰"],
    scenePreferences: {
      focus: { targetEnergy: 42, lyricTolerance: "low", preferredTags: ["稳定", "少歌词"] },
      emotional: { targetEnergy: 30, lyricTolerance: "medium", preferredTags: ["柔和", "不煽情"] },
      travel: { targetEnergy: 58, lyricTolerance: "medium", preferredTags: ["开阔", "有画面"] },
    },
    negativeTrackIds: [],
  };
}
