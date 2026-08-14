import type { PlaybackHandle, TrackCandidate } from "@/src/domain";
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
}
