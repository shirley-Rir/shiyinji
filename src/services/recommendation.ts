import type { MusicProvider } from "@/src/providers";
import type { RankedTrack, RecommendationPlan, ScoreBreakdown, StructuredContext, TrackCandidate, UserProfile } from "@/src/domain";

export class RecommendationService {
  readonly modelVersion = "weighted-ranker-v1";

  constructor(private readonly musicProvider: MusicProvider) {}

  async recommend(context: StructuredContext, profile: UserProfile, count = 5): Promise<RecommendationPlan> {
    const candidates = await this.musicProvider.retrieveCandidates({ context, profile, limit: 100 });
    const playableIds = new Set(await this.musicProvider.filterPlayable(candidates.map((track) => track.id)));
    const filtered = candidates.filter((track) => playableIds.has(track.id) && !profile.negativeTrackIds.includes(track.id) && !violatesHardConstraints(track, context));

    const ranked = filtered
      .map((track) => scoreTrack(track, context, profile))
      .sort((a, b) => b.score - a.score);

    const diversified = diversify(ranked).slice(0, count).map((track, index) => ({
      ...track,
      position: index + 1,
      role: index === 0 ? "top_pick" as const : "alternative" as const,
    }));

    return { tracks: diversified, modelVersion: this.modelVersion };
  }
}

function scoreTrack(track: TrackCandidate, context: StructuredContext, profile: UserProfile): Omit<RankedTrack, "position" | "role"> {
  const featureWords = [...track.features.moods, ...track.features.activities, ...track.features.environments, ...track.tags];
  const contextWords = [...context.currentMood, ...context.targetMood, ...context.environment, context.activity ?? ""];
  const semanticOverlap = overlap(contextWords, featureWords);
  const energyFit = 1 - Math.min(1, Math.abs(track.features.energy - context.targetEnergy) / 70);
  const valenceFit = 1 - Math.min(1, Math.abs(track.features.valence - context.valence) / 2);
  const contextMatch = clamp(semanticOverlap * 0.5 + energyFit * 0.35 + valenceFit * 0.15);
  const explicitPreference = clamp(overlap(profile.explicit.likedGenres, track.features.genres) * 0.65 + overlap(profile.explicit.languages, track.features.languages) * 0.35);
  const scene = sceneKey(context);
  const scenePreference = profile.scenePreferences[scene];
  const sceneProfileMatch = scenePreference
    ? clamp((1 - Math.abs(scenePreference.targetEnergy - track.features.energy) / 100) * 0.65 + overlap(scenePreference.preferredTags, featureWords) * 0.35)
    : 0.5;
  const longTermAffinity = clamp(overlap(profile.longTermTraits, featureWords) * 0.7 + 0.3);
  const familiarityFit = clamp(1 - Math.abs(track.features.familiarity - context.familiarityBias));
  const transitionFit = clamp(energyFit * 0.7 + valenceFit * 0.3);
  const explorationValue = clamp(1 - track.features.familiarity);
  const negativeFeedbackPenalty = profile.explicit.dislikedGenres.some((genre) => track.features.genres.includes(genre)) ? 1 : 0;

  const scoreBreakdown: ScoreBreakdown = {
    contextMatch,
    explicitPreference,
    sceneProfileMatch,
    longTermAffinity,
    familiarityFit,
    transitionFit,
    explorationValue,
    repetitionPenalty: 0,
    negativeFeedbackPenalty,
  };

  const score =
    contextMatch * 0.35 +
    explicitPreference * 0.2 +
    sceneProfileMatch * 0.15 +
    longTermAffinity * 0.1 +
    familiarityFit * 0.08 +
    transitionFit * 0.07 +
    explorationValue * 0.05 -
    negativeFeedbackPenalty;

  return {
    ...track,
    score: Number(score.toFixed(4)),
    reason: recommendationReason(track, context, contextMatch, familiarityFit),
    scoreBreakdown,
  };
}

function violatesHardConstraints(track: TrackCandidate, context: StructuredContext) {
  if (context.lyricTolerance === "none" && track.features.lyricDensity !== "none") return true;
  if (context.hardConstraints.includes("不要太伤感") && track.features.valence < -0.2) return true;
  return false;
}

function diversify(ranked: Array<Omit<RankedTrack, "position" | "role">>) {
  const result: typeof ranked = [];
  const pending = [...ranked];
  while (pending.length) {
    const usedArtists = new Set(result.slice(-2).map((track) => track.artist));
    const index = pending.findIndex((track) => !usedArtists.has(track.artist));
    result.push(pending.splice(index >= 0 ? index : 0, 1)[0]);
  }
  return result;
}

function recommendationReason(track: TrackCandidate, context: StructuredContext, contextMatch: number, familiarityFit: number) {
  const direction = context.targetMood[0] ?? "自然过渡";
  if (contextMatch > 0.72) return `${track.tags[0]}的质感贴近此刻，并慢慢走向${direction}`;
  if (familiarityFit > 0.75) return `保留合适的熟悉感，同时把能量控制在当前需要的范围`;
  return `在${track.tags[0]}方向上提供一个不过分打扰的备选`;
}

function sceneKey(context: StructuredContext) {
  if (context.activity?.includes("工作") || context.activity?.includes("学习")) return "focus";
  if (context.activity?.includes("旅行") || context.environment.includes("在路上")) return "travel";
  return "emotional";
}

function overlap(left: string[], right: string[]) {
  const a = new Set(left.filter(Boolean));
  const b = new Set(right.filter(Boolean));
  if (!a.size || !b.size) return 0;
  let matches = 0;
  for (const value of a) if (b.has(value)) matches += 1;
  return matches / Math.max(1, Math.min(a.size, b.size));
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
