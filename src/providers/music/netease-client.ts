export type NcmSong = {
  id: number;
  name: string;
  dt?: number;
  duration?: number;
  fee?: number;
  ar?: Array<{ name: string }>;
  artists?: Array<{ name: string }>;
  al?: { name?: string; picUrl?: string };
  album?: { name?: string; picUrl?: string };
  publishTime?: number;
};

export type NcmPlaylist = {
  id: number;
  name: string;
  tags: string[];
  subscribed: boolean;
  trackCount: number;
};

export type NcmAccountLibraryTrack = {
  song: NcmSong;
  sources: Array<"liked" | "playlist" | "history">;
  playlistIds: number[];
  playlistContexts: string[];
  playlistWeight: number;
  playCount: number;
};

export type NcmAccountLibrary = {
  playlists: NcmPlaylist[];
  tracks: NcmAccountLibraryTrack[];
  likedIds: Set<number>;
  playCounts: Map<number, number>;
  preferredGenres: string[];
};

export type NcmPrivilege = {
  id: number;
  st?: number;
  toast?: boolean;
  plLevel?: string;
  flLevel?: string;
};

export type NcmPlayback = {
  id: number;
  url: string | null;
  type?: string;
  level?: string;
  expi?: number;
  freeTrialInfo?: unknown;
};

export type NcmLyric = {
  nolyric?: boolean;
  uncollected?: boolean;
  lrc?: { lyric?: string };
  tlyric?: { lyric?: string };
};

export type NcmTasteProfile = {
  likedIds: Set<number>;
  libraryIds?: Set<number>;
  playCounts: Map<number, number>;
  familiarArtists: Set<string>;
  preferredGenres: string[];
  representativeTracks?: Array<{ id: number; title: string; artist: string; source: "liked" | "playlist" | "history" }>;
};

export interface NcmClient {
  searchSongs(keywords: string, limit: number, cookie?: string): Promise<NcmSong[]>;
  getSongDetails(ids: number[], cookie?: string): Promise<{ songs: NcmSong[]; privileges: NcmPrivilege[] }>;
  getPlayback(id: number, level: string, cookie?: string): Promise<NcmPlayback>;
  getLyrics(id: number): Promise<NcmLyric>;
  getWiki(id: number): Promise<unknown>;
  getAccountLibrary?(userId: number, cookie: string): Promise<NcmAccountLibrary>;
}

export class NcmApiClient implements NcmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
    private readonly maxRetries = 2,
  ) {}

  async searchSongs(keywords: string, limit: number, cookie?: string) {
    const payload = await this.call<{ code: number; result?: { songs?: NcmSong[] } }>("/cloudsearch", { keywords, type: "1", limit: String(limit), offset: "0" }, cookie);
    return payload.result?.songs ?? [];
  }

  async getSongDetails(ids: number[], cookie?: string) {
    if (!ids.length) return { songs: [], privileges: [] };
    const payload = await this.call<{ code: number; songs?: NcmSong[]; privileges?: NcmPrivilege[] }>("/song/detail", { ids: ids.join(",") }, cookie);
    return { songs: payload.songs ?? [], privileges: payload.privileges ?? [] };
  }

  async getPlayback(id: number, level: string, cookie?: string) {
    const payload = await this.call<{ code: number; data?: NcmPlayback[] }>("/song/url/v1", { id: String(id), level, unblock: "false", timestamp: String(Date.now()) }, cookie);
    const playback = payload.data?.[0];
    if (!playback || playback.id !== id) throw new Error("TRACK_NOT_PLAYABLE");
    return playback;
  }

  async getLyrics(id: number) {
    return this.call<NcmLyric & { code: number }>("/lyric", { id: String(id) }, undefined, "GET", [200], 0, 3_000);
  }

  async getWiki(id: number) {
    const payload = await this.call<{ code: number; data?: unknown }>("/song/wiki/summary", { id: String(id) }, undefined, "GET", [200], 0, 3_000);
    return payload.data ?? null;
  }

  async loginWithPhone(phone: string, md5Password: string) {
    const payload = await this.call<{ code: number; cookie?: string; account?: { id?: number }; profile?: { userId?: number } }>(
      "/login/cellphone",
      { phone, md5_password: md5Password, timestamp: String(Date.now()) },
      undefined,
      "POST",
    );
    const userId = payload.account?.id ?? payload.profile?.userId;
    if (!payload.cookie || !userId) throw new Error("NCM_LOGIN_INCOMPLETE");
    return { cookie: payload.cookie, userId };
  }

  async createQr() {
    const keyPayload = await this.call<{ code: number; data?: { unikey?: string } }>("/login/qr/key", { timestamp: String(Date.now()) });
    const key = keyPayload.data?.unikey;
    if (!key) throw new Error("NCM_QR_KEY_UNAVAILABLE");
    const imagePayload = await this.call<{ code: number; data?: { qrimg?: string } }>("/login/qr/create", { key, qrimg: "true", timestamp: String(Date.now()) });
    const qrImage = imagePayload.data?.qrimg;
    if (!qrImage) throw new Error("NCM_QR_IMAGE_UNAVAILABLE");
    return { key, qrImage };
  }

  async checkQr(key: string) {
    const payload = await this.call<{ code: number; cookie?: string }>("/login/qr/check", { key, noCookie: "true", timestamp: String(Date.now()) }, undefined, "GET", [800, 801, 802, 803]);
    return { code: payload.code, cookie: payload.cookie };
  }

  async getLoginStatus(cookie: string) {
    const payload = await this.call<{ code?: number; data?: { account?: { id?: number }; profile?: { userId?: number } }; account?: { id?: number }; profile?: { userId?: number } }>("/login/status", { timestamp: String(Date.now()) }, cookie, "POST", [200, undefined]);
    const userId = payload.data?.account?.id ?? payload.data?.profile?.userId ?? payload.account?.id ?? payload.profile?.userId;
    if (!userId) throw new Error("NCM_LOGIN_STATUS_INVALID");
    return { userId };
  }

  async getTasteProfile(userId: number, cookie: string): Promise<NcmTasteProfile> {
    const library = await this.getAccountLibrary(userId, cookie);
    const artistScores = new Map<string, number>();
    for (const track of library.tracks) {
      const score = Math.max(1, track.playCount, track.sources.includes("liked") ? 8 : 0, track.sources.includes("playlist") ? 4 : 0);
      for (const artist of artistsOf(track.song)) artistScores.set(artist, (artistScores.get(artist) ?? 0) + score);
    }
    const representativeTracks = [...library.tracks]
      .sort((a, b) => tasteEvidenceWeight(b) - tasteEvidenceWeight(a))
      .slice(0, 40)
      .map((track) => ({ id: track.song.id, title: track.song.name, artist: artistsOf(track.song).join(" / ") || "未知艺人", source: primarySource(track.sources) }));
    return {
      likedIds: library.likedIds,
      libraryIds: new Set(library.tracks.filter((track) => track.sources.includes("liked") || track.sources.includes("playlist")).map((track) => track.song.id)),
      playCounts: library.playCounts,
      familiarArtists: new Set([...artistScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([artist]) => artist)),
      preferredGenres: library.preferredGenres,
      representativeTracks,
    };
  }

  async getAccountLibrary(userId: number, cookie: string): Promise<NcmAccountLibrary> {
    const [likes, records, playlists, styles] = await Promise.all([
      this.safeCall<{ ids?: number[] }>("/likelist", { uid: String(userId) }, cookie),
      this.safeCall<{ allData?: Array<{ song?: NcmSong; playCount?: number; score?: number }>; weekData?: Array<{ song?: NcmSong; playCount?: number; score?: number }> }>("/user/record", { uid: String(userId), type: "0" }, cookie),
      this.getUserPlaylists(userId, cookie),
      this.safeCall<unknown>("/style/preference", {}, cookie),
    ]);
    const likedIds = new Set(likes?.ids ?? []);
    const recordRows = records?.allData ?? records?.weekData ?? [];
    const playlistSongs = await mapWithConcurrency(playlists.slice(0, 30), 3, async (playlist) => ({
      playlist,
      songs: await this.getPlaylistSongs(playlist, cookie),
    }));
    const tracks = new Map<number, MutableLibraryTrack>();
    const ensureTrack = (song: NcmSong) => {
      const existing = tracks.get(song.id);
      if (existing) return existing;
      const created: MutableLibraryTrack = { song, sources: new Set(), playlistIds: new Set(), playlistContexts: new Set(), playlistWeight: 0, playCount: 0 };
      tracks.set(song.id, created);
      return created;
    };
    for (const { playlist, songs } of playlistSongs) {
      const playlistWeight = playlist.subscribed ? 0.5 : 0.75;
      for (const song of songs) {
        const track = ensureTrack(song);
        track.sources.add("playlist");
        track.playlistIds.add(playlist.id);
        track.playlistWeight = Math.max(track.playlistWeight, playlistWeight);
        for (const context of [playlist.name, ...playlist.tags]) if (context) track.playlistContexts.add(context);
      }
    }
    const missingLiked = [...likedIds].filter((id) => !tracks.has(id)).slice(0, 1000);
    for (const ids of chunks(missingLiked, 200)) {
      const details = await this.getSongDetails(ids, cookie).catch(() => ({ songs: [], privileges: [] }));
      for (const song of details.songs) ensureTrack(song);
    }
    for (const id of likedIds) {
      const track = tracks.get(id);
      if (track) track.sources.add("liked");
    }
    const playCounts = new Map<number, number>();
    for (const row of recordRows) {
      if (!row.song?.id) continue;
      const count = Math.max(row.playCount ?? 0, Math.round((row.score ?? 0) / 10));
      playCounts.set(row.song.id, count);
      const track = ensureTrack(row.song);
      track.sources.add("history");
      track.playCount = count;
    }
    return {
      playlists,
      tracks: [...tracks.values()].map((track) => ({ ...track, sources: [...track.sources], playlistIds: [...track.playlistIds], playlistContexts: [...track.playlistContexts] })),
      likedIds,
      playCounts,
      preferredGenres: [...new Set([...extractStyleNames(styles), ...playlists.flatMap((playlist) => playlist.tags)])].slice(0, 30),
    };
  }

  private async getUserPlaylists(userId: number, cookie: string) {
    const playlists: NcmPlaylist[] = [];
    for (let offset = 0; offset < 300; offset += 100) {
      const payload = await this.safeCall<{ more?: boolean; playlist?: Array<{ id?: number; name?: string; tags?: string[]; subscribed?: boolean; trackCount?: number }> }>(
        "/user/playlist",
        { uid: String(userId), limit: "100", offset: String(offset) },
        cookie,
      );
      const page = (payload?.playlist ?? []).flatMap((playlist) => playlist.id ? [{ id: playlist.id, name: playlist.name ?? "未命名歌单", tags: playlist.tags ?? [], subscribed: Boolean(playlist.subscribed), trackCount: playlist.trackCount ?? 0 }] : []);
      playlists.push(...page);
      if (!payload?.more || page.length < 100) break;
    }
    return playlists;
  }

  private async getPlaylistSongs(playlist: NcmPlaylist, cookie: string) {
    const songs: NcmSong[] = [];
    const total = Math.min(Math.max(playlist.trackCount, 200), 2000);
    for (let offset = 0; offset < total; offset += 200) {
      const payload = await this.safeCall<{ songs?: NcmSong[] }>("/playlist/track/all", { id: String(playlist.id), limit: "200", offset: String(offset) }, cookie);
      const page = payload?.songs ?? [];
      songs.push(...page);
      if (page.length < 200) break;
    }
    return songs;
  }

  private async safeCall<T>(pathname: string, params: Record<string, string>, cookie: string): Promise<T | null> {
    try { return await this.call<T & { code?: number }>(pathname, params, cookie, "POST", [200, undefined]); } catch { return null; }
  }

  private async call<T extends { code?: number }>(
    pathname: string,
    params: Record<string, string>,
    cookie?: string,
    method: "GET" | "POST" = cookie ? "POST" : "GET",
    acceptedCodes: Array<number | undefined> = [200],
    requestMaxRetries = this.maxRetries,
    requestTimeoutMs = this.timeoutMs,
  ): Promise<T> {
    const url = new URL(pathname, ensureTrailingSlash(this.baseUrl));
    const requestParams = { ...params, ...(cookie ? { cookie } : {}) };
    if (method === "GET") for (const [key, value] of Object.entries(requestParams)) url.searchParams.set(key, value);
    else url.searchParams.set("_shiyinji_nonce", crypto.randomUUID());
    for (let attempt = 0; attempt <= requestMaxRetries; attempt += 1) {
      try {
        const response = await this.request(url, {
          method,
          headers: { Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
          body: method === "POST" ? JSON.stringify(requestParams) : undefined,
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        const payload = await response.json() as T;
        const status = response.ok ? payload.code : (payload.code ?? response.status);
        if (response.ok && acceptedCodes.includes(status)) return payload;
        if (![429, 502, 503, 504].includes(status ?? 0) || attempt === requestMaxRetries) throw new Error(`NCM_API_ERROR:${status ?? response.status}`);
      } catch (error) {
        if (attempt === requestMaxRetries || (error instanceof Error && error.message.startsWith("NCM_API_ERROR:") && !/:(429|502|503|504)$/.test(error.message))) throw error;
      }
      await delay(500 * 2 ** attempt);
    }
    throw new Error("NCM_API_ERROR:RETRY_EXHAUSTED");
  }
}

function artistsOf(song: NcmSong) {
  return (song.ar ?? song.artists ?? []).map((artist) => artist.name).filter(Boolean);
}

type MutableLibraryTrack = {
  song: NcmSong;
  sources: Set<"liked" | "playlist" | "history">;
  playlistIds: Set<number>;
  playlistContexts: Set<string>;
  playlistWeight: number;
  playCount: number;
};

function tasteEvidenceWeight(track: NcmAccountLibraryTrack) {
  return Math.max(track.sources.includes("liked") ? 1 : 0, track.playlistWeight, track.playCount > 0 ? Math.min(1, 0.25 + Math.log10(track.playCount + 1) * 0.3) : 0.25);
}

function primarySource(sources: NcmAccountLibraryTrack["sources"]): "liked" | "playlist" | "history" {
  if (sources.includes("liked")) return "liked";
  if (sources.includes("playlist")) return "playlist";
  return "history";
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
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

function extractStyleNames(value: unknown) {
  const names: string[] = [];
  visit(value);
  return [...new Set(names)].filter((name) => name.length <= 30).slice(0, 20);

  function visit(node: unknown) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    if (("tagId" in object || "styleId" in object) && typeof (object.tagName ?? object.name ?? object.title) === "string") {
      names.push(String(object.tagName ?? object.name ?? object.title));
    }
    for (const child of Object.values(object)) visit(child);
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
