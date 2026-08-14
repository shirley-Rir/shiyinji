import type { PlaybackHandle, StructuredContext, TrackCandidate } from "@/src/domain";
import type { CandidateQuery, MusicProvider } from "./types";
import type { NcmClient, NcmPrivilege, NcmSong } from "./netease-client";

type NeteaseProviderConfig = {
  playbackLevel?: string;
  allowTrial?: boolean;
};

export class NeteaseMusicProvider implements MusicProvider {
  readonly name = "netease-enhanced-v1";
  private readonly privileges = new Map<number, NcmPrivilege>();

  constructor(private readonly client: NcmClient, private readonly config: NeteaseProviderConfig = {}) {}

  async retrieveCandidates(query: CandidateQuery): Promise<TrackCandidate[]> {
    const seeds = searchSeeds(query.context, query.profile.explicit.likedGenres, query.profile.explicit.likedArtists);
    const perSeed = Math.max(5, Math.ceil(query.limit / seeds.length));
    const laneById = new Map<number, string>();
    for (const seed of seeds) {
      try {
        const songs = await this.client.searchSongs(seed, perSeed);
        for (const song of songs) if (!laneById.has(song.id)) laneById.set(song.id, seed);
      } catch {
        // A transient lane failure should not discard candidates from other lanes.
      }
    }

    const ids = [...laneById.keys()].slice(0, query.limit);
    if (!ids.length) throw new Error("NCM_API_ERROR:NO_CANDIDATES");
    const details = await this.client.getSongDetails(ids);
    for (const privilege of details.privileges) this.privileges.set(privilege.id, privilege);
    return details.songs.map((song) => toCandidate(song, laneById.get(song.id) ?? seeds[0], query.context));
  }

  async filterPlayable(trackIds: string[]): Promise<string[]> {
    const parsed = trackIds.map((trackId) => ({ trackId, id: parseTrackId(trackId) })).filter((item): item is { trackId: string; id: number } => item.id !== null);
    const missing = parsed.map((item) => item.id).filter((id) => !this.privileges.has(id));
    if (missing.length) {
      const details = await this.client.getSongDetails(missing);
      for (const privilege of details.privileges) this.privileges.set(privilege.id, privilege);
    }
    return parsed.filter(({ id }) => isPlayable(this.privileges.get(id))).map(({ trackId }) => trackId);
  }

  async resolvePlayback(trackId: string): Promise<PlaybackHandle> {
    const id = parseTrackId(trackId);
    if (id === null) throw new Error("TRACK_NOT_PLAYABLE");
    const playback = await this.client.getPlayback(id, this.config.playbackLevel ?? "standard");
    if (!playback.url || (playback.freeTrialInfo && !this.config.allowTrial)) throw new Error("TRACK_NOT_PLAYABLE");
    return {
      id: `ph_${crypto.randomUUID()}`,
      trackId,
      url: playback.url,
      mimeType: playback.type ? `audio/${playback.type === "mp3" ? "mpeg" : playback.type}` : "audio/mpeg",
      expiresAt: new Date(Date.now() + Math.max(60, playback.expi ?? 600) * 1000).toISOString(),
    };
  }
}

function searchSeeds(context: StructuredContext, genres: string[], artists: string[]) {
  const activity = context.activity ?? "";
  if (/学习|复习|阅读|写作|论文|工作|代码|编程/.test(activity)) {
    return context.lyricTolerance === "none"
      ? ["专注 纯音乐", "学习 轻音乐", "工作 背景音乐"]
      : ["专注 音乐", `${context.targetMood[0] ?? "平静"} 轻音乐`, genres[0] ?? "工作 音乐"];
  }
  if (/旅行|驾驶|乘车|候机|步行|跑步/.test(activity) || context.environment.some((item) => /路上|公路|机场|海边/.test(item))) {
    return ["旅行 公路 音乐", `${context.targetMood[0] ?? "开阔"} 音乐`, artists[0] ?? "旅行 轻音乐"];
  }
  return [`${context.targetMood[0] ?? "平静"} 治愈`, "情绪陪伴 轻音乐", artists[0] ?? genres[0] ?? "放松 音乐"];
}

function toCandidate(song: NcmSong, lane: string, context: StructuredContext): TrackCandidate {
  const artist = song.ar?.map((item) => item.name).join(" / ") || song.artists?.map((item) => item.name).join(" / ") || "未知艺人";
  const instrumental = /纯音乐|轻音乐|背景音乐/.test(lane);
  const jitter = (song.id % 17) - 8;
  return {
    id: `netease:${song.id}`,
    provider: "netease",
    providerTrackId: String(song.id),
    title: song.name,
    artist,
    durationMs: song.dt ?? song.duration ?? 0,
    coverVariant: coverVariant(song.id),
    tags: lane.split(/\s+/).filter(Boolean).slice(0, 3),
    features: {
      genres: lane.includes("轻音乐") ? ["轻音乐"] : [],
      languages: instrumental ? ["纯音乐"] : [],
      moods: context.targetMood,
      activities: context.activity ? [context.activity] : [],
      environments: context.environment,
      energy: Math.max(0, Math.min(100, context.targetEnergy + jitter)),
      valence: context.valence,
      lyricDensity: instrumental ? "none" : "medium",
      familiarity: 0.5,
    },
  };
}

function isPlayable(privilege?: NcmPrivilege) {
  return Boolean(privilege && (privilege.st ?? 0) >= 0 && !privilege.toast && privilege.plLevel && privilege.plLevel !== "none");
}

function parseTrackId(trackId: string) {
  const match = /^netease:(\d+)$/.exec(trackId);
  return match ? Number(match[1]) : null;
}

function coverVariant(id: number) {
  return ["cover-coral", "cover-cyan", "cover-yellow", "cover-blue", "cover-green"][id % 5];
}
