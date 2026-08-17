import type { AccountMusicProfileSyncSnapshot, DirectPlayRequest, DraftTrack, DraftTrackResolution, PlaybackHandle, ProfileSummary, RecommendationBrief, StructuredContext, TrackCandidate, TrackLyrics, TrackTasteFeatures, UserProfile } from "@/src/domain";

export type CandidateQuery = {
  context: StructuredContext;
  profile: UserProfile;
  limit: number;
  brief?: RecommendationBrief;
};

export interface MusicProvider {
  readonly name: string;
  retrieveCandidates(query: CandidateQuery): Promise<TrackCandidate[]>;
  getProfileSummary?(profile: UserProfile): Promise<ProfileSummary>;
  syncAccountMusicProfile?(profile: UserProfile, options?: { getCachedTrackFeatures?: (provider: string, providerTrackIds: string[]) => Promise<TrackTasteFeatures[]> }): Promise<AccountMusicProfileSyncSnapshot>;
  searchDirectTrack?(input: { request: DirectPlayRequest; profile: UserProfile; limit?: number }): Promise<TrackCandidate[]>;
  searchAndMatchDraftTracks?(input: {
    drafts: DraftTrack[];
    brief: RecommendationBrief;
    context: StructuredContext;
    profile: UserProfile;
  }): Promise<DraftTrackResolution[]>;
  filterPlayable(trackIds: string[], connectionId?: string): Promise<string[]>;
  resolvePlayback(trackId: string, connectionId?: string): Promise<PlaybackHandle>;
  getLyrics?(trackId: string): Promise<TrackLyrics>;
}
