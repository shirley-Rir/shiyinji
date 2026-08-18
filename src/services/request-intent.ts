import type { ContextInput, ContextInterpretation, ContextSource, DirectPlayRequest } from "@/src/domain";
import type { LyricIdentification } from "@/src/providers/ai/types";

const DIRECT_COMMANDS = [
  /^(?:请|麻烦)?(?:给我|帮我)?(?:播放|放|来|点)(?:一首|首|一下|歌)?\s*(.+)$/,
  /^(?:我)?(?:想|要)(?:听|播放|放|点)(?:一首|首|一下|歌)?\s*(.+)$/,
  /^(?:听)(?:一首|首|一下)?\s*(.+)$/,
];
const GENERIC_REQUEST = /^(?:点|来|放|听)?(?:一?点|一些|几首)?(?:适合.+的)?(?:安静|舒缓|开心|伤感|专注|学习|工作|旅行|睡眠|运动|治愈|纯|轻|新|老|华语|中文|英文|粤语|日语|韩语)*(?:的)?(?:歌|歌曲|音乐)$/;

export function detectDirectPlayRequest(input: string): DirectPlayRequest | null {
  const text = input.trim().replace(/[。！？!?]+$/g, "").trim();
  if (!text) return null;

  const quotedTitle = /《([^》]{1,120})》/.exec(text)?.[1]?.trim();
  const commandPayload = DIRECT_COMMANDS.map((pattern) => pattern.exec(text)?.[1]?.trim()).find(Boolean);
  if (!commandPayload) return null;
  let payload = quotedTitle ?? commandPayload;
  payload = payload.replace(/^(?:歌曲|歌)\s*[：:]?\s*/, "").replace(/(?:可以吗|好吗|行吗|吧|谢谢)$/g, "").trim();
  if (!payload || /推荐|随便|一些|一点|什么歌|歌单|这首歌|那首歌|之类的?$/.test(payload) || GENERIC_REQUEST.test(payload)) return null;

  const versionHint = inferVersionHint(payload);
  payload = payload.replace(/\s*(?:的)?(?:Live|现场版|演唱会版|不插电版|Acoustic|Remix|混音版)\s*$/i, "").trim();
  const artistAndTitle = extractArtistAndTitle(payload);
  const title = artistAndTitle.title.replace(/^[《“"']|[》”"']$/g, "").trim();
  if (!title || title.length > 120) return null;
  return { title, artist: artistAndTitle.artist, versionHint };
}

export function createDirectPlayInterpretation(input: ContextInput): ContextInterpretation | null {
  const directPlay = detectDirectPlayRequest(input.text);
  if (!directPlay) return null;
  return {
    context: {
      source: sourceOf(input),
      requestIntent: "direct_play",
      directPlay,
      currentMood: ["点歌"],
      targetMood: ["播放指定歌曲"],
      activity: null,
      environment: [],
      socialState: "unknown",
      valence: 0,
      arousal: 0.5,
      targetEnergy: 50,
      lyricTolerance: "high",
      familiarityBias: 0.5,
      languagePreferences: [],
      transition: null,
      hardConstraints: [],
      safetyRisk: "none",
      confidence: 0.99,
    },
    clarification: null,
    provider: "deterministic-intent-router-v1",
  };
}

export function isLyricLookupCandidate(text: string) {
  const compact = text.replace(/\s+/g, "").replace(/[，。！？、；：“”‘’"'《》]/g, "");
  if (compact.length < 8 || compact.length > 300) return false;
  if (/歌词|歌名|哪首歌|什么歌|这首歌|找歌/.test(text)) return true;
  const contextualRequest = /^(今天|现在|此刻|正在|我在)|推荐|学习|工作|旅行|开车|跑步|心情|感觉|有点|想听|给我/.test(text);
  return !contextualRequest && (/[\n\r]/.test(text) || compact.length >= 14);
}

export function createLyricDirectPlayInterpretation(input: ContextInput, match: LyricIdentification): ContextInterpretation {
  return {
    context: {
      source: sourceOf(input),
      requestIntent: "direct_play",
      directPlay: { title: match.title, artist: match.artist, versionHint: "any" },
      currentMood: ["歌词识别"],
      targetMood: ["播放识别歌曲"],
      activity: null,
      environment: [],
      socialState: "unknown",
      valence: 0,
      arousal: 0.5,
      targetEnergy: 50,
      lyricTolerance: "high",
      familiarityBias: 0.5,
      languagePreferences: [],
      transition: null,
      hardConstraints: [],
      safetyRisk: "none",
      confidence: match.confidence,
    },
    clarification: null,
    provider: "lyrics-identifier-v1",
  };
}

function extractArtistAndTitle(payload: string) {
  const sungBy = /^(?:歌手)?\s*(.{1,40}?)(?:唱的|演唱的)\s*(.{1,120})$/.exec(payload);
  if (sungBy) return { artist: sungBy[1].trim(), title: sungBy[2].trim() };
  const separator = /^(.{1,40}?)\s*[-—–]\s*(.{1,120})$/.exec(payload);
  if (separator) return { artist: separator[1].trim(), title: separator[2].trim() };
  const possessive = /^([^的]{2,12})的(.{1,80})$/.exec(payload);
  if (possessive && !/^(我们|你们|他们|她们|大家|自己)$/.test(possessive[1])) {
    return { artist: possessive[1].trim(), title: possessive[2].trim() };
  }
  return { artist: null, title: payload };
}

function inferVersionHint(payload: string): DirectPlayRequest["versionHint"] {
  if (/live|现场|演唱会/i.test(payload)) return "live";
  if (/acoustic|不插电/i.test(payload)) return "acoustic";
  if (/remix|混音/i.test(payload)) return "remix";
  return "studio";
}

function sourceOf(input: ContextInput): ContextSource {
  if (input.image) return input.text.trim() ? "text_image" : "image";
  return "text";
}
