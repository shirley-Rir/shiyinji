import assert from "node:assert/strict";
import test from "node:test";
import { createDirectPlayInterpretation, detectDirectPlayRequest } from "../../src/services/request-intent";

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
});

test("creates a complete direct-play context without invoking a model", () => {
  const interpretation = createDirectPlayInterpretation({ text: "请播放《晴天》" });
  assert.equal(interpretation?.provider, "deterministic-intent-router-v1");
  assert.equal(interpretation?.context.requestIntent, "direct_play");
  assert.equal(interpretation?.context.directPlay?.title, "晴天");
  assert.equal(interpretation?.clarification, null);
});
