import assert from "node:assert/strict";
import test from "node:test";
import { createDirectPlayInterpretation, createLyricDirectPlayInterpretation, detectDirectPlayRequest, isLyricLookupCandidate } from "../../src/services/request-intent";

test("detects explicit direct song commands before semantic recommendation", () => {
  assert.deepEqual(detectDirectPlayRequest("给我放首晴天"), { title: "晴天", artist: null, versionHint: "studio" });
  assert.deepEqual(detectDirectPlayRequest("播放《富士山下》"), { title: "富士山下", artist: null, versionHint: "studio" });
  assert.deepEqual(detectDirectPlayRequest("放首周杰伦的晴天"), { title: "晴天", artist: "周杰伦", versionHint: "studio" });
  assert.deepEqual(detectDirectPlayRequest("我想听陈奕迅 - 浮夸 Live"), { title: "浮夸", artist: "陈奕迅", versionHint: "live" });
  assert.deepEqual(detectDirectPlayRequest("帮我点一首七里香"), { title: "七里香", artist: null, versionHint: "studio" });
});

test("keeps generic music descriptions in recommendation mode", () => {
  assert.equal(detectDirectPlayRequest("放首安静的歌"), null);
  assert.equal(detectDirectPlayRequest("想听一点适合工作的音乐"), null);
  assert.equal(detectDirectPlayRequest("推荐一些没听过的新歌"), null);
  assert.equal(detectDirectPlayRequest("读《百年孤独》时放什么音乐"), null);
  assert.equal(detectDirectPlayRequest("放首摇滚之类的"), null);
  assert.equal(detectDirectPlayRequest("我想听这首歌"), null);
});

test("creates a complete direct-play context without invoking a model", () => {
  const interpretation = createDirectPlayInterpretation({ text: "请播放《晴天》" });
  assert.equal(interpretation?.provider, "deterministic-intent-router-v1");
  assert.equal(interpretation?.context.requestIntent, "direct_play");
  assert.equal(interpretation?.context.directPlay?.title, "晴天");
  assert.equal(interpretation?.clarification, null);
});

test("routes likely lyric fragments into a verified direct-play request", () => {
  assert.equal(isLyricLookupCandidate("我曾经跨过山和大海，也穿过人山人海"), true);
  assert.equal(isLyricLookupCandidate("今天加班有点累，推荐点轻松的歌"), false);
  assert.equal(isLyricLookupCandidate("这段歌词是什么歌：我曾经跨过山和大海"), true);

  const interpretation = createLyricDirectPlayInterpretation(
    { text: "我曾经跨过山和大海" },
    { title: "平凡之路", artist: "朴树", confidence: 0.94 },
  );
  assert.equal(interpretation.context.requestIntent, "direct_play");
  assert.deepEqual(interpretation.context.directPlay, { title: "平凡之路", artist: "朴树", versionHint: "any" });
});
