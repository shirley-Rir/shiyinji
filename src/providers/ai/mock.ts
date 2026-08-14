import type { ContextInput, ContextInterpretation, RecommendationBrief, RecommendationPlannerInput, StructuredContext } from "@/src/domain";
import type { AIProvider, RecommendationPlanner } from "./types";

const HIGH_RISK_PATTERN = /自杀|不想活|结束生命|伤害自己/;

export class MockAIProvider implements AIProvider, RecommendationPlanner {
  readonly name = "mock-ai-v1";

  async interpretContext(input: ContextInput): Promise<ContextInterpretation> {
    const text = input.text.trim();
    const context = inferContext(text, Boolean(input.image));
    const needsClarification = context.confidence < 0.55;

    return {
      context,
      clarification: needsClarification ? "你更想保持现在的感觉，还是慢慢走向另一个状态？" : null,
      provider: this.name,
    };
  }

  async planRecommendation(input: RecommendationPlannerInput): Promise<RecommendationBrief> {
    const mode = input.requestedMode === "auto"
      ? input.context.familiarityBias >= 0.76 ? "familiar" : input.context.familiarityBias <= 0.4 ? "explore" : "balanced"
      : input.requestedMode;
    const noLibrary = input.context.hardConstraints.includes("不要歌单内歌曲") || mode === "explore";
    const tracks = [
      ["窗边的慢速清晨", "拾音记演示曲库", "柔和熟悉，适合平稳进入状态"],
      ["柔软的水流", "拾音记演示曲库", "低干扰器乐保持专注"],
      ["雨停之后", "拾音记演示曲库", "克制地承接当下情绪"],
      ["向北的公路", "拾音记演示曲库", "开阔感适合移动场景"],
      ["纸页间的光", "拾音记演示曲库", "稳定节奏适合持续工作"],
    ] as const;
    return {
      discoveryIntent: { mode, noveltyLevel: mode === "explore" ? 0.85 : mode === "familiar" ? 0.15 : 0.5, useAccountProfile: input.profile.personalizationEnabled, allowUserLibrary: !noLibrary, allowAdjacentArtists: true, allowPlatformSearch: true, excludedSources: noLibrary ? ["liked", "playlist"] : [], reason: "根据情境能量与账号音乐画像确定" },
      profileBasis: { profileVersion: input.profileSummary.profileVersion, profileConfidence: input.profileSummary.profileConfidence, matchedPreferenceClusters: input.profileSummary.preferenceClusters.slice(0, 3).map((cluster) => cluster.label), appliedSignals: [...input.profileSummary.accountGenres.slice(0, 3), ...input.profileSummary.lyricThemes.slice(0, 2)], overriddenByCurrentRequest: input.context.hardConstraints },
      desiredSound: { energyRange: [Math.max(0, input.context.targetEnergy - 15), Math.min(100, input.context.targetEnergy + 15)], lyricDensity: input.context.lyricTolerance, genres: input.profileSummary.accountGenres.length ? input.profileSummary.accountGenres : input.profileSummary.likedGenres, moods: input.context.targetMood, instruments: [], tempoWords: ["稳定"], languagePreferences: input.context.languagePreferences },
      searchLanes: [{ lane: "scene", query: `${input.context.activity ?? input.context.targetMood[0] ?? "平静"} 音乐`, weight: 0.7, expectedRole: "top_pick" }, { lane: "fresh", query: `${input.context.targetMood[0] ?? "平静"} 新歌`, weight: 0.3, expectedRole: "exploration" }],
      avoid: { genres: input.profileSummary.dislikedGenres, moods: [], artists: input.profileSummary.dislikedArtists, tracks: [], reasons: input.context.hardConstraints },
      draftTracks: tracks.slice(0, Math.max(5, Math.min(input.draftCount, tracks.length))).map(([title, artist, fitReason]) => ({ title, artist, versionHint: "studio", fitReason, riskNotes: [] })),
      explanationFocus: ["情境匹配", mode === "explore" ? "新鲜探索" : "画像延展"],
      provider: this.name,
    };
  }
}

function inferContext(text: string, hasImage: boolean): StructuredContext {
  const focus = /工作|学习|专注|阅读|写作|整理/.test(text);
  const travel = /旅行|路上|窗外|风景|海边|散步|坐车/.test(text);
  const low = /低落|难过|疲惫|累|乱|焦虑|烦/.test(text);
  const quiet = /安静|平静|不要太吵|放松|慢慢/.test(text);
  const energetic = /有劲|振作|兴奋|运动|跑步/.test(text);
  const noLyrics = /不要歌词|无歌词|纯音乐|少歌词/.test(text);
  const familiar = /熟悉|老歌|听过/.test(text);
  const fresh = /新歌|新鲜|没听过|探索/.test(text);
  const excludeLibrary = /不要.*歌单|不想听.*歌单|别放.*收藏/.test(text);
  const risk = HIGH_RISK_PATTERN.test(text) ? "high" : "none";
  const signals = [focus, travel, low, quiet, energetic, noLyrics, familiar, fresh].filter(Boolean).length;
  const source = hasImage ? (text ? "text_image" : "image") : "text";

  return {
    source,
    requestIntent: "recommendation",
    directPlay: null,
    currentMood: low ? ["疲惫", "低落"] : focus ? ["准备投入"] : travel ? ["期待"] : ["平常"],
    targetMood: energetic ? ["振作"] : focus ? ["专注"] : travel ? ["开阔"] : ["平静"],
    activity: focus ? "工作或学习" : travel ? "旅行途中" : low ? "休息" : null,
    environment: travel ? ["在路上", "开阔"] : hasImage ? ["图片情境"] : [],
    socialState: "unknown",
    valence: low ? -0.35 : energetic ? 0.45 : 0.1,
    arousal: energetic ? 0.78 : focus ? 0.48 : quiet || low ? 0.28 : 0.45,
    targetEnergy: energetic ? 76 : travel ? 58 : focus ? 42 : quiet || low ? 28 : 48,
    lyricTolerance: noLyrics ? "none" : focus ? "low" : "medium",
    familiarityBias: familiar ? 0.88 : fresh || excludeLibrary ? 0.2 : 0.68,
    languagePreferences: [],
    transition: low ? "从疲惫到舒展" : focus ? "从分散到专注" : travel ? "从期待到开阔" : null,
    hardConstraints: [
      ...(noLyrics ? ["不要歌词"] : []),
      ...(/不要太伤感/.test(text) ? ["不要太伤感"] : []),
      ...(excludeLibrary ? ["不要歌单内歌曲"] : []),
    ],
    safetyRisk: risk,
    confidence: Math.min(0.92, (hasImage ? 0.58 : 0.42) + signals * 0.07 + Math.min(text.length, 60) / 300),
  };
}
