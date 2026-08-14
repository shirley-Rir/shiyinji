import type { AccountMusicProfile, LibraryTrackEvidence, MusicPreferenceCluster, TrackTasteFeatures, WeightedMusicPreference } from "@/src/domain";

type BuildInput = {
  userId: string;
  provider: string;
  playlistCount: number;
  libraryTracks: LibraryTrackEvidence[];
  trackFeatures: TrackTasteFeatures[];
};

export function buildAccountMusicProfile(input: BuildInput): AccountMusicProfile {
  const evidenceById = new Map(input.libraryTracks.map((track) => [track.providerTrackId, track]));
  const analyzed = input.trackFeatures.flatMap((features) => {
    const evidence = evidenceById.get(features.providerTrackId);
    return evidence ? [{ evidence, features, weight: evidence.evidenceWeight * features.confidence }] : [];
  });
  const totalWeight = analyzed.reduce((sum, item) => sum + item.weight, 0) || 1;
  const energies = analyzed.map((item) => ({ value: item.features.energy, weight: item.weight }));
  const valences = analyzed.map((item) => ({ value: item.features.valence, weight: item.weight }));
  const energyCenter = weightedMean(energies, 50);
  const valenceCenter = weightedMean(valences, 0);
  const densityWeights = new Map<string, number>();
  for (const item of analyzed) densityWeights.set(item.features.lyricDensity, (densityWeights.get(item.features.lyricDensity) ?? 0) + item.weight);
  const preferredDensity = ([...densityWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "medium") as AccountMusicProfile["lyricPreference"]["preferredDensity"];
  const lyricTrackCount = analyzed.filter((item) => item.features.provenance.lyricDensity === "lyrics").length;
  const uniqueArtists = new Set(analyzed.map((item) => item.evidence.artist));
  const uniqueGenres = new Set(analyzed.flatMap((item) => item.features.genres));
  const profileConfidence = clamp(
    (Math.min(1, analyzed.length / Math.min(100, Math.max(20, input.libraryTracks.length))) * 0.6)
      + (analyzed.length ? lyricTrackCount / analyzed.length : 0) * 0.2
      + Math.min(1, input.playlistCount / 5) * 0.1
      + (analyzed.reduce((sum, item) => sum + item.features.confidence, 0) / Math.max(1, analyzed.length)) * 0.1,
  );

  return {
    userId: input.userId,
    provider: input.provider,
    version: 0,
    analyzedAt: new Date().toISOString(),
    confidence: round(profileConfidence),
    sourceCoverage: {
      playlistCount: input.playlistCount,
      libraryTrackCount: input.libraryTracks.filter((track) => track.sources.includes("liked") || track.sources.includes("playlist")).length,
      analyzedTrackCount: analyzed.length,
      lyricTrackCount,
      historyTrackCount: input.libraryTracks.filter((track) => track.sources.includes("history")).length,
    },
    genres: aggregatePreferences(analyzed.flatMap((item) => item.features.genres.map((value) => ({ value, weight: item.weight, confidence: item.features.confidence }))), 12),
    languages: aggregatePreferences(analyzed.flatMap((item) => item.features.languages.map((value) => ({ value, weight: item.weight, confidence: item.features.confidence }))), 8),
    artists: aggregatePreferences(analyzed.flatMap((item) => artistParts(item.evidence.artist).map((value) => ({ value, weight: item.weight, confidence: item.features.confidence }))), 20),
    lyricThemes: aggregatePreferences(analyzed.flatMap((item) => item.features.lyricThemes.map((value) => ({ value, weight: item.weight, confidence: item.features.confidence }))), 12),
    playlistThemes: aggregatePreferences(input.libraryTracks.flatMap((track) => track.playlistContexts.map((value) => ({ value, weight: track.evidenceWeight, confidence: 0.75 }))), 12),
    preferredEnergy: { center: Math.round(energyCenter), range: numericRange(energies, energyCenter, 0, 100), confidence: round(profileConfidence) },
    preferredValence: { center: round(valenceCenter), range: numericRange(valences, valenceCenter, -1, 1).map(round) as [number, number], confidence: round(profileConfidence) },
    lyricPreference: {
      instrumentalRatio: round(analyzed.filter((item) => item.features.lyricDensity === "none").reduce((sum, item) => sum + item.weight, 0) / totalWeight),
      preferredDensity,
      narrativeStrength: round(analyzed.reduce((sum, item) => sum + item.features.narrativeStrength * item.weight, 0) / totalWeight),
    },
    diversity: {
      artistDiversity: round(uniqueArtists.size / Math.max(1, analyzed.length)),
      genreDiversity: round(uniqueGenres.size / Math.max(1, analyzed.length)),
      noveltyTolerance: round(clamp(uniqueArtists.size / Math.max(1, analyzed.length) * 0.7 + uniqueGenres.size / Math.max(1, analyzed.length) * 0.3)),
    },
    preferenceClusters: buildClusters(analyzed),
    representativeTracks: [...input.libraryTracks]
      .sort((a, b) => b.evidenceWeight - a.evidenceWeight)
      .slice(0, 30)
      .map((track) => ({ providerTrackId: track.providerTrackId, title: track.title, artist: track.artist, source: primarySource(track.sources), weight: track.evidenceWeight })),
  };
}

function buildClusters(analyzed: Array<{ evidence: LibraryTrackEvidence; features: TrackTasteFeatures; weight: number }>): MusicPreferenceCluster[] {
  const groups = new Map<string, typeof analyzed>();
  for (const item of analyzed) {
    const text = item.evidence.playlistContexts.join(" ");
    const id = /学习|工作|专注|阅读|写作|代码|focus/i.test(text) ? "focus"
      : /旅行|公路|驾车|散步|城市|海边|travel/i.test(text) ? "travel"
        : /治愈|情绪|夜晚|孤独|放松|睡眠|陪伴/i.test(text) ? "emotional"
          : "everyday";
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  const total = analyzed.reduce((sum, item) => sum + item.weight, 0) || 1;
  return [...groups.entries()].map(([id, items]) => {
    const weight = items.reduce((sum, item) => sum + item.weight, 0);
    const genres = aggregatePreferences(items.flatMap((item) => item.features.genres.map((value) => ({ value, weight: item.weight, confidence: item.features.confidence }))), 4).map((item) => item.value);
    const density = mostWeighted(items.map((item) => ({ value: item.features.lyricDensity, weight: item.weight })), "medium") as MusicPreferenceCluster["lyricDensity"];
    const energyCenter = Math.round(weightedMean(items.map((item) => ({ value: item.features.energy, weight: item.weight })), 50));
    const valence = weightedMean(items.map((item) => ({ value: item.features.valence, weight: item.weight })), 0);
    return {
      id,
      label: { focus: "学习与工作", travel: "旅行与移动", emotional: "情绪与放松", everyday: "日常聆听" }[id] ?? id,
      weight: round(weight / total),
      genres,
      moods: [valence < -0.2 ? "内省" : valence > 0.35 ? "轻快" : "稳定", energyCenter < 35 ? "舒缓" : energyCenter > 65 ? "有活力" : "中等能量"],
      energyCenter,
      lyricDensity: density,
      signals: [...new Set(items.flatMap((item) => item.evidence.playlistContexts))].slice(0, 5),
    };
  }).sort((a, b) => b.weight - a.weight).slice(0, 5);
}

function aggregatePreferences(rows: Array<{ value: string; weight: number; confidence: number }>, limit: number): WeightedMusicPreference[] {
  const aggregate = new Map<string, { score: number; confidenceScore: number; count: number }>();
  for (const row of rows) {
    const value = row.value.trim();
    if (!value) continue;
    const current = aggregate.get(value) ?? { score: 0, confidenceScore: 0, count: 0 };
    current.score += row.weight;
    current.confidenceScore += row.confidence * row.weight;
    current.count += 1;
    aggregate.set(value, current);
  }
  const maxScore = Math.max(1, ...[...aggregate.values()].map((item) => item.score));
  return [...aggregate.entries()]
    .map(([value, item]) => ({ value, weight: round(item.score / maxScore), confidence: round(item.confidenceScore / Math.max(item.score, 0.001)), evidenceCount: item.count }))
    .sort((a, b) => b.weight - a.weight || b.evidenceCount - a.evidenceCount)
    .slice(0, limit);
}

function weightedMean(rows: Array<{ value: number; weight: number }>, fallback: number) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  return total ? rows.reduce((sum, row) => sum + row.value * row.weight, 0) / total : fallback;
}

function numericRange(rows: Array<{ value: number; weight: number }>, center: number, min: number, max: number): [number, number] {
  const total = rows.reduce((sum, row) => sum + row.weight, 0) || 1;
  const deviation = Math.sqrt(rows.reduce((sum, row) => sum + ((row.value - center) ** 2) * row.weight, 0) / total);
  return [Math.max(min, Math.round((center - deviation) * 100) / 100), Math.min(max, Math.round((center + deviation) * 100) / 100)];
}

function mostWeighted<T extends string>(rows: Array<{ value: T; weight: number }>, fallback: T) {
  const totals = new Map<T, number>();
  for (const row of rows) totals.set(row.value, (totals.get(row.value) ?? 0) + row.weight);
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

function primarySource(sources: LibraryTrackEvidence["sources"]): "liked" | "playlist" | "history" {
  if (sources.includes("liked")) return "liked";
  if (sources.includes("playlist")) return "playlist";
  return "history";
}

function artistParts(value: string) {
  return value.split(/\s*[/、,&，]\s*/).filter(Boolean);
}

function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function round(value: number) { return Number(value.toFixed(3)); }
