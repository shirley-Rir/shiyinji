import type { PlaybackHandle, StructuredContext, TrackCandidate, UserProfile } from "@/src/domain";
import type { CandidateQuery, MusicProvider } from "./types";
import type { NcmClient, NcmLyric, NcmPrivilege, NcmSong, NcmTasteProfile } from "./netease-client";
import type { NcmSessionManager } from "./netease-session";

type NeteaseProviderConfig = {
  playbackLevel?: string;
  allowTrial?: boolean;
  enrichLimit?: number;
};

type FeatureEvidence = {
  genres: string[];
  lyricDensity: "none" | "low" | "medium" | "high";
  energy: number;
  valence: number;
  genreSource: "wiki" | "search" | "inferred";
  lyricSource: "lyrics" | "instrumental-signal" | "inferred";
  energySource: "wiki-bpm" | "genre-heuristic";
  confidence: number;
};

const EMPTY_TASTE: NcmTasteProfile = { likedIds: new Set(), playCounts: new Map(), familiarArtists: new Set(), preferredGenres: [] };
const GENRE_WORDS = ["华语流行", "流行", "摇滚", "民谣", "电子", "轻电子", "古典", "爵士", "嘻哈", "说唱", "R&B", "器乐", "轻音乐", "原声", "氛围", "世界音乐"];
type NcmSessionSource = Pick<NcmSessionManager, "getSession" | "getTaste">;

export class NeteaseMusicProvider implements MusicProvider {
  readonly name = "netease-enhanced-v2";
  private readonly privileges = new Map<number, NcmPrivilege>();
  private readonly evidenceCache = new Map<number, { expiresAt: number; value: FeatureEvidence }>();

  constructor(
    private readonly client: NcmClient,
    private readonly config: NeteaseProviderConfig = {},
    private readonly sessions?: NcmSessionSource,
  ) {}

  async retrieveCandidates(query: CandidateQuery): Promise<TrackCandidate[]> {
    const session = await this.sessions?.getSession(query.profile.userId) ?? null;
    const taste = session && this.sessions ? await this.sessions.getTaste(query.profile.userId, session).catch(() => EMPTY_TASTE) : EMPTY_TASTE;
    const seeds = searchSeeds(query.context, query.profile, taste.preferredGenres);
    const perSeed = Math.max(5, Math.ceil(query.limit / seeds.length));
    const laneById = new Map<number, string>();
    for (const seed of seeds) {
      try {
        const songs = await this.client.searchSongs(seed, perSeed, session?.cookie);
        for (const song of songs) if (!laneById.has(song.id)) laneById.set(song.id, seed);
      } catch {
        // A transient lane failure should not discard candidates from other lanes.
      }
    }

    const ids = [...laneById.keys()].slice(0, query.limit);
    if (!ids.length) throw new Error("NCM_API_ERROR:NO_CANDIDATES");
    const details = await this.client.getSongDetails(ids, session?.cookie);
    for (const privilege of details.privileges) this.privileges.set(privilege.id, privilege);

    const enrichIds = new Set(details.songs.slice(0, this.config.enrichLimit ?? 18).map((song) => song.id));
    return mapWithConcurrency(details.songs, 5, async (song) => {
      const lane = laneById.get(song.id) ?? seeds[0];
      const evidence = enrichIds.has(song.id)
        ? await this.getFeatureEvidence(song, lane)
        : inferFeatureEvidence(song, lane);
      return toCandidate(song, lane, evidence, taste);
    });
  }

  async filterPlayable(trackIds: string[], connectionId?: string): Promise<string[]> {
    const session = connectionId ? await this.sessions?.getSession(connectionId) ?? null : null;
    const parsed = trackIds.map((trackId) => ({ trackId, id: parseTrackId(trackId) })).filter((item): item is { trackId: string; id: number } => item.id !== null);
    const missing = parsed.map((item) => item.id).filter((id) => !this.privileges.has(id));
    if (missing.length) {
      const details = await this.client.getSongDetails(missing, session?.cookie);
      for (const privilege of details.privileges) this.privileges.set(privilege.id, privilege);
    }
    return parsed.filter(({ id }) => isPlayable(this.privileges.get(id))).map(({ trackId }) => trackId);
  }

  async resolvePlayback(trackId: string, connectionId?: string): Promise<PlaybackHandle> {
    const id = parseTrackId(trackId);
    if (id === null) throw new Error("TRACK_NOT_PLAYABLE");
    const session = connectionId ? await this.sessions?.getSession(connectionId) ?? null : null;
    const playback = await this.client.getPlayback(id, this.config.playbackLevel ?? "standard", session?.cookie);
    if (!playback.url || (playback.freeTrialInfo && !this.config.allowTrial)) throw new Error("TRACK_NOT_PLAYABLE");
    return {
      id: `ph_${crypto.randomUUID()}`,
      trackId,
      url: playback.url,
      mimeType: playback.type ? `audio/${playback.type === "mp3" ? "mpeg" : playback.type}` : "audio/mpeg",
      expiresAt: new Date(Date.now() + Math.max(60, playback.expi ?? 600) * 1000).toISOString(),
    };
  }

  private async getFeatureEvidence(song: NcmSong, lane: string) {
    const cached = this.evidenceCache.get(song.id);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const [lyric, wiki] = await Promise.all([
      this.client.getLyrics(song.id).catch(() => null),
      this.client.getWiki(song.id).catch(() => null),
    ]);
    const value = inferFeatureEvidence(song, lane, lyric, wiki);
    this.evidenceCache.set(song.id, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return value;
  }
}

function searchSeeds(context: StructuredContext, profile: UserProfile, accountGenres: string[]) {
  const activity = context.activity ?? "";
  const preferredGenre = accountGenres[0] ?? profile.explicit.likedGenres[0];
  const preferredArtist = profile.explicit.likedArtists[0];
  if (/学习|复习|阅读|写作|论文|工作|代码|编程/.test(activity)) {
    return context.lyricTolerance === "none"
      ? ["专注 纯音乐", "学习 轻音乐", `${preferredGenre ?? "器乐"} 纯音乐`]
      : ["专注 音乐", `${context.targetMood[0] ?? "平静"} 轻音乐`, preferredGenre ?? "工作 音乐"];
  }
  if (/旅行|驾驶|乘车|候机|步行|跑步/.test(activity) || context.environment.some((item) => /路上|公路|机场|海边/.test(item))) {
    return ["旅行 公路 音乐", `${context.targetMood[0] ?? "开阔"} 音乐`, preferredArtist ?? preferredGenre ?? "旅行 轻音乐"];
  }
  return [`${context.targetMood[0] ?? "平静"} 治愈`, "情绪陪伴 轻音乐", preferredArtist ?? preferredGenre ?? "放松 音乐"];
}

function toCandidate(song: NcmSong, lane: string, evidence: FeatureEvidence, taste: NcmTasteProfile): TrackCandidate {
  const artists = song.ar?.map((item) => item.name) ?? song.artists?.map((item) => item.name) ?? [];
  const artist = artists.join(" / ") || "未知艺人";
  const familiarity = inferFamiliarity(song.id, artists, taste);
  const accountTag = familiarity >= 0.65 ? ["账号常听"] : [];
  return {
    id: `netease:${song.id}`,
    provider: "netease",
    providerTrackId: String(song.id),
    title: song.name,
    artist,
    durationMs: song.dt ?? song.duration ?? 0,
    coverVariant: coverVariant(song.id),
    tags: [...new Set([...evidence.genres.slice(0, 2), ...accountTag, ...lane.split(/\s+/).filter(Boolean).slice(0, 2)])].slice(0, 4),
    features: {
      genres: evidence.genres,
      languages: inferLanguages(song.name, evidence.lyricDensity),
      moods: inferMoods(song.name, evidence.valence),
      activities: [],
      environments: [],
      energy: evidence.energy,
      valence: evidence.valence,
      lyricDensity: evidence.lyricDensity,
      familiarity,
      provenance: {
        genres: evidence.genreSource,
        lyricDensity: evidence.lyricSource,
        energy: evidence.energySource,
        familiarity: taste === EMPTY_TASTE ? "anonymous" : "account-history",
        confidence: evidence.confidence,
      },
    },
  };
}

function inferFeatureEvidence(song: NcmSong, lane: string, lyric?: NcmLyric | null, wiki?: unknown): FeatureEvidence {
  const wikiGenres = extractWikiGenres(wiki);
  const laneGenres = GENRE_WORDS.filter((genre) => lane.toLowerCase().includes(genre.toLowerCase()));
  const genres = wikiGenres.length ? wikiGenres : laneGenres.length ? laneGenres : inferGenres(song.name, lane);
  const instrumentalSignal = /纯音乐|轻音乐|器乐|instrumental|piano|钢琴|背景音乐/i.test(`${song.name} ${lane}`);
  const lyricDensity = lyric ? measureLyricDensity(lyric, song.dt ?? song.duration ?? 0) : instrumentalSignal ? "none" : "medium";
  const bpm = extractBpm(wiki);
  const energy = bpm ? clamp(Math.round((bpm - 55) / 1.25), 0, 100) : inferEnergy(song.name, genres, lyricDensity);
  const valence = inferValence(song.name, genres);
  return {
    genres,
    lyricDensity,
    energy,
    valence,
    genreSource: wikiGenres.length ? "wiki" : laneGenres.length ? "search" : "inferred",
    lyricSource: lyric ? "lyrics" : instrumentalSignal ? "instrumental-signal" : "inferred",
    energySource: bpm ? "wiki-bpm" : "genre-heuristic",
    confidence: Number((wikiGenres.length && lyric ? 0.9 : lyric || wikiGenres.length ? 0.76 : instrumentalSignal ? 0.62 : 0.45).toFixed(2)),
  };
}

function measureLyricDensity(payload: NcmLyric, durationMs: number): FeatureEvidence["lyricDensity"] {
  if (payload.nolyric) return "none";
  const lines = (payload.lrc?.lyric ?? "").split(/\r?\n/).map((line) => line.replace(/\[[^\]]+]/g, "").trim()).filter((line) => line && !/^(作词|作曲|编曲|纯音乐|请欣赏|music)/i.test(line));
  const characters = lines.join("").replace(/\s+/g, "").length;
  if (characters < 20) return "none";
  const minutes = Math.max(1, durationMs / 60_000);
  const charactersPerMinute = characters / minutes;
  if (charactersPerMinute < 35) return "low";
  if (charactersPerMinute < 90) return "medium";
  return "high";
}

function extractWikiGenres(wiki: unknown) {
  const genres: string[] = [];
  visit(wiki);
  return [...new Set(genres)].slice(0, 5);

  function visit(node: unknown) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    if (object.creativeType === "songTag" && Array.isArray(object.resources)) {
      for (const resource of object.resources) {
        const title = readNestedTitle(resource);
        if (title) genres.push(...title.split(/[-/、]/).map((item) => item.trim()).filter(Boolean));
      }
    }
    for (const child of Object.values(object)) visit(child);
  }
}

function readNestedTitle(value: unknown) {
  const object = value as { uiElement?: { mainTitle?: { title?: unknown } } };
  return typeof object?.uiElement?.mainTitle?.title === "string" ? object.uiElement.mainTitle.title : null;
}

function extractBpm(wiki: unknown) {
  if (!wiki) return null;
  const text = JSON.stringify(wiki);
  const match = /(?:bpm|速度)[^0-9]{0,12}(\d{2,3})/i.exec(text) ?? /(\d{2,3})[^0-9]{0,5}bpm/i.exec(text);
  const bpm = match ? Number(match[1]) : 0;
  return bpm >= 45 && bpm <= 220 ? bpm : null;
}

function inferGenres(title: string, lane: string) {
  const text = `${title} ${lane}`.toLowerCase();
  const matches = GENRE_WORDS.filter((genre) => text.includes(genre.toLowerCase()));
  if (/piano|钢琴/.test(text)) matches.push("器乐", "钢琴");
  if (/lo-?fi/.test(text)) matches.push("Lo-Fi");
  return [...new Set(matches.length ? matches : ["流行"])];
}

function inferEnergy(title: string, genres: string[], lyricDensity: FeatureEvidence["lyricDensity"]) {
  const genreBase: Record<string, number> = { 古典: 32, 器乐: 38, 轻音乐: 30, 氛围: 28, 爵士: 48, 民谣: 42, 流行: 58, 华语流行: 56, 电子: 70, 轻电子: 55, 摇滚: 78, 嘻哈: 72, 说唱: 72, "R&B": 54 };
  const bases = genres.map((genre) => genreBase[genre]).filter((value): value is number => value !== undefined);
  let energy = bases.length ? bases.reduce((sum, value) => sum + value, 0) / bases.length : 50;
  if (/慢|安静|舒缓|睡眠|冥想|calm|sleep/i.test(title)) energy -= 15;
  if (/跑步|运动|燃|热烈|派对|remix|live/i.test(title)) energy += 18;
  if (lyricDensity === "high") energy += 5;
  return clamp(Math.round(energy), 0, 100);
}

function inferValence(title: string, genres: string[]) {
  if (/悲伤|失恋|孤独|寂寞|难过|眼泪|遗憾/i.test(title)) return -0.55;
  if (/快乐|开心|阳光|自由|甜|庆祝|good|happy/i.test(title)) return 0.65;
  if (genres.some((genre) => ["电子", "摇滚", "流行"].includes(genre))) return 0.2;
  return 0.05;
}

function inferMoods(title: string, valence: number) {
  if (/安静|平静|舒缓|睡眠|冥想/i.test(title)) return ["平静", "放松"];
  if (valence > 0.45) return ["愉悦", "轻快"];
  if (valence < -0.35) return ["低落", "内省"];
  return ["稳定"];
}

function inferLanguages(title: string, lyricDensity: FeatureEvidence["lyricDensity"]) {
  if (lyricDensity === "none") return ["纯音乐"];
  if (/[ぁ-んァ-ン]/.test(title)) return ["日语"];
  if (/[가-힣]/.test(title)) return ["韩语"];
  if (/\p{Script=Han}/u.test(title)) return ["华语"];
  return [];
}

function inferFamiliarity(songId: number, artists: string[], taste: NcmTasteProfile) {
  if (taste.likedIds.has(songId)) return 0.98;
  const plays = taste.playCounts.get(songId) ?? 0;
  if (plays > 0) return clamp(0.62 + Math.log10(plays + 1) * 0.18, 0, 0.94);
  if (artists.some((artist) => taste.familiarArtists.has(artist))) return 0.58;
  return taste === EMPTY_TASTE ? 0.25 : 0.12;
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

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const result = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      result[index] = await mapper(items[index]);
    }
  }));
  return result;
}
