import { createProfileSummary, type DraftTrackResolution, type LibraryTrackEvidence, type PlaybackHandle, type TrackCandidate, type TrackLyrics, type TrackTasteFeatures, type UserProfile } from "@/src/domain";
import { buildAccountMusicProfile } from "@/src/services/music-profile-builder";
import type { CandidateQuery, MusicProvider } from "./types";

const MOCK_TRACKS: TrackCandidate[] = [
  {
    id: "mock:dawn-window",
    provider: "mock",
    providerTrackId: "dawn-window",
    title: "窗边的慢速清晨",
    artist: "拾音记演示曲库",
    durationMs: 373000,
    coverVariant: "cover-coral",
    tags: ["平静", "熟悉感", "低能量"],
    features: { genres: ["器乐"], languages: ["纯音乐"], moods: ["平静", "舒展"], activities: ["休息"], environments: ["室内", "夜晚"], energy: 28, valence: 0.08, lyricDensity: "none", familiarity: 0.82 },
  },
  {
    id: "mock:soft-current",
    provider: "mock",
    providerTrackId: "soft-current",
    title: "柔软的水流",
    artist: "拾音记演示曲库",
    durationMs: 334000,
    coverVariant: "cover-cyan",
    tags: ["专注", "无歌词", "中低能量"],
    features: { genres: ["轻电子", "器乐"], languages: ["纯音乐"], moods: ["稳定", "专注"], activities: ["工作或学习", "阅读"], environments: ["室内"], energy: 43, valence: 0.18, lyricDensity: "none", familiarity: 0.66 },
  },
  {
    id: "mock:after-rain",
    provider: "mock",
    providerTrackId: "after-rain",
    title: "雨停之后",
    artist: "拾音记演示曲库",
    durationMs: 302000,
    coverVariant: "cover-yellow",
    tags: ["舒展", "轻盈", "情绪陪伴"],
    features: { genres: ["独立流行"], languages: ["华语"], moods: ["舒展", "轻盈"], activities: ["休息", "散步"], environments: ["雨后"], energy: 38, valence: 0.35, lyricDensity: "medium", familiarity: 0.55 },
  },
  {
    id: "mock:road-north",
    provider: "mock",
    providerTrackId: "road-north",
    title: "向北的公路",
    artist: "拾音记演示曲库",
    durationMs: 327000,
    coverVariant: "cover-blue",
    tags: ["旅行", "开阔", "中能量"],
    features: { genres: ["独立流行"], languages: ["华语"], moods: ["期待", "开阔"], activities: ["旅行途中", "散步"], environments: ["在路上", "开阔"], energy: 60, valence: 0.52, lyricDensity: "medium", familiarity: 0.62 },
  },
  {
    id: "mock:paper-light",
    provider: "mock",
    providerTrackId: "paper-light",
    title: "纸页间的光",
    artist: "拾音记演示曲库",
    durationMs: 361000,
    coverVariant: "cover-green",
    tags: ["工作", "稳定", "少干扰"],
    features: { genres: ["轻电子"], languages: ["纯音乐"], moods: ["稳定", "克制"], activities: ["工作或学习", "写作"], environments: ["室内"], energy: 47, valence: 0.2, lyricDensity: "low", familiarity: 0.48 },
  },
];

const AUDIO_BY_TRACK: Record<string, string> = Object.fromEntries(
  MOCK_TRACKS.map((track, index) => [track.id, `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${index + 1}.mp3`]),
);

export class MockMusicProvider implements MusicProvider {
  readonly name = "mock-music-v1";

  async retrieveCandidates(query: CandidateQuery): Promise<TrackCandidate[]> {
    return MOCK_TRACKS.slice(0, query.limit);
  }

  async getProfileSummary(profile: UserProfile) {
    return createProfileSummary(profile);
  }

  async searchDirectTrack(input: Parameters<NonNullable<MusicProvider["searchDirectTrack"]>>[0]) {
    return MOCK_TRACKS
      .filter((track) => normalize(track.title) === normalize(input.request.title)
        && (!input.request.artist || normalize(track.artist).includes(normalize(input.request.artist))))
      .slice(0, input.limit ?? 1)
      .map((track) => ({ ...track, retrieval: { source: "direct_request" as const, fitReason: "按点歌请求精准匹配", matchScore: 1 } }));
  }

  async syncAccountMusicProfile(profile: UserProfile) {
    const libraryTracks: LibraryTrackEvidence[] = MOCK_TRACKS.map((track, index) => ({
      provider: "mock", providerTrackId: track.providerTrackId, title: track.title, artist: track.artist, album: null,
      durationMs: track.durationMs, sources: index < 2 ? ["liked"] : ["playlist"], playlistIds: ["mock-playlist"],
      playlistContexts: track.features.activities.length ? track.features.activities : ["日常收藏"], evidenceWeight: index < 2 ? 1 : 0.75,
    }));
    const trackFeatures: TrackTasteFeatures[] = MOCK_TRACKS.map((track) => ({
      provider: "mock", providerTrackId: track.providerTrackId, genres: track.features.genres, languages: track.features.languages,
      energy: track.features.energy, valence: track.features.valence, lyricDensity: track.features.lyricDensity,
      lyricThemes: track.features.moods, narrativeStrength: track.features.lyricDensity === "none" ? 0 : 0.5,
      instruments: track.features.lyricDensity === "none" ? ["合成器"] : [], playlistContexts: track.features.activities,
      provenance: { genres: "metadata", languages: "metadata", energy: "inferred", lyricDensity: "inferred", lyricThemes: "inferred", instruments: "inferred" },
      confidence: 0.75,
    }));
    return { libraryTracks, trackFeatures, profile: buildAccountMusicProfile({ userId: profile.userId, provider: "mock", playlistCount: 1, libraryTracks, trackFeatures }) };
  }

  async searchAndMatchDraftTracks(input: Parameters<NonNullable<MusicProvider["searchAndMatchDraftTracks"]>>[0]): Promise<DraftTrackResolution[]> {
    const used = new Set<string>();
    return input.drafts.map((draft) => {
      const track = MOCK_TRACKS.find((candidate) => normalize(candidate.title) === normalize(draft.title) && (!draft.artist || normalize(candidate.artist) === normalize(draft.artist)));
      if (!track) return { draft, status: "not_found", matchScore: null };
      if (used.has(track.id)) return { draft, status: "duplicate", matchScore: 1 };
      used.add(track.id);
      return { draft, status: "matched", matchScore: 1, track: { ...track, retrieval: { source: "draft", fitReason: draft.fitReason, matchScore: 1 } } };
    });
  }

  async filterPlayable(trackIds: string[]): Promise<string[]> {
    return trackIds.filter((id) => id in AUDIO_BY_TRACK);
  }

  async resolvePlayback(trackId: string): Promise<PlaybackHandle> {
    const url = AUDIO_BY_TRACK[trackId];
    if (!url) throw new Error("TRACK_NOT_PLAYABLE");

    return {
      id: `ph_${crypto.randomUUID()}`,
      trackId,
      url,
      mimeType: "audio/mpeg",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }

  async getLyrics(trackId: string): Promise<TrackLyrics> {
    const track = MOCK_TRACKS.find((candidate) => candidate.id === trackId);
    if (!track) return { trackId, synced: false, lines: [] };
    return {
      trackId,
      synced: true,
      lines: [
        { timeMs: 0, text: track.title },
        { timeMs: 8_000, text: "这里展示与播放时间同步的歌词" },
        { timeMs: 16_000, text: "当前是演示曲库的占位文本" },
        { timeMs: 24_000, text: "连接网易云后会读取歌曲原有歌词" },
      ],
    };
  }
}

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}
