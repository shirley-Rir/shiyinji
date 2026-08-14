import type { RankedTrack, StructuredContext, UserProfile } from "@/src/domain";
import type { StoredRecommendation } from "@/src/repositories/types";

export function presentContext(context: StructuredContext) {
  return {
    source: context.source,
    current_mood: context.currentMood,
    target_mood: context.targetMood,
    activity: context.activity,
    environment: context.environment,
    social_state: context.socialState,
    valence: context.valence,
    arousal: context.arousal,
    target_energy: context.targetEnergy,
    lyric_tolerance: context.lyricTolerance,
    familiarity_bias: context.familiarityBias,
    language_preferences: context.languagePreferences,
    transition: context.transition,
    hard_constraints: context.hardConstraints,
    safety_risk: context.safetyRisk,
    confidence: context.confidence,
  };
}

export function presentProfile(profile: UserProfile) {
  return {
    user_id: profile.userId,
    version: profile.version,
    personalization_enabled: profile.personalizationEnabled,
    explicit: profile.explicit,
    long_term_traits: profile.longTermTraits,
    scene_preferences: profile.scenePreferences,
    negative_track_ids: profile.negativeTrackIds,
  };
}

export function presentRecommendation(recommendation: StoredRecommendation) {
  return {
    recommendation_id: recommendation.id,
    context_session_id: recommendation.contextSessionId,
    profile_version: recommendation.profileVersion,
    generated_at: recommendation.createdAt,
    tracks: recommendation.tracks.map(presentTrack),
  };
}

export function presentTrack(track: RankedTrack) {
  return {
    track_id: track.id,
    provider: track.provider,
    provider_track_id: track.providerTrackId,
    position: track.position,
    role: track.role,
    title: track.title,
    artist: track.artist,
    cover_variant: track.coverVariant,
    duration_ms: track.durationMs,
    reason: track.reason,
    tags: track.tags,
    score: track.score,
    features: {
      genres: track.features.genres,
      lyric_density: track.features.lyricDensity,
      energy: track.features.energy,
      familiarity: track.features.familiarity,
      provenance: track.features.provenance ?? null,
    },
    playable: true,
  };
}
