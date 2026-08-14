export type LibraryTrackSource = "liked" | "playlist" | "history";

export type WeightedMusicPreference = {
  value: string;
  weight: number;
  confidence: number;
  evidenceCount: number;
};

export type MusicProfileSourceCoverage = {
  playlistCount: number;
  libraryTrackCount: number;
  analyzedTrackCount: number;
  lyricTrackCount: number;
  historyTrackCount: number;
};

export type MusicPreferenceCluster = {
  id: string;
  label: string;
  weight: number;
  genres: string[];
  moods: string[];
  energyCenter: number;
  lyricDensity: "none" | "low" | "medium" | "high";
  signals: string[];
};

export type AccountMusicProfile = {
  userId: string;
  provider: string;
  version: number;
  analyzedAt: string;
  confidence: number;
  sourceCoverage: MusicProfileSourceCoverage;
  genres: WeightedMusicPreference[];
  languages: WeightedMusicPreference[];
  artists: WeightedMusicPreference[];
  lyricThemes: WeightedMusicPreference[];
  playlistThemes: WeightedMusicPreference[];
  preferredEnergy: { center: number; range: [number, number]; confidence: number };
  preferredValence: { center: number; range: [number, number]; confidence: number };
  lyricPreference: {
    instrumentalRatio: number;
    preferredDensity: "none" | "low" | "medium" | "high";
    narrativeStrength: number;
  };
  diversity: {
    artistDiversity: number;
    genreDiversity: number;
    noveltyTolerance: number;
  };
  preferenceClusters: MusicPreferenceCluster[];
  representativeTracks: Array<{
    providerTrackId: string;
    title: string;
    artist: string;
    source: LibraryTrackSource;
    weight: number;
  }>;
};

export type LibraryTrackEvidence = {
  provider: string;
  providerTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  sources: LibraryTrackSource[];
  playlistIds: string[];
  playlistContexts: string[];
  evidenceWeight: number;
};

export type TrackTasteFeatures = {
  provider: string;
  providerTrackId: string;
  genres: string[];
  languages: string[];
  energy: number;
  valence: number;
  lyricDensity: "none" | "low" | "medium" | "high";
  lyricThemes: string[];
  narrativeStrength: number;
  instruments: string[];
  playlistContexts: string[];
  provenance: Record<string, "metadata" | "playlist" | "lyrics" | "wiki" | "model" | "inferred">;
  confidence: number;
};

export type AccountMusicProfileSyncSnapshot = {
  profile: AccountMusicProfile;
  libraryTracks: LibraryTrackEvidence[];
  trackFeatures: TrackTasteFeatures[];
};
