import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProfile, createProfileSummary, type LibraryTrackEvidence, type TrackTasteFeatures } from "../../src/domain";
import { buildAccountMusicProfile } from "../../src/services/music-profile-builder";

const libraryTracks: LibraryTrackEvidence[] = [
  { provider: "test", providerTrackId: "1", title: "纸页", artist: "A", album: null, durationMs: 180000, sources: ["liked", "playlist"], playlistIds: ["focus"], playlistContexts: ["学习专注"], evidenceWeight: 1 },
  { provider: "test", providerTrackId: "2", title: "代码", artist: "B", album: null, durationMs: 200000, sources: ["playlist"], playlistIds: ["focus"], playlistContexts: ["工作轻音乐"], evidenceWeight: 0.75 },
  { provider: "test", providerTrackId: "3", title: "远方", artist: "C", album: null, durationMs: 210000, sources: ["liked", "history"], playlistIds: ["travel"], playlistContexts: ["旅行公路"], evidenceWeight: 1 },
  { provider: "test", providerTrackId: "4", title: "海边", artist: "D", album: null, durationMs: 220000, sources: ["playlist"], playlistIds: ["travel"], playlistContexts: ["旅行与海边"], evidenceWeight: 0.75 },
];

const trackFeatures: TrackTasteFeatures[] = [
  feature("1", ["器乐", "轻电子"], 38, "none", [], ["纯音乐"]),
  feature("2", ["轻电子"], 45, "low", ["城市与生活"], ["华语"]),
  feature("3", ["独立流行"], 62, "medium", ["旅行与远方"], ["华语"]),
  feature("4", ["民谣"], 55, "medium", ["自然与季节"], ["华语"]),
];

test("music profile aggregates weighted preferences and keeps scene clusters", () => {
  const profile = buildAccountMusicProfile({ userId: "user", provider: "test", playlistCount: 2, libraryTracks, trackFeatures });

  assert.equal(profile.sourceCoverage.libraryTrackCount, 4);
  assert.equal(profile.sourceCoverage.analyzedTrackCount, 4);
  assert.ok(profile.genres.some((item) => item.value === "轻电子"));
  assert.ok(profile.lyricThemes.some((item) => item.value === "旅行与远方"));
  assert.ok(profile.preferenceClusters.some((cluster) => cluster.id === "focus" && cluster.energyCenter < 50));
  assert.ok(profile.preferenceClusters.some((cluster) => cluster.id === "travel" && cluster.energyCenter > 50));
  assert.ok(profile.preferredEnergy.center >= 45 && profile.preferredEnergy.center <= 55);
});

test("compressed planner profile carries the persisted version and clusters", () => {
  const accountProfile = { ...buildAccountMusicProfile({ userId: "user", provider: "test", playlistCount: 2, libraryTracks, trackFeatures }), version: 3 };
  const userProfile = createDefaultProfile("user");
  userProfile.musicProfile = accountProfile;
  const summary = createProfileSummary(userProfile);

  assert.equal(summary.profileVersion, 3);
  assert.ok(summary.profileConfidence > 0);
  assert.ok(summary.accountGenres.length > 0);
  assert.ok(summary.preferenceClusters.some((cluster) => cluster.label === "学习与工作"));
  assert.equal("userId" in summary, false);
});

function feature(providerTrackId: string, genres: string[], energy: number, lyricDensity: TrackTasteFeatures["lyricDensity"], lyricThemes: string[], languages: string[]): TrackTasteFeatures {
  return {
    provider: "test", providerTrackId, genres, languages, energy, valence: 0.15, lyricDensity, lyricThemes,
    narrativeStrength: lyricDensity === "none" ? 0 : 0.5, instruments: lyricDensity === "none" ? ["钢琴"] : [], playlistContexts: [],
    provenance: { genres: "metadata", languages: "lyrics", energy: "inferred", lyricDensity: "lyrics", lyricThemes: "lyrics", instruments: "inferred" },
    confidence: 0.85,
  };
}
