import { createProfileSummary, type AccountMusicProfileSyncSnapshot, type DirectPlayRequest, type DraftTrack, type DraftTrackResolution, type LibraryTrackEvidence, type PlaybackHandle, type ProfileSummary, type RecommendationBrief, type StructuredContext, type TrackCandidate, type TrackLyrics, type TrackLyricLine, type TrackTasteFeatures, type UserProfile } from "@/src/domain";
import { buildAccountMusicProfile } from "@/src/services/music-profile-builder";
import type { CandidateQuery, MusicProvider } from "./types";
import type { NcmAccountLibraryTrack, NcmClient, NcmLyric, NcmPrivilege, NcmSong, NcmTasteProfile } from "./netease-client";
import type { NcmSessionManager } from "./netease-session";

type NeteaseProviderConfig = {
  playbackLevel?: string;
  allowTrial?: boolean;
  enrichLimit?: number;
  profileAnalysisLimit?: number;
};

type FeatureEvidence = {
  genres: string[];
  lyricDensity: "none" | "low" | "medium" | "high";
  energy: number;
  valence: number;
  genreSource: "wiki" | "search" | "inferred";
  lyricSource: "lyrics" | "instrumental-signal" | "inferred";
  energySource: "wiki-bpm" | "genre-heuristic";
  languages: string[];
  lyricThemes: string[];
  narrativeStrength: number;
  instruments: string[];
  hasLyrics: boolean;
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
    const taste = query.profile.personalizationEnabled && session && this.sessions
      ? await this.sessions.getTaste(query.profile.userId, session).catch(() => EMPTY_TASTE)
      : EMPTY_TASTE;
    const seeds = searchSeeds(query.context, query.profile, taste.preferredGenres, query.brief);
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

    const enrichIds = new Set(details.songs.slice(0, this.config.enrichLimit ?? 10).map((song) => song.id));
    return mapWithConcurrency(details.songs, 5, async (song) => {
      const lane = laneById.get(song.id) ?? seeds[0];
      const evidence = enrichIds.has(song.id)
        ? await this.getFeatureEvidence(song, lane)
        : inferFeatureEvidence(song, lane);
      return toCandidate(song, lane, evidence, taste);
    });
  }

  async getProfileSummary(profile: UserProfile): Promise<ProfileSummary> {
    const summary = createProfileSummary(profile);
    if (!profile.personalizationEnabled) return summary;
    const session = await this.sessions?.getSession(profile.userId) ?? null;
    if (!session || !this.sessions) return summary;
    const taste = await this.sessions.getTaste(profile.userId, session).catch(() => EMPTY_TASTE);
    return {
      ...summary,
      familiarArtists: [...new Set([...summary.familiarArtists, ...taste.familiarArtists])].slice(0, 25),
      accountGenres: [...new Set([...summary.accountGenres, ...taste.preferredGenres])].slice(0, 20),
      representativeTracks: uniqueRepresentativeTracks([
        ...summary.representativeTracks,
        ...(taste.representativeTracks ?? []).map((track) => ({ providerTrackId: String(track.id), title: track.title, artist: track.artist, source: track.source })),
      ]).slice(0, 40),
    };
  }

  async searchDirectTrack(input: { request: DirectPlayRequest; profile: UserProfile; limit?: number }): Promise<TrackCandidate[]> {
    const session = await this.sessions?.getSession(input.profile.userId) ?? null;
    const taste = input.profile.personalizationEnabled && session && this.sessions
      ? await this.sessions.getTaste(input.profile.userId, session).catch(() => EMPTY_TASTE)
      : EMPTY_TASTE;
    const draft: DraftTrack = {
      title: input.request.title,
      artist: input.request.artist ?? undefined,
      versionHint: input.request.versionHint,
      fitReason: "按点歌请求精准匹配",
      riskNotes: [],
    };
    const songs = await this.client.searchSongs([input.request.title, input.request.artist].filter(Boolean).join(" "), 12, session?.cookie);
    const requestedArtists = input.request.artist?.split(/[/、,&，]/).map((artist) => artist.trim()).filter(Boolean) ?? [];
    const eligible = songs
      .map((song) => ({ song, score: scoreSongMatch(draft, song), titleScore: stringSimilarity(normalizeTitle(draft.title), normalizeTitle(song.name)) }))
      .filter((item) => !requestedArtists.length || requestedArtists.some((requested) => songArtists(item.song).some((artist) => canonicalEntity(requested) === canonicalEntity(artist))))
      .filter((item) => item.titleScore >= 0.88 && item.score >= 0.72)
      .sort((a, b) => b.score - a.score);
    const exactTitle = eligible.filter((item) => normalizeText(item.song.name) === normalizeText(input.request.title));
    const ranked = (exactTitle.length ? exactTitle : eligible).slice(0, Math.max(1, input.limit ?? 3));
    if (!ranked.length) return [];

    const details = await this.client.getSongDetails(ranked.map((item) => item.song.id), session?.cookie);
    const songById = new Map(details.songs.map((song) => [song.id, song]));
    for (const privilege of details.privileges) this.privileges.set(privilege.id, privilege);
    const playable = ranked.filter((item) => isPlayable(this.privileges.get(item.song.id)));
    return mapWithConcurrency(playable, 3, async ({ song: searchedSong, score }) => {
      const song = songById.get(searchedSong.id) ?? searchedSong;
      const evidence = await this.getFeatureEvidence(song, input.request.title);
      const track = toCandidate(song, input.request.title, evidence, taste);
      return { ...track, retrieval: { source: "direct_request", fitReason: "按点歌请求精准匹配", matchScore: score } };
    });
  }

  async syncAccountMusicProfile(profile: UserProfile, options: { getCachedTrackFeatures?: (provider: string, providerTrackIds: string[]) => Promise<TrackTasteFeatures[]> } = {}): Promise<AccountMusicProfileSyncSnapshot> {
    if (!profile.personalizationEnabled) throw new Error("PERSONALIZATION_DISABLED");
    const session = await this.sessions?.getSession(profile.userId) ?? null;
    if (!session) throw new Error("MUSIC_ACCOUNT_NOT_CONNECTED");
    if (!this.client.getAccountLibrary) throw new Error("MUSIC_PROFILE_SYNC_UNAVAILABLE");
    const library = await this.client.getAccountLibrary(session.userId, session.cookie);
    const libraryTracks = library.tracks.map(toLibraryTrackEvidence);
    const selected = selectRepresentativeTracks(library.tracks, this.config.profileAnalysisLimit ?? 80);
    const cachedFeatures = options.getCachedTrackFeatures
      ? await options.getCachedTrackFeatures("netease", selected.map((track) => String(track.song.id))).catch(() => [])
      : [];
    const cachedById = new Map(cachedFeatures.map((feature) => [feature.providerTrackId, feature]));
    const trackFeatures = await mapWithConcurrency(selected, 5, async (track): Promise<TrackTasteFeatures> => {
      const cached = cachedById.get(String(track.song.id));
      if (cached) return { ...cached, playlistContexts: track.playlistContexts };
      const lane = [...track.playlistContexts, ...library.preferredGenres].join(" ");
      const evidence = await this.getFeatureEvidence(track.song, lane);
      return {
        provider: "netease",
        providerTrackId: String(track.song.id),
        genres: evidence.genres,
        languages: evidence.languages,
        energy: evidence.energy,
        valence: evidence.valence,
        lyricDensity: evidence.lyricDensity,
        lyricThemes: evidence.lyricThemes,
        narrativeStrength: evidence.narrativeStrength,
        instruments: evidence.instruments,
        playlistContexts: track.playlistContexts,
        provenance: {
          genres: evidence.genreSource === "wiki" ? "wiki" : evidence.genreSource === "search" ? "playlist" : "inferred",
          languages: evidence.hasLyrics ? "lyrics" : "metadata",
          energy: evidence.energySource === "wiki-bpm" ? "wiki" : "inferred",
          lyricDensity: evidence.lyricSource === "lyrics" ? "lyrics" : "inferred",
          lyricThemes: evidence.hasLyrics ? "lyrics" : "inferred",
          instruments: evidence.instruments.length ? "wiki" : "inferred",
        },
        confidence: evidence.confidence,
      };
    });
    return {
      libraryTracks,
      trackFeatures,
      profile: buildAccountMusicProfile({ userId: profile.userId, provider: "netease", playlistCount: library.playlists.length, libraryTracks, trackFeatures }),
    };
  }

  async searchAndMatchDraftTracks(input: {
    drafts: DraftTrack[];
    brief: RecommendationBrief;
    context: StructuredContext;
    profile: UserProfile;
  }): Promise<DraftTrackResolution[]> {
    const session = await this.sessions?.getSession(input.profile.userId) ?? null;
    const taste = input.profile.personalizationEnabled && session && this.sessions
      ? await this.sessions.getTaste(input.profile.userId, session).catch(() => EMPTY_TASTE)
      : EMPTY_TASTE;
    const searched = await mapWithConcurrency(input.drafts, 4, async (draft): Promise<DraftSearchResult> => {
      const query = [draft.title, draft.artist].filter(Boolean).join(" ");
      let songs: NcmSong[];
      try {
        songs = await this.client.searchSongs(query, 8, session?.cookie);
      } catch {
        return { draft, status: "not_found", matchScore: null };
      }
      if (!songs.length) return { draft, status: "not_found", matchScore: null };
      const best = songs
        .map((song) => ({ song, score: scoreSongMatch(draft, song) }))
        .filter(({ song }) => !isAvoidedArtist(song, input.brief.avoid.artists))
        .sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < 0.72) return { draft, status: "search_mismatch", matchScore: best?.score ?? null };
      const libraryIds = taste.libraryIds ?? taste.likedIds;
      if (!input.brief.discoveryIntent.allowUserLibrary && libraryIds.has(best.song.id)) {
        return { draft, status: "violates_constraints", matchScore: best.score };
      }
      return { draft, status: "matched", matchScore: best.score, song: best.song };
    });

    const seen = new Set<number>();
    for (const result of searched) {
      if (!result.song) continue;
      if (seen.has(result.song.id)) {
        result.status = "duplicate";
        delete result.song;
      } else {
        seen.add(result.song.id);
      }
    }

    const matchedIds = searched.flatMap((result) => result.song ? [result.song.id] : []);
    if (!matchedIds.length) return searched.map(toDraftResolution);
    const details = await this.client.getSongDetails(matchedIds, session?.cookie);
    const songById = new Map(details.songs.map((song) => [song.id, song]));
    for (const privilege of details.privileges) this.privileges.set(privilege.id, privilege);

    return mapWithConcurrency(searched, 5, async (result): Promise<DraftTrackResolution> => {
      if (!result.song) return toDraftResolution(result);
      const song = songById.get(result.song.id) ?? result.song;
      if (!isPlayable(this.privileges.get(song.id))) return { draft: result.draft, status: "not_playable", matchScore: result.matchScore };
      const lane = input.brief.desiredSound.genres[0] ?? input.brief.desiredSound.moods[0] ?? result.draft.fitReason;
      const evidence = await this.getFeatureEvidence(song, lane);
      const track = toCandidate(song, lane, evidence, taste);
      if (input.brief.avoid.genres.some((genre) => track.features.genres.includes(genre))) {
        return { draft: result.draft, status: "violates_constraints", matchScore: result.matchScore };
      }
      return {
        draft: result.draft,
        status: "matched",
        matchScore: result.matchScore,
        track: { ...track, retrieval: { source: "draft", fitReason: result.draft.fitReason, matchScore: result.matchScore ?? undefined } },
      };
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

  async getLyrics(trackId: string): Promise<TrackLyrics> {
    const id = parseTrackId(trackId);
    if (id === null) return { trackId, synced: false, lines: [] };
    return parseNcmLyrics(trackId, await this.client.getLyrics(id));
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

export function parseNcmLyrics(trackId: string, payload: NcmLyric): TrackLyrics {
  if (payload.nolyric || payload.uncollected) return { trackId, synced: false, lines: [] };
  const original = parseLrc(payload.lrc?.lyric ?? "");
  const translations = new Map(
    parseLrc(payload.tlyric?.lyric ?? "")
      .filter((line): line is TrackLyricLine & { timeMs: number } => line.timeMs !== null)
      .map((line) => [line.timeMs, line.text]),
  );
  const lines = original.map((line) => line.timeMs === null || !translations.get(line.timeMs)
    ? line
    : { ...line, translation: translations.get(line.timeMs) });
  return { trackId, synced: lines.some((line) => line.timeMs !== null), lines };
}

function parseLrc(value: string): TrackLyricLine[] {
  const result: TrackLyricLine[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    const text = rawLine.replace(/\[[^\]]+]/g, "").trim();
    if (!text || /^(作词|作曲|编曲|制作人|混音)\s*[：:]/.test(text)) continue;
    if (!stamps.length) {
      if (!/^\[[a-z]+:/i.test(rawLine)) result.push({ timeMs: null, text });
      continue;
    }
    for (const stamp of stamps) {
      const seconds = Number(stamp[2]);
      result.push({ timeMs: Number(stamp[1]) * 60_000 + Math.round(seconds * 1000), text });
    }
  }
  return result
    .filter((line, index, lines) => !lines.slice(0, index).some((other) => other.timeMs === line.timeMs && other.text === line.text))
    .sort((a, b) => (a.timeMs ?? Number.MAX_SAFE_INTEGER) - (b.timeMs ?? Number.MAX_SAFE_INTEGER));
}

type DraftSearchResult = {
  draft: DraftTrack;
  status: DraftTrackResolution["status"];
  matchScore: number | null;
  song?: NcmSong;
};

function toDraftResolution(result: DraftSearchResult): DraftTrackResolution {
  return { draft: result.draft, status: result.status, matchScore: result.matchScore };
}

function scoreSongMatch(draft: DraftTrack, song: NcmSong) {
  const titleScore = stringSimilarity(normalizeTitle(draft.title), normalizeTitle(song.name));
  const songArtists = song.ar?.map((artist) => artist.name) ?? song.artists?.map((artist) => artist.name) ?? [];
  const requestedArtists = draft.artist?.split(/[/、,&，]/).map((artist) => artist.trim()).filter(Boolean) ?? [];
  const artistScore = requestedArtists.length
    ? Math.max(...requestedArtists.flatMap((requested) => songArtists.map((artist) => stringSimilarity(normalizeText(requested), normalizeText(artist)))), 0)
    : 0.5;
  const album = song.al?.name ?? song.album?.name ?? "";
  const albumScore = draft.album ? stringSimilarity(normalizeText(draft.album), normalizeText(album)) : 0.5;
  const versionScore = scoreVersion(draft.versionHint, `${song.name} ${album}`);
  const durationReasonable = (song.dt ?? song.duration ?? 0) > 30_000 ? 0.6 : 0;
  return Number((titleScore * 0.45 + artistScore * 0.3 + albumScore * 0.1 + versionScore * 0.1 + durationReasonable * 0.05).toFixed(4));
}

function scoreVersion(hint: DraftTrack["versionHint"], value: string) {
  if (hint === "any") return 1;
  const text = value.toLocaleLowerCase();
  const markers = { live: /live|现场|演唱会/, acoustic: /acoustic|不插电|木吉他/, remix: /remix|混音/ };
  if (hint === "studio") return Object.values(markers).some((pattern) => pattern.test(text)) ? 0 : 1;
  return markers[hint].test(text) ? 1 : 0.25;
}

function normalizeTitle(value: string) {
  return normalizeText(value.replace(/(?:（|\(|\[).*?(?:(?:）|\)|\])|$)/g, ""));
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function stringSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.88;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.length || !rightPairs.length) return 0;
  const counts = new Map<string, number>();
  for (const pair of leftPairs) counts.set(pair, (counts.get(pair) ?? 0) + 1);
  let matches = 0;
  for (const pair of rightPairs) {
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      matches += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * matches) / (leftPairs.length + rightPairs.length);
}

function bigrams(value: string) {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2));
}

function isAvoidedArtist(song: NcmSong, avoided: string[]) {
  const artists = song.ar?.map((artist) => artist.name) ?? song.artists?.map((artist) => artist.name) ?? [];
  return avoided.some((item) => artists.some((artist) => normalizeText(item) === normalizeText(artist)));
}

function songArtists(song: NcmSong) {
  return song.ar?.map((artist) => artist.name) ?? song.artists?.map((artist) => artist.name) ?? [];
}

function canonicalEntity(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}

function searchSeeds(context: StructuredContext, profile: UserProfile, accountGenres: string[], brief?: RecommendationBrief) {
  const planned = brief?.searchLanes
    .filter((lane) => lane.query.trim())
    .sort((a, b) => b.weight - a.weight)
    .map((lane) => lane.query.trim());
  if (planned?.length) return [...new Set(planned)].slice(0, 4);
  const activity = context.activity ?? "";
  const sceneTerms = specificSceneTerms(context);
  const sceneQuery = sceneTerms.slice(0, 3).join(" ");
  const preferredGenre = accountGenres[0] ?? profile.explicit.likedGenres[0];
  const preferredArtist = profile.explicit.likedArtists[0];
  if (/学习|复习|阅读|写作|论文|工作|代码|编程/.test(activity)) {
    return context.lyricTolerance === "none"
      ? ["专注 纯音乐", "学习 轻音乐", `${preferredGenre ?? "器乐"} 纯音乐`]
      : ["专注 音乐", `${context.targetMood[0] ?? "平静"} 轻音乐`, preferredGenre ?? "工作 音乐"];
  }
  if (/旅行|驾驶|乘车|候机|步行|跑步/.test(activity) || context.environment.some((item) => /路上|公路|机场|海边/.test(item))) {
    return [sceneQuery ? `${sceneQuery} 音乐` : "旅行 公路 音乐", `${context.targetMood[0] ?? "开阔"} ${activity || "旅行"} 音乐`, preferredArtist ?? preferredGenre ?? "旅行 轻音乐"];
  }
  return [sceneQuery ? `${sceneQuery} 音乐` : `${context.targetMood[0] ?? "平静"} 治愈`, `${context.targetMood[0] ?? "平静"} ${activity || context.environment[0] || "陪伴"} 音乐`, preferredArtist ?? preferredGenre ?? "放松 音乐"];
}

function specificSceneTerms(context: StructuredContext) {
  const generic = /^(图片情境|室内|户外|风景|环境|平静|未知|无法判断)$/;
  return [...new Set([context.activity, ...context.environment, ...context.currentMood, ...context.targetMood]
    .filter((value): value is string => Boolean(value?.trim()) && !generic.test(value!.trim())))]
    .slice(0, 5);
}

function toLibraryTrackEvidence(track: NcmAccountLibraryTrack): LibraryTrackEvidence {
  return {
    provider: "netease",
    providerTrackId: String(track.song.id),
    title: track.song.name,
    artist: (track.song.ar ?? track.song.artists ?? []).map((artist) => artist.name).join(" / ") || "未知艺人",
    album: track.song.al?.name ?? track.song.album?.name ?? null,
    durationMs: track.song.dt ?? track.song.duration ?? 0,
    sources: track.sources,
    playlistIds: track.playlistIds.map(String),
    playlistContexts: track.playlistContexts,
    evidenceWeight: accountEvidenceWeight(track),
  };
}

function selectRepresentativeTracks(tracks: NcmAccountLibraryTrack[], limit: number) {
  const sorted = [...tracks].sort((a, b) => accountEvidenceWeight(b) - accountEvidenceWeight(a));
  const selected: NcmAccountLibraryTrack[] = [];
  const artistCounts = new Map<string, number>();
  for (const track of sorted) {
    const artist = (track.song.ar ?? track.song.artists ?? []).map((item) => item.name).join(" / ") || "未知艺人";
    if ((artistCounts.get(artist) ?? 0) >= 4) continue;
    selected.push(track);
    artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    const selectedIds = new Set(selected.map((track) => track.song.id));
    selected.push(...sorted.filter((track) => !selectedIds.has(track.song.id)).slice(0, limit - selected.length));
  }
  return selected;
}

function accountEvidenceWeight(track: NcmAccountLibraryTrack) {
  const liked = track.sources.includes("liked") ? 1 : 0;
  const repeated = track.playCount > 0 ? Math.min(1, 0.25 + Math.log10(track.playCount + 1) * 0.3) : 0;
  const history = track.sources.includes("history") ? 0.25 : 0;
  return Number(Math.max(liked, repeated, track.playlistWeight, history).toFixed(3));
}

function uniqueRepresentativeTracks<T extends { providerTrackId: string }>(tracks: T[]) {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.providerTrackId)) return false;
    seen.add(track.providerTrackId);
    return true;
  });
}

function toCandidate(song: NcmSong, lane: string, evidence: FeatureEvidence, taste: NcmTasteProfile): TrackCandidate {
  const artists = song.ar?.map((item) => item.name) ?? song.artists?.map((item) => item.name) ?? [];
  const artist = artists.join(" / ") || "未知艺人";
  const familiarity = inferFamiliarity(song.id, artists, taste);
  const inUserLibrary = taste.libraryIds?.has(song.id) ?? false;
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
      languages: evidence.languages,
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
    retrieval: inUserLibrary ? { source: "user_library", fitReason: "来自账号歌单或喜欢列表" } : undefined,
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
  const lyricText = cleanLyricText(lyric);
  return {
    genres,
    lyricDensity,
    energy,
    valence,
    genreSource: wikiGenres.length ? "wiki" : laneGenres.length ? "search" : "inferred",
    lyricSource: lyric ? "lyrics" : instrumentalSignal ? "instrumental-signal" : "inferred",
    energySource: bpm ? "wiki-bpm" : "genre-heuristic",
    languages: inferLanguages(song.name, lyricDensity, lyricText),
    lyricThemes: extractLyricThemes(lyricText),
    narrativeStrength: inferNarrativeStrength(lyricText, song.dt ?? song.duration ?? 0),
    instruments: extractInstruments(song.name, wiki),
    hasLyrics: Boolean(lyricText),
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

function inferLanguages(title: string, lyricDensity: FeatureEvidence["lyricDensity"], lyricText = "") {
  if (lyricDensity === "none") return ["纯音乐"];
  const text = lyricText || title;
  if (/[ぁ-んァ-ン]/.test(text)) return ["日语"];
  if (/[가-힣]/.test(text)) return ["韩语"];
  if (/\p{Script=Han}/u.test(text)) return ["华语"];
  if (/[a-z]{20,}/i.test(text.replace(/\s+/g, ""))) return ["英语"];
  return [];
}

function cleanLyricText(lyric?: NcmLyric | null) {
  if (!lyric || lyric.nolyric) return "";
  return (lyric.lrc?.lyric ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]+]/g, "").trim())
    .filter((line) => line && !/^(作词|作曲|编曲|制作|混音|纯音乐|请欣赏|music)/i.test(line))
    .join("\n");
}

function extractLyricThemes(text: string) {
  if (!text) return [];
  const themes: Array<[string, RegExp]> = [
    ["爱情与关系", /爱|喜欢|恋人|拥抱|亲吻|心动|分手|想你/],
    ["城市与生活", /城市|街道|霓虹|地铁|房间|人群|生活/],
    ["旅行与远方", /旅行|远方|公路|车站|海边|出发|归途|风景/],
    ["成长与青春", /青春|长大|少年|回忆|未来|梦想|岁月/],
    ["自省与孤独", /孤独|寂寞|沉默|一个人|迷惘|遗憾|眼泪/],
    ["治愈与希望", /希望|太阳|黎明|温柔|治愈|明天|勇敢|自由/],
    ["自然与季节", /春天|夏天|秋天|冬天|雨|雪|风|月亮|星空|山|海/],
  ];
  return themes.filter(([, pattern]) => pattern.test(text)).map(([theme]) => theme).slice(0, 5);
}

function inferNarrativeStrength(text: string, durationMs: number) {
  if (!text) return 0;
  const lines = text.split(/\r?\n/).filter(Boolean).length;
  const minutes = Math.max(1, durationMs / 60_000);
  const firstPersonSignals = (text.match(/我|我们|你|他|她/g) ?? []).length;
  return Number(clamp((lines / minutes) / 30 * 0.7 + firstPersonSignals / Math.max(20, lines) * 0.3).toFixed(3));
}

function extractInstruments(title: string, wiki: unknown) {
  const text = `${title} ${wiki ? JSON.stringify(wiki) : ""}`;
  const instruments: Array<[string, RegExp]> = [
    ["钢琴", /钢琴|piano/i], ["吉他", /吉他|guitar/i], ["弦乐", /弦乐|小提琴|大提琴|violin|cello/i],
    ["合成器", /合成器|synth/i], ["鼓", /鼓|drum/i], ["萨克斯", /萨克斯|sax/i], ["笛", /长笛|竹笛|flute/i],
  ];
  return instruments.filter(([, pattern]) => pattern.test(text)).map(([instrument]) => instrument).slice(0, 5);
}

function inferFamiliarity(songId: number, artists: string[], taste: NcmTasteProfile) {
  if (taste.likedIds.has(songId)) return 0.98;
  if (taste.libraryIds?.has(songId)) return 0.88;
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
