import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProfile, type StructuredContext } from "../../src/domain";
import { NeteaseMusicProvider } from "../../src/providers/music/netease";
import type { NcmClient, NcmPlayback, NcmPrivilege, NcmSong } from "../../src/providers/music/netease-client";

const context: StructuredContext = {
  source: "text", currentMood: ["分心"], targetMood: ["专注"], activity: "学习", environment: ["室内"], socialState: "alone",
  valence: 0.1, arousal: 0.4, targetEnergy: 45, lyricTolerance: "none", familiarityBias: 0.5, languagePreferences: [], transition: "从分心到专注", hardConstraints: ["不要歌词"], safetyRisk: "none", confidence: 0.9,
};

class FakeNcmClient implements NcmClient {
  playback: NcmPlayback = { id: 101, url: "https://music.example/101.mp3", type: "mp3", expi: 600, freeTrialInfo: null };
  songs: NcmSong[] = [
    { id: 101, name: "安静书页", dt: 180000, ar: [{ name: "测试艺人" }], al: { name: "测试专辑" } },
    { id: 102, name: "不可播放", dt: 200000, ar: [{ name: "测试艺人二" }] },
  ];
  privileges: NcmPrivilege[] = [
    { id: 101, st: 0, toast: false, plLevel: "standard" },
    { id: 102, st: 0, toast: false, plLevel: "none" },
  ];

  async searchSongs() { return this.songs; }
  async getSongDetails() { return { songs: this.songs, privileges: this.privileges }; }
  async getPlayback() { return this.playback; }
}

test("Netease provider retrieves domain candidates and filters by account playability", async () => {
  const client = new FakeNcmClient();
  const provider = new NeteaseMusicProvider(client);
  const candidates = await provider.retrieveCandidates({ context, profile: createDefaultProfile("test-user"), limit: 10 });
  assert.equal(candidates[0].id, "netease:101");
  assert.equal(candidates[0].features.lyricDensity, "none");
  assert.deepEqual(await provider.filterPlayable(candidates.map((item) => item.id)), ["netease:101"]);
});

test("Netease provider resolves full playback and rejects trial-only URLs", async () => {
  const client = new FakeNcmClient();
  const provider = new NeteaseMusicProvider(client, { playbackLevel: "standard", allowTrial: false });
  const playback = await provider.resolvePlayback("netease:101");
  assert.equal(playback.mimeType, "audio/mpeg");
  client.playback = { ...client.playback, freeTrialInfo: { start: 0, end: 30 } };
  await assert.rejects(() => provider.resolvePlayback("netease:101"), /TRACK_NOT_PLAYABLE/);
});
