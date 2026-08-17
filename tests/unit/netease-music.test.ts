import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProfile, type RecommendationBrief, type StructuredContext } from "../../src/domain";
import { NeteaseMusicProvider, parseNcmLyrics } from "../../src/providers/music/netease";
import { NcmApiClient, type NcmClient, type NcmPlayback, type NcmPrivilege, type NcmSong } from "../../src/providers/music/netease-client";

const context: StructuredContext = {
  source: "text", requestIntent: "recommendation", directPlay: null, currentMood: ["分心"], targetMood: ["专注"], activity: "学习", environment: ["室内"], socialState: "alone",
  valence: 0.1, arousal: 0.4, targetEnergy: 45, lyricTolerance: "none", familiarityBias: 0.5, languagePreferences: [], transition: "从分心到专注", hardConstraints: ["不要歌词"], safetyRisk: "none", confidence: 0.9,
};

class FakeNcmClient implements NcmClient {
  searchQueries: string[] = [];
  playback: NcmPlayback = { id: 101, url: "https://music.example/101.mp3", type: "mp3", expi: 600, freeTrialInfo: null };
  songs: NcmSong[] = [
    { id: 101, name: "安静书页", dt: 180000, ar: [{ name: "测试艺人" }], al: { name: "测试专辑" } },
    { id: 102, name: "不可播放", dt: 200000, ar: [{ name: "测试艺人二" }] },
  ];
  privileges: NcmPrivilege[] = [
    { id: 101, st: 0, toast: false, plLevel: "standard" },
    { id: 102, st: 0, toast: false, plLevel: "none" },
  ];

  async searchSongs(query: string) { this.searchQueries.push(query); return this.songs; }
  async getSongDetails() { return { songs: this.songs, privileges: this.privileges }; }
  async getPlayback() { return this.playback; }
  async getLyrics() { return { nolyric: true }; }
  async getWiki() { return null; }
  async getAccountLibrary() {
    return {
      playlists: [{ id: 1, name: "学习歌单", tags: ["器乐"], subscribed: false, trackCount: 2 }],
      tracks: this.songs.map((song, index) => ({ song, sources: index === 0 ? ["liked" as const, "playlist" as const] : ["playlist" as const], playlistIds: [1], playlistContexts: ["学习歌单", "器乐"], playlistWeight: 0.75, playCount: index === 0 ? 12 : 0 })),
      likedIds: new Set([101]),
      playCounts: new Map([[101, 12]]),
      preferredGenres: ["器乐"],
    };
  }
}

test("Netease provider retrieves domain candidates and filters by account playability", async () => {
  const client = new FakeNcmClient();
  const provider = new NeteaseMusicProvider(client);
  const candidates = await provider.retrieveCandidates({ context, profile: createDefaultProfile("test-user"), limit: 10 });
  assert.equal(candidates[0].id, "netease:101");
  assert.equal(candidates[0].features.lyricDensity, "none");
  assert.equal(candidates[0].features.provenance?.lyricDensity, "lyrics");
  assert.notEqual(candidates[0].features.energy, context.targetEnergy);
  assert.deepEqual(await provider.filterPlayable(candidates.map((item) => item.id)), ["netease:101"]);
});

test("image fallback retrieval carries concrete visual scene evidence into music search", async () => {
  const client = new FakeNcmClient();
  const provider = new NeteaseMusicProvider(client);
  const imageContext: StructuredContext = {
    ...context,
    source: "image",
    currentMood: ["宁静", "开阔"],
    targetMood: ["宁静", "开阔"],
    activity: "徒步",
    environment: ["乡村小路", "绿色植被", "远处山脉"],
    lyricTolerance: "medium",
  };

  await provider.retrieveCandidates({ context: imageContext, profile: createDefaultProfile("test-user"), limit: 10 });

  assert.match(client.searchQueries[0], /徒步/);
  assert.match(client.searchQueries[0], /乡村小路/);
  assert.equal(client.searchQueries.some((query) => query === "情绪陪伴 轻音乐"), false);
});

test("Netease provider derives account familiarity before second-stage ranking", async () => {
  const client = new FakeNcmClient();
  const sessions = {
    async getSession() { return { cookie: "server-only", userId: 7, source: "qr" as const, connectedAt: new Date().toISOString() }; },
    async getTaste() { return { likedIds: new Set([101]), playCounts: new Map(), familiarArtists: new Set<string>(), preferredGenres: ["器乐"] }; },
  };
  const provider = new NeteaseMusicProvider(client, {}, sessions);
  const candidates = await provider.retrieveCandidates({ context, profile: createDefaultProfile("test-user"), limit: 10 });
  assert.equal(candidates[0].features.familiarity, 0.98);
  assert.ok(candidates[0].tags.includes("账号常听"));
  assert.equal(candidates[1].features.familiarity, 0.12);
});

test("Netease provider resolves full playback and rejects trial-only URLs", async () => {
  const client = new FakeNcmClient();
  client.playback = { ...client.playback, url: "http://m801.music.126.net/101.mp3" };
  const provider = new NeteaseMusicProvider(client, { playbackLevel: "standard", allowTrial: false });
  const playback = await provider.resolvePlayback("netease:101");
  assert.equal(playback.mimeType, "audio/mpeg");
  assert.equal(playback.url, "https://m801.music.126.net/101.mp3");
  client.playback = { ...client.playback, id: 102 };
  await assert.rejects(() => provider.resolvePlayback("netease:101"), /TRACK_NOT_PLAYABLE/);
  client.playback = { ...client.playback, id: 101 };
  client.playback = { ...client.playback, freeTrialInfo: { start: 0, end: 30 } };
  await assert.rejects(() => provider.resolvePlayback("netease:101"), /TRACK_NOT_PLAYABLE/);
});

test("authenticated Netease POST requests bypass URL-only response caches", async () => {
  const cache = new Map<string, string>();
  const urls: string[] = [];
  const client = new NcmApiClient("http://ncm.test", async (input, init) => {
    const url = String(input);
    urls.push(url);
    const cached = cache.get(url);
    if (cached) return new Response(cached, { headers: { "Content-Type": "application/json" } });
    const body = JSON.parse(String(init?.body)) as { id: string; cookie: string };
    const payload = JSON.stringify({ code: 200, data: [{ id: Number(body.id), url: `http://music.test/${body.id}.mp3`, freeTrialInfo: null }] });
    cache.set(url, payload);
    return new Response(payload, { headers: { "Content-Type": "application/json" } });
  });

  assert.equal((await client.getPlayback(316100, "standard", "MUSIC_U=secret")).id, 316100);
  assert.equal((await client.getPlayback(28285910, "standard", "MUSIC_U=secret")).id, 28285910);
  assert.notEqual(urls[0], urls[1]);
  assert.equal(urls.some((url) => url.includes("MUSIC_U")), false);
});

test("Netease lyrics parser builds a translated millisecond timeline", () => {
  const lyrics = parseNcmLyrics("netease:101", {
    lrc: { lyric: "[ar:测试艺人]\n[00:01.20]第一行\n[00:03.500][00:05.00]第二行\n[00:07.00]作词：某人" },
    tlyric: { lyric: "[00:01.20]Line one\n[00:03.500]Line two" },
  });

  assert.equal(lyrics.synced, true);
  assert.deepEqual(lyrics.lines, [
    { timeMs: 1200, text: "第一行", translation: "Line one" },
    { timeMs: 3500, text: "第二行", translation: "Line two" },
    { timeMs: 5000, text: "第二行" },
  ]);
});

test("Netease lyrics parser returns an empty state for instrumental tracks", () => {
  assert.deepEqual(parseNcmLyrics("netease:101", { nolyric: true }), { trackId: "netease:101", synced: false, lines: [] });
});

test("Netease provider confirms draft title and artist before accepting a search result", async () => {
  const provider = new NeteaseMusicProvider(new FakeNcmClient());
  const resolutions = await provider.searchAndMatchDraftTracks({
    drafts: [{ title: "安静书页", artist: "测试艺人", versionHint: "studio", fitReason: "适合低干扰学习", riskNotes: [] }],
    brief: recommendationBrief(),
    context,
    profile: createDefaultProfile("test-user"),
  });

  assert.equal(resolutions[0].status, "matched");
  assert.equal(resolutions[0].track?.id, "netease:101");
  assert.ok((resolutions[0].matchScore ?? 0) >= 0.9);
  assert.equal(resolutions[0].track?.retrieval?.fitReason, "适合低干扰学习");
});

test("Netease provider rejects same-title results with the wrong artist", async () => {
  const provider = new NeteaseMusicProvider(new FakeNcmClient());
  const resolutions = await provider.searchAndMatchDraftTracks({
    drafts: [{ title: "安静书页", artist: "完全不同的歌手", versionHint: "studio", fitReason: "测试错配", riskNotes: [] }],
    brief: recommendationBrief(),
    context,
    profile: createDefaultProfile("test-user"),
  });

  assert.equal(resolutions[0].status, "search_mismatch");
  assert.equal(resolutions[0].track, undefined);
});

test("Netease provider removes matched drafts that are not playable", async () => {
  const provider = new NeteaseMusicProvider(new FakeNcmClient());
  const resolutions = await provider.searchAndMatchDraftTracks({
    drafts: [{ title: "不可播放", artist: "测试艺人二", versionHint: "studio", fitReason: "测试版权校验", riskNotes: [] }],
    brief: recommendationBrief(),
    context,
    profile: createDefaultProfile("test-user"),
  });

  assert.equal(resolutions[0].status, "not_playable");
  assert.equal(resolutions[0].track, undefined);
});

test("explore mode rejects a matched song that belongs to the account library", async () => {
  const client = new FakeNcmClient();
  const sessions = {
    async getSession() { return { cookie: "server-only", userId: 7, source: "qr" as const, connectedAt: new Date().toISOString() }; },
    async getTaste() { return { likedIds: new Set<number>(), libraryIds: new Set([101]), playCounts: new Map<number, number>(), familiarArtists: new Set<string>(), preferredGenres: [], representativeTracks: [] }; },
  };
  const provider = new NeteaseMusicProvider(client, {}, sessions);
  const brief = recommendationBrief();
  brief.discoveryIntent = { ...brief.discoveryIntent, mode: "explore", allowUserLibrary: false, excludedSources: ["liked", "playlist"] };
  const resolutions = await provider.searchAndMatchDraftTracks({
    drafts: [{ title: "安静书页", artist: "测试艺人", versionHint: "studio", fitReason: "探索测试", riskNotes: [] }],
    brief,
    context,
    profile: createDefaultProfile("test-user"),
  });

  assert.equal(resolutions[0].status, "violates_constraints");
  assert.equal(resolutions[0].track, undefined);
});

test("Netease provider builds a music profile from account library evidence", async () => {
  const client = new FakeNcmClient();
  const sessions = {
    async getSession() { return { cookie: "server-only", userId: 7, source: "qr" as const, connectedAt: new Date().toISOString() }; },
    async getTaste() { return { likedIds: new Set([101]), libraryIds: new Set([101, 102]), playCounts: new Map([[101, 12]]), familiarArtists: new Set(["测试艺人"]), preferredGenres: ["器乐"], representativeTracks: [] }; },
  };
  const snapshot = await new NeteaseMusicProvider(client, { profileAnalysisLimit: 2 }, sessions).syncAccountMusicProfile(createDefaultProfile("test-user"));

  assert.equal(snapshot.libraryTracks.length, 2);
  assert.equal(snapshot.trackFeatures.length, 2);
  assert.equal(snapshot.profile.sourceCoverage.playlistCount, 1);
  assert.equal(snapshot.profile.sourceCoverage.analyzedTrackCount, 2);
  assert.ok(snapshot.profile.genres.some((genre) => genre.value === "器乐"));
});

test("Netease provider resolves a direct song request without scene retrieval", async () => {
  const provider = new NeteaseMusicProvider(new FakeNcmClient());
  const tracks = await provider.searchDirectTrack({
    request: { title: "安静书页", artist: "测试艺人", versionHint: "studio" },
    profile: createDefaultProfile("test-user"),
  });

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].id, "netease:101");
  assert.equal(tracks[0].retrieval?.source, "direct_request");
  assert.ok((tracks[0].retrieval?.matchScore ?? 0) >= 0.9);
});

test("Netease direct search accepts any artist when the user only names a song", async () => {
  const client = new FakeNcmClient();
  client.songs = [
    client.songs[0],
    { id: 103, name: "安静书页", dt: 190000, ar: [{ name: "另一位艺人" }], al: { name: "另一张专辑" } },
  ];
  client.privileges = [
    client.privileges[0],
    { id: 103, st: 0, toast: false, plLevel: "standard" },
  ];
  const provider = new NeteaseMusicProvider(client);

  const tracks = await provider.searchDirectTrack({ request: { title: "安静书页", artist: null, versionHint: "studio" }, profile: createDefaultProfile("test-user") });
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].title, "安静书页");
});

test("Netease direct search rejects decorated artist names that impersonate the requested artist", async () => {
  const client = new FakeNcmClient();
  client.songs = [{ id: 103, name: "安静书页", dt: 190000, ar: [{ name: "测试艺人-" }], al: { name: "安静书页" } }];
  client.privileges = [{ id: 103, st: 0, toast: false, plLevel: "standard" }];
  const tracks = await new NeteaseMusicProvider(client).searchDirectTrack({
    request: { title: "安静书页", artist: "测试艺人", versionHint: "studio" },
    profile: createDefaultProfile("test-user"),
  });

  assert.deepEqual(tracks, []);
});

test("Netease profile sync reuses intrinsic features without leaking cached playlist context", async () => {
  const client = new FakeNcmClient();
  const sessions = {
    async getSession() { return { cookie: "server-only", userId: 7, source: "qr" as const, connectedAt: new Date().toISOString() }; },
    async getTaste() { return { likedIds: new Set([101]), libraryIds: new Set([101, 102]), playCounts: new Map([[101, 12]]), familiarArtists: new Set(["测试艺人"]), preferredGenres: ["器乐"], representativeTracks: [] }; },
  };
  const snapshot = await new NeteaseMusicProvider(client, { profileAnalysisLimit: 1 }, sessions).syncAccountMusicProfile(
    createDefaultProfile("test-user"),
    {
      async getCachedTrackFeatures() {
        return [{
          provider: "netease",
          providerTrackId: "101",
          genres: ["器乐"],
          languages: [],
          energy: 36,
          valence: 0.1,
          lyricDensity: "none" as const,
          lyricThemes: [],
          narrativeStrength: 0,
          instruments: ["钢琴"],
          playlistContexts: ["另一个账号的私密歌单"],
          provenance: { genres: "wiki" as const },
          confidence: 0.86,
        }];
      },
    },
  );

  assert.deepEqual(snapshot.trackFeatures[0].playlistContexts, ["学习歌单", "器乐"]);
  assert.ok(!snapshot.trackFeatures[0].playlistContexts.includes("另一个账号的私密歌单"));
});

function recommendationBrief(): RecommendationBrief {
  return {
    discoveryIntent: { mode: "balanced", noveltyLevel: 0.5, useAccountProfile: true, allowUserLibrary: true, allowAdjacentArtists: true, allowPlatformSearch: true, excludedSources: [], reason: "测试" },
    profileBasis: { profileVersion: null, profileConfidence: 0, matchedPreferenceClusters: [], appliedSignals: [], overriddenByCurrentRequest: [] },
    desiredSound: { energyRange: [30, 55], lyricDensity: "none", genres: ["器乐"], moods: ["专注"], instruments: [], tempoWords: ["稳定"], languagePreferences: [] },
    searchLanes: [{ lane: "scene", query: "专注 器乐", weight: 1, expectedRole: "top_pick" }],
    avoid: { genres: [], moods: [], artists: [], tracks: [], reasons: [] },
    draftTracks: [],
    explanationFocus: ["专注"],
    provider: "test",
  };
}
