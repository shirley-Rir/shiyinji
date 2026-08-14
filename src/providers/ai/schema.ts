import { z } from "zod";

const boundedNumber = (min: number, max: number) => z.number().min(min).max(max);

export const modelInterpretationSchema = z.object({
  current_mood: z.array(z.string()).min(1).max(4),
  target_mood: z.array(z.string()).min(1).max(4),
  activity: z.string().nullable(),
  environment: z.array(z.string()).max(5),
  social_state: z.enum(["alone", "with_others", "unknown"]),
  valence: boundedNumber(-1, 1),
  arousal: boundedNumber(0, 1),
  target_energy: boundedNumber(0, 100),
  lyric_tolerance: z.enum(["none", "low", "medium", "high"]),
  familiarity_bias: boundedNumber(0, 1),
  language_preferences: z.array(z.string()).max(5),
  transition: z.string().nullable(),
  hard_constraints: z.array(z.string()).max(6),
  safety_risk: z.enum(["none", "watch", "high"]),
  confidence: boundedNumber(0, 1),
  clarification: z.string().nullable(),
});

export type ModelInterpretation = z.infer<typeof modelInterpretationSchema>;

const shortStrings = (max: number) => z.array(z.string().min(1).max(80)).max(max);

export const modelRecommendationBriefSchema = z.object({
  discovery_intent: z.object({
    mode: z.enum(["familiar", "balanced", "explore"]),
    novelty_level: boundedNumber(0, 1),
    allow_user_library: z.boolean(),
    allow_adjacent_artists: z.boolean(),
    allow_platform_search: z.boolean(),
    excluded_sources: z.array(z.enum(["liked", "playlist", "history"])).max(3),
    reason: z.string().min(1).max(120),
  }),
  desired_sound: z.object({
    energy_range: z.tuple([boundedNumber(0, 100), boundedNumber(0, 100)]),
    lyric_density: z.enum(["none", "low", "medium", "high"]),
    genres: shortStrings(8),
    moods: shortStrings(8),
    instruments: shortStrings(8),
    tempo_words: shortStrings(6),
    language_preferences: shortStrings(6),
  }),
  search_lanes: z.array(z.object({
    lane: z.enum(["scene", "mood", "genre", "artist_adjacent", "playlist_style", "fresh"]),
    query: z.string().min(1).max(80),
    weight: boundedNumber(0, 1),
    expected_role: z.enum(["top_pick", "alternative", "exploration"]),
  })).min(2).max(8),
  avoid: z.object({
    genres: shortStrings(20),
    moods: shortStrings(20),
    artists: shortStrings(30),
    tracks: shortStrings(30),
    reasons: shortStrings(12),
  }),
  draft_tracks: z.array(z.object({
    title: z.string().min(1).max(120),
    artist: z.string().min(1).max(120).optional(),
    album: z.string().min(1).max(120).optional(),
    version_hint: z.enum(["studio", "live", "acoustic", "remix", "any"]),
    fit_reason: z.string().min(1).max(100),
    risk_notes: shortStrings(5),
  })).min(5).max(20),
  explanation_focus: shortStrings(8),
});

export type ModelRecommendationBrief = z.infer<typeof modelRecommendationBriefSchema>;
