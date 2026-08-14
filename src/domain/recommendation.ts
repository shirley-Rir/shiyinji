import type { DraftTrackFailureReason, RecommendationBrief } from "./discovery";
import type { TrackCandidate } from "./track";

export type ScoreBreakdown = {
  contextMatch: number;
  explicitPreference: number;
  sceneProfileMatch: number;
  longTermAffinity: number;
  familiarityFit: number;
  transitionFit: number;
  explorationValue: number;
  repetitionPenalty: number;
  negativeFeedbackPenalty: number;
};

export type RankedTrack = TrackCandidate & {
  position: number;
  role: "top_pick" | "alternative";
  score: number;
  reason: string;
  scoreBreakdown: ScoreBreakdown;
};

export type RecommendationPlan = {
  tracks: RankedTrack[];
  modelVersion: string;
  brief?: RecommendationBrief;
  diagnostics?: {
    draftCount: number;
    matchedDraftCount: number;
    fallbackCandidateCount: number;
    plannerFallbackReason?: "unavailable" | "invalid_response" | "profile_unavailable";
    failureCounts: Partial<Record<DraftTrackFailureReason, number>>;
    resolutions: Array<{ title: string; artist?: string; status: "matched" | DraftTrackFailureReason; matchScore: number | null }>;
  };
};
