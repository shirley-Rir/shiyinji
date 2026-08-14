export type TrackFeatures = {
  genres: string[];
  languages: string[];
  moods: string[];
  activities: string[];
  environments: string[];
  energy: number;
  valence: number;
  lyricDensity: "none" | "low" | "medium" | "high";
  familiarity: number;
  provenance?: {
    genres: "wiki" | "search" | "inferred";
    lyricDensity: "lyrics" | "instrumental-signal" | "inferred";
    energy: "wiki-bpm" | "genre-heuristic";
    familiarity: "account-history" | "anonymous";
    confidence: number;
  };
};

export type TrackCandidate = {
  id: string;
  provider: string;
  providerTrackId: string;
  title: string;
  artist: string;
  durationMs: number;
  coverVariant: string;
  tags: string[];
  features: TrackFeatures;
};

export type PlaybackHandle = {
  id: string;
  trackId: string;
  url: string;
  mimeType: string;
  expiresAt: string;
};
