import { z } from "zod";

export const recommendationRequest = z.object({
  context_session_id: z.string().min(5),
  mode: z.enum(["autoplay", "manual"]).default("autoplay"),
  discovery_mode: z.enum(["auto", "familiar", "balanced", "explore"]).default("auto"),
  count: z.number().int().min(1).max(10).default(5),
});

export const playbackResolveRequest = z.object({
  track_id: z.string().min(3),
  recommendation_id: z.string().min(5),
});

export const playbackEventRequest = z.object({
  event_id: z.string().min(5),
  recommendation_id: z.string().nullable().optional(),
  track_id: z.string().min(3),
  event_type: z.enum(["started", "paused", "resumed", "seeked", "skipped", "completed", "failed"]),
  position_ms: z.number().int().min(0).default(0),
  occurred_at: z.string().datetime(),
});

export const feedbackRequest = z.object({
  recommendation_id: z.string().min(5),
  track_id: z.string().min(3),
  type: z.enum(["like", "dislike", "more_like_this", "direction"]),
  scope: z.enum(["current_context", "scene_profile", "long_term"]),
  reason: z.string().max(100).nullable().optional(),
  direction: z.enum(["quieter", "more_energy", "more_familiar", "more_fresh"]).nullable().optional(),
});

export const profilePatchRequest = z.object({
  explicit: z.object({
    likedArtists: z.array(z.string()).max(100),
    likedGenres: z.array(z.string()).max(50),
    dislikedArtists: z.array(z.string()).max(100),
    dislikedGenres: z.array(z.string()).max(50),
    languages: z.array(z.string()).max(20),
    familiarityBias: z.number().min(0).max(1),
  }).optional(),
  personalization_enabled: z.boolean().optional(),
});
