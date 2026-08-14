import type { StructuredContext } from "./context";
import type { UserProfile } from "./profile";
import type { TrackCandidate } from "./track";

export type DiscoveryMode = "familiar" | "balanced" | "explore";
export type RequestedDiscoveryMode = "auto" | DiscoveryMode;

export type DiscoveryIntent = {
  mode: DiscoveryMode;
  noveltyLevel: number;
  useAccountProfile: boolean;
  allowUserLibrary: boolean;
  allowAdjacentArtists: boolean;
  allowPlatformSearch: boolean;
  excludedSources: Array<"liked" | "playlist" | "history">;
  reason: string;
};

export type DraftTrack = {
  title: string;
  artist?: string;
  album?: string;
  versionHint: "studio" | "live" | "acoustic" | "remix" | "any";
  fitReason: string;
  riskNotes: string[];
};

export type SearchLane = {
  lane: "scene" | "mood" | "genre" | "artist_adjacent" | "playlist_style" | "fresh";
  query: string;
  weight: number;
  expectedRole: "top_pick" | "alternative" | "exploration";
};

export type RecommendationBrief = {
  discoveryIntent: DiscoveryIntent;
  profileBasis: {
    profileVersion: number | null;
    profileConfidence: number;
    matchedPreferenceClusters: string[];
    appliedSignals: string[];
    overriddenByCurrentRequest: string[];
  };
  desiredSound: {
    energyRange: [number, number];
    lyricDensity: "none" | "low" | "medium" | "high";
    genres: string[];
    moods: string[];
    instruments: string[];
    tempoWords: string[];
    languagePreferences: string[];
  };
  searchLanes: SearchLane[];
  avoid: {
    genres: string[];
    moods: string[];
    artists: string[];
    tracks: string[];
    reasons: string[];
  };
  draftTracks: DraftTrack[];
  explanationFocus: string[];
  provider: string;
};

export type RepresentativeTrack = {
  providerTrackId: string;
  title: string;
  artist: string;
  source: "liked" | "playlist" | "history";
};

export type ProfileSummary = {
  likedArtists: string[];
  likedGenres: string[];
  dislikedArtists: string[];
  dislikedGenres: string[];
  languages: string[];
  longTermTraits: string[];
  scenePreferenceTags: string[];
  familiarArtists: string[];
  accountGenres: string[];
  representativeTracks: RepresentativeTrack[];
  profileVersion: number | null;
  profileConfidence: number;
  sourceCoverage: { playlistCount: number; libraryTrackCount: number; analyzedTrackCount: number; lyricTrackCount: number; historyTrackCount: number } | null;
  preferredEnergy: { center: number; range: [number, number]; confidence: number } | null;
  preferredValence: { center: number; range: [number, number]; confidence: number } | null;
  lyricPreference: { instrumentalRatio: number; preferredDensity: "none" | "low" | "medium" | "high"; narrativeStrength: number } | null;
  lyricThemes: string[];
  preferenceClusters: Array<{ label: string; weight: number; genres: string[]; moods: string[]; energyCenter: number; lyricDensity: "none" | "low" | "medium" | "high"; signals: string[] }>;
};

export type RecommendationPlannerInput = {
  context: StructuredContext;
  profile: UserProfile;
  profileSummary: ProfileSummary;
  requestedMode: RequestedDiscoveryMode;
  draftCount: number;
};

export type DraftTrackFailureReason =
  | "not_found"
  | "search_mismatch"
  | "not_playable"
  | "duplicate"
  | "violates_constraints";

export type DraftTrackResolution = {
  draft: DraftTrack;
  status: "matched" | DraftTrackFailureReason;
  matchScore: number | null;
  track?: TrackCandidate;
};

export function createProfileSummary(profile: UserProfile): ProfileSummary {
  if (!profile.personalizationEnabled) {
    return {
      likedArtists: [], likedGenres: [], dislikedArtists: [], dislikedGenres: [], languages: [],
      longTermTraits: [], scenePreferenceTags: [], familiarArtists: [], accountGenres: [], representativeTracks: [],
      profileVersion: null, profileConfidence: 0, sourceCoverage: null, preferredEnergy: null, preferredValence: null,
      lyricPreference: null, lyricThemes: [], preferenceClusters: [],
    };
  }
  return {
    likedArtists: profile.explicit.likedArtists.slice(0, 20),
    likedGenres: profile.explicit.likedGenres.slice(0, 20),
    dislikedArtists: profile.explicit.dislikedArtists.slice(0, 20),
    dislikedGenres: profile.explicit.dislikedGenres.slice(0, 20),
    languages: profile.explicit.languages.slice(0, 10),
    longTermTraits: profile.longTermTraits.slice(0, 12),
    scenePreferenceTags: [...new Set(Object.values(profile.scenePreferences).flatMap((scene) => scene.preferredTags))].slice(0, 20),
    familiarArtists: profile.musicProfile?.artists.slice(0, 20).map((item) => item.value) ?? [],
    accountGenres: profile.musicProfile?.genres.slice(0, 20).map((item) => item.value) ?? [],
    representativeTracks: profile.musicProfile?.representativeTracks.slice(0, 30).map(({ providerTrackId, title, artist, source }) => ({ providerTrackId, title, artist, source })) ?? [],
    profileVersion: profile.musicProfile?.version ?? null,
    profileConfidence: profile.musicProfile?.confidence ?? 0,
    sourceCoverage: profile.musicProfile?.sourceCoverage ?? null,
    preferredEnergy: profile.musicProfile?.preferredEnergy ?? null,
    preferredValence: profile.musicProfile?.preferredValence ?? null,
    lyricPreference: profile.musicProfile?.lyricPreference ?? null,
    lyricThemes: profile.musicProfile?.lyricThemes.slice(0, 12).map((item) => item.value) ?? [],
    preferenceClusters: profile.musicProfile?.preferenceClusters.slice(0, 5).map(({ label, weight, genres, moods, energyCenter, lyricDensity, signals }) => ({ label, weight, genres, moods, energyCenter, lyricDensity, signals })) ?? [],
  };
}
