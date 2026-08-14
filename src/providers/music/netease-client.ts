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

export interface NcmClient {
  searchSongs(keywords: string, limit: number): Promise<NcmSong[]>;
  getSongDetails(ids: number[]): Promise<{ songs: NcmSong[]; privileges: NcmPrivilege[] }>;
  getPlayback(id: number, level: string): Promise<NcmPlayback>;
}

export class NcmApiClient implements NcmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
    private readonly maxRetries = 2,
  ) {}

  async searchSongs(keywords: string, limit: number) {
    const payload = await this.get<{ code: number; result?: { songs?: NcmSong[] } }>("/cloudsearch", { keywords, type: "1", limit: String(limit), offset: "0" });
    return payload.result?.songs ?? [];
  }

  async getSongDetails(ids: number[]) {
    if (!ids.length) return { songs: [], privileges: [] };
    const payload = await this.get<{ code: number; songs?: NcmSong[]; privileges?: NcmPrivilege[] }>("/song/detail", { ids: ids.join(",") });
    return { songs: payload.songs ?? [], privileges: payload.privileges ?? [] };
  }

  async getPlayback(id: number, level: string) {
    const payload = await this.get<{ code: number; data?: NcmPlayback[] }>("/song/url/v1", { id: String(id), level, unblock: "false", timestamp: String(Date.now()) });
    const playback = payload.data?.[0];
    if (!playback) throw new Error("TRACK_NOT_PLAYABLE");
    return playback;
  }

  private async get<T extends { code?: number }>(pathname: string, params: Record<string, string>): Promise<T> {
    const url = new URL(pathname, ensureTrailingSlash(this.baseUrl));
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.request(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(this.timeoutMs) });
        const payload = await response.json() as T;
        const status = response.ok ? payload.code : response.status;
        if (response.ok && (status === undefined || status === 200)) return payload;
        if (![429, 502, 503, 504].includes(status ?? 0) || attempt === this.maxRetries) throw new Error(`NCM_API_ERROR:${status ?? response.status}`);
      } catch (error) {
        if (attempt === this.maxRetries || (error instanceof Error && error.message.startsWith("NCM_API_ERROR:") && !/:(429|502|503|504)$/.test(error.message))) throw error;
      }
      await delay(500 * 2 ** attempt);
    }
    throw new Error("NCM_API_ERROR:RETRY_EXHAUSTED");
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
