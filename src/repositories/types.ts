import type { ContextInterpretation, RankedTrack, StructuredContext, TrackCandidate, UserProfile } from "@/src/domain";

export type AppUser = { id: string; email: string; displayName: string };

export type StoredContextSession = {
  id: string;
  userId: string;
  inputText: string;
  context: StructuredContext;
  confidence: number;
  clarification: string | null;
  createdAt: string;
};

export type StoredRecommendation = {
  id: string;
  contextSessionId: string;
  profileVersion: number;
  createdAt: string;
  tracks: RankedTrack[];
};

export interface ShiyinjiRepository {
  ensureUser(user: AppUser): Promise<UserProfile>;
  getProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, patch: Partial<Pick<UserProfile, "explicit" | "personalizationEnabled">>): Promise<UserProfile>;
  createContextSession(userId: string, inputText: string, imageMetadata: object | null, interpretation: ContextInterpretation): Promise<StoredContextSession>;
  getContextSession(userId: string, sessionId: string): Promise<StoredContextSession | null>;
  saveTracks(candidates: TrackCandidate[]): Promise<void>;
  createRecommendation(userId: string, contextSessionId: string, profileVersion: number, modelVersion: string, tracks: RankedTrack[]): Promise<StoredRecommendation>;
  getRecommendation(userId: string, recommendationId: string): Promise<StoredRecommendation | null>;
  listHistory(userId: string, limit: number): Promise<Array<{ context: StoredContextSession; recommendation: StoredRecommendation | null }>>;
  deleteHistory(userId: string, sessionId: string): Promise<boolean>;
  recordPlaybackEvent(input: { id: string; clientEventId: string; userId: string; recommendationId: string | null; trackId: string; eventType: string; positionMs: number; occurredAt: string }): Promise<void>;
  recordFeedback(input: { id: string; userId: string; recommendationId: string; trackId: string; type: string; scope: string; reason?: string | null; direction?: string | null }): Promise<string>;
  undoFeedback(userId: string, feedbackId: string): Promise<boolean>;
}
