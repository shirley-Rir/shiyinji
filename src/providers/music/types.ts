import type { PlaybackHandle, StructuredContext, TrackCandidate, UserProfile } from "@/src/domain";

export type CandidateQuery = {
  context: StructuredContext;
  profile: UserProfile;
  limit: number;
};

export interface MusicProvider {
  readonly name: string;
  retrieveCandidates(query: CandidateQuery): Promise<TrackCandidate[]>;
  filterPlayable(trackIds: string[], connectionId?: string): Promise<string[]>;
  resolvePlayback(trackId: string, connectionId?: string): Promise<PlaybackHandle>;
}
