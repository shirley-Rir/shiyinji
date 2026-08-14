import type { MusicProvider, RecommendationPlanner } from "@/src/providers";
import { createProfileSummary, type RankedTrack, type RecommendationBrief, type RecommendationPlan, type RequestedDiscoveryMode, type ScoreBreakdown, type StructuredContext, type TrackCandidate, type UserProfile } from "@/src/domain";

export class RecommendationService {
  readonly modelVersion = "weighted-ranker-v2";

  constructor(private readonly musicProvider: MusicProvider, private readonly planner?: RecommendationPlanner) {}

  async recommend(context: StructuredContext, profile: UserProfile, count = 5, options: { discoveryMode?: RequestedDiscoveryMode } = {}): Promise<RecommendationPlan> {
    if (context.requestIntent === "direct_play" && context.directPlay) return this.directPlay(context.directPlay, profile);
    const planning = await this.createBrief(context, profile, options.discoveryMode ?? "auto", count);
    const brief = planning.brief;
    const resolutions = brief && this.musicProvider.searchAndMatchDraftTracks
      ? await this.musicProvider.searchAndMatchDraftTracks({ drafts: brief.draftTracks, brief, context, profile })
      : [];
    const draftCandidates = resolutions.flatMap((resolution) => resolution.track ? [resolution.track] : []);
    const fallbackTarget = Math.max(count * 3, 12);
    const fallbackCandidates = draftCandidates.length < fallbackTarget
      ? await this.retrieveFallbackCandidates(context, profile, brief, Math.max(count * 2, fallbackTarget - draftCandidates.length), draftCandidates.length > 0)
      : [];
    const candidates = uniqueTracks([
      ...draftCandidates,
      ...fallbackCandidates.map((track) => track.retrieval ? track : { ...track, retrieval: { source: "search_fallback" as const, fitReason: "情境搜索补充候选" } }),
    ]);
    const playableIds = new Set(await this.musicProvider.filterPlayable(candidates.map((track) => track.id), profile.userId));
    const filtered = candidates.filter((track) => playableIds.has(track.id)
      && !profile.negativeTrackIds.includes(track.id)
      && !violatesHardConstraints(track, context)
      && !violatesDiscoveryIntent(track, brief));

    const ranked = filtered
      .map((track) => scoreTrack(track, context, profile, brief))
      .sort((a, b) => b.score - a.score);

    const diversified = diversify(ranked).slice(0, count).map((track, index) => ({
      ...track,
      position: index + 1,
      role: index === 0 ? "top_pick" as const : "alternative" as const,
    }));

    const failureCounts = resolutions.reduce<NonNullable<RecommendationPlan["diagnostics"]>["failureCounts"]>((counts, resolution) => {
      if (resolution.status !== "matched") counts[resolution.status] = (counts[resolution.status] ?? 0) + 1;
      return counts;
    }, {});
    return {
      tracks: diversified,
      modelVersion: brief ? `draft-search-v1+${this.modelVersion}` : this.modelVersion,
      brief,
      diagnostics: {
        draftCount: brief?.draftTracks.length ?? 0,
        matchedDraftCount: draftCandidates.length,
        fallbackCandidateCount: fallbackCandidates.length,
        plannerFallbackReason: planning.fallbackReason,
        failureCounts,
        resolutions: resolutions.map((resolution) => ({ title: resolution.draft.title, artist: resolution.draft.artist, status: resolution.status, matchScore: resolution.matchScore })),
      },
    };
  }

  private async directPlay(request: NonNullable<StructuredContext["directPlay"]>, profile: UserProfile): Promise<RecommendationPlan> {
    if (!this.musicProvider.searchDirectTrack) return emptyDirectPlan();
    const candidates = await this.musicProvider.searchDirectTrack({ request, profile, limit: 3 });
    const playableIds = new Set(await this.musicProvider.filterPlayable(candidates.map((track) => track.id), profile.userId));
    const track = candidates.find((candidate) => playableIds.has(candidate.id));
    if (!track) return emptyDirectPlan();
    const scoreBreakdown: ScoreBreakdown = {
      contextMatch: 1,
      explicitPreference: 0,
      sceneProfileMatch: 0,
      longTermAffinity: 0,
      familiarityFit: 0,
      transitionFit: 0,
      explorationValue: 0,
      repetitionPenalty: 0,
      negativeFeedbackPenalty: 0,
    };
    return {
      tracks: [{ ...track, position: 1, role: "top_pick", score: track.retrieval?.matchScore ?? 1, reason: `按你的点歌请求播放《${track.title}》`, scoreBreakdown }],
      modelVersion: "direct-search-v1",
      diagnostics: { draftCount: 0, matchedDraftCount: 1, fallbackCandidateCount: 0, failureCounts: {}, resolutions: [] },
    };
  }

  private async createBrief(context: StructuredContext, profile: UserProfile, requestedMode: RequestedDiscoveryMode, count: number) {
    if (!this.planner || !this.musicProvider.searchAndMatchDraftTracks) return {};
    try {
      const profileSummary = this.musicProvider.getProfileSummary
        ? await this.musicProvider.getProfileSummary(profile)
        : createProfileSummary(profile);
      const brief = await this.planner.planRecommendation({ context, profile, profileSummary, requestedMode, draftCount: Math.min(20, Math.max(10, count * 2)) });
      return { brief };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code.includes("INVALID_RECOMMENDATION_BRIEF")) return { fallbackReason: "invalid_response" as const };
      if (code.startsWith("AI_")) return { fallbackReason: "unavailable" as const };
      return { fallbackReason: "profile_unavailable" as const };
    }
  }

  private async retrieveFallbackCandidates(context: StructuredContext, profile: UserProfile, brief: RecommendationBrief | undefined, limit: number, optional: boolean) {
    try {
      return await this.musicProvider.retrieveCandidates({ context, profile, brief, limit });
    } catch (error) {
      if (optional) return [];
      if (brief) return this.musicProvider.retrieveCandidates({ context, profile, limit });
      throw error;
    }
  }
}

function emptyDirectPlan(): RecommendationPlan {
  return { tracks: [], modelVersion: "direct-search-v1", diagnostics: { draftCount: 0, matchedDraftCount: 0, fallbackCandidateCount: 0, failureCounts: {}, resolutions: [] } };
}

function scoreTrack(track: TrackCandidate, context: StructuredContext, profile: UserProfile, brief?: RecommendationBrief): Omit<RankedTrack, "position" | "role"> {
  const featureWords = [...track.features.moods, ...track.features.activities, ...track.features.environments, ...track.tags];
  const contextWords = [...context.currentMood, ...context.targetMood, ...context.environment, context.activity ?? ""];
  const semanticOverlap = overlap(contextWords, featureWords);
  const energyFit = 1 - Math.min(1, Math.abs(track.features.energy - context.targetEnergy) / 70);
  const valenceFit = 1 - Math.min(1, Math.abs(track.features.valence - context.valence) / 2);
  const draftConfidence = track.retrieval?.source === "draft" ? track.retrieval.matchScore ?? 0.7 : 0;
  const contextMatch = clamp(semanticOverlap * 0.45 + energyFit * 0.32 + valenceFit * 0.13 + draftConfidence * 0.1);
  const musicProfile = profile.musicProfile;
  const preferredArtists = [...profile.explicit.likedArtists, ...(musicProfile?.artists.slice(0, 20).map((item) => item.value) ?? [])];
  const preferredGenres = [...profile.explicit.likedGenres, ...(musicProfile?.genres.slice(0, 15).map((item) => item.value) ?? [])];
  const preferredLanguages = [...profile.explicit.languages, ...(musicProfile?.languages.slice(0, 8).map((item) => item.value) ?? [])];
  const artistPreference = profile.personalizationEnabled && preferredArtists.some((artist) => track.artist.includes(artist)) ? 1 : 0;
  const profileEnergyFit = musicProfile ? 1 - Math.min(1, Math.abs(musicProfile.preferredEnergy.center - track.features.energy) / 70) : 0.5;
  const profileLyricFit = musicProfile ? lyricDensityFit(musicProfile.lyricPreference.preferredDensity, track.features.lyricDensity) : 0.5;
  const explicitPreference = profile.personalizationEnabled
    ? clamp(overlap(preferredGenres, track.features.genres) * 0.3 + overlap(preferredLanguages, track.features.languages) * 0.15 + artistPreference * 0.25 + profileEnergyFit * 0.15 + profileLyricFit * 0.15)
    : 0;
  const scene = sceneKey(context);
  const scenePreference = profile.scenePreferences[scene];
  const sceneProfileMatch = profile.personalizationEnabled && scenePreference
    ? clamp((1 - Math.abs(scenePreference.targetEnergy - track.features.energy) / 100) * 0.65 + overlap(scenePreference.preferredTags, featureWords) * 0.35)
    : 0.5;
  const longTermAffinity = profile.personalizationEnabled ? clamp(overlap(profile.longTermTraits, featureWords) * 0.7 + 0.3) : 0;
  const familiarityTarget = brief?.discoveryIntent.mode === "familiar" ? 0.85 : brief?.discoveryIntent.mode === "explore" ? 0.1 : context.familiarityBias;
  const familiarityFit = clamp(1 - Math.abs(track.features.familiarity - familiarityTarget));
  const transitionFit = clamp(energyFit * 0.7 + valenceFit * 0.3);
  const explorationValue = clamp(1 - track.features.familiarity);
  const negativeFeedbackPenalty = profile.personalizationEnabled && profile.explicit.dislikedGenres.some((genre) => track.features.genres.includes(genre)) ? 1 : 0;

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

  const explorationWeight = brief?.discoveryIntent.mode === "explore" ? 0.11 : 0.04;
  const familiarityWeight = brief?.discoveryIntent.mode === "explore" ? 0.08 : brief?.discoveryIntent.mode === "familiar" ? 0.18 : 0.15;
  const score =
    contextMatch * 0.34 +
    explicitPreference * 0.17 +
    sceneProfileMatch * 0.14 +
    longTermAffinity * 0.08 +
    familiarityFit * familiarityWeight +
    transitionFit * 0.08 +
    explorationValue * explorationWeight -
    negativeFeedbackPenalty;

  return {
    ...track,
    score: Number(clamp(score).toFixed(4)),
    reason: recommendationReason(track, context, contextMatch, familiarityFit, explicitPreference),
    scoreBreakdown,
  };
}

function violatesHardConstraints(track: TrackCandidate, context: StructuredContext) {
  if (context.lyricTolerance === "none" && track.features.lyricDensity !== "none") return true;
  if (context.hardConstraints.includes("不要太伤感") && track.features.valence < -0.2) return true;
  return false;
}

function violatesDiscoveryIntent(track: TrackCandidate, brief?: RecommendationBrief) {
  if (!brief?.discoveryIntent.allowUserLibrary && (track.retrieval?.source === "user_library" || track.features.familiarity >= 0.95)) return true;
  if (brief?.avoid.artists.some((artist) => normalize(artist) === normalize(track.artist))) return true;
  if (brief?.avoid.tracks.some((title) => normalize(title) === normalize(track.title))) return true;
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

function recommendationReason(track: TrackCandidate, context: StructuredContext, contextMatch: number, familiarityFit: number, profileAffinity: number) {
  if (track.retrieval?.source === "draft" && track.retrieval.fitReason) return track.retrieval.fitReason;
  const direction = context.targetMood[0] ?? "自然过渡";
  if (profileAffinity > 0.72) return `延续账号画像里的声音偏好，同时贴合此刻的${direction}`;
  if (track.features.familiarity > 0.75 && context.familiarityBias > 0.55) return `来自账号里的熟悉声音，同时把能量控制在此刻需要的范围`;
  if (contextMatch > 0.72) return `${track.tags[0]}的质感贴近此刻，并慢慢走向${direction}`;
  if (familiarityFit > 0.75) return `保留合适的熟悉感，同时把能量控制在当前需要的范围`;
  return `在${track.tags[0]}方向上提供一个不过分打扰的备选`;
}

function lyricDensityFit(preferred: TrackCandidate["features"]["lyricDensity"], actual: TrackCandidate["features"]["lyricDensity"]) {
  const order = { none: 0, low: 1, medium: 2, high: 3 };
  return 1 - Math.abs(order[preferred] - order[actual]) / 3;
}

function uniqueTracks(tracks: TrackCandidate[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
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
