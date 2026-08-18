import type { ContextInput, ContextInterpretation, ContextSource, RecommendationBrief, RecommendationPlannerInput, StructuredContext } from "@/src/domain";
import type { AIProvider, LyricsIdentifier, RecommendationPlanner } from "./types";
import { CONTEXT_INTERPRETER_PROMPT, LYRIC_IDENTIFICATION_PROMPT, RECOMMENDATION_PLANNER_PROMPT } from "./prompt";
import { modelInterpretationSchema, modelLyricIdentificationSchema, modelRecommendationBriefSchema, type ModelInterpretation, type ModelRecommendationBrief } from "./schema";

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  visionModel?: string;
  visionFallbackModel?: string;
  thinking?: "enabled" | "disabled";
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  fetch?: typeof fetch;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export class OpenAICompatibleAIProvider implements AIProvider, LyricsIdentifier, RecommendationPlanner {
  readonly name: string;
  private readonly request: typeof fetch;

  constructor(private readonly config: ProviderConfig) {
    this.name = `real-ai:${config.textModel}`;
    this.request = config.fetch ?? fetch;
  }

  async interpretContext(input: ContextInput): Promise<ContextInterpretation> {
    const hasImage = Boolean(input.image?.url || input.image?.dataUrl);
    let model = hasImage ? this.config.visionModel : this.config.textModel;
    if (!model) throw new Error("AI_VISION_MODEL_REQUIRED");

    let parsed: ModelInterpretation;
    try {
      const raw = await this.complete(model, CONTEXT_INTERPRETER_PROMPT, userContent(input), !hasImage, 1200, 0.1, hasImage ? 1 : undefined, hasImage);
      parsed = parseInterpretation(raw);
    } catch (error) {
      const fallbackModel = this.config.visionFallbackModel;
      if (!hasImage || !fallbackModel || fallbackModel === model || !isVisionFallbackError(error)) throw error;
      console.warn("[shiyinji-ai] primary vision model unavailable; using vision fallback", {
        provider: this.name,
        model,
        fallbackModel,
        reason: safeProviderReason(error),
      });
      model = fallbackModel;
      const raw = await this.complete(model, CONTEXT_INTERPRETER_PROMPT, userContent(input), false, 800, 0.1, undefined, true);
      parsed = parseInterpretation(raw);
    }
    return {
      context: applyDeterministicGuards(toStructuredContext(parsed, sourceOf(input)), input.text),
      clarification: parsed.clarification,
      provider: `real-ai:${model}`,
    };
  }

  async planRecommendation(input: RecommendationPlannerInput): Promise<RecommendationBrief> {
    const raw = await this.complete(
      this.config.textModel,
      RECOMMENDATION_PLANNER_PROMPT,
      recommendationPlannerContent(input),
      true,
      3600,
      0.35,
    );
    let parsed: ModelRecommendationBrief;
    try {
      parsed = modelRecommendationBriefSchema.parse(JSON.parse(stripCodeFence(raw)));
    } catch {
      throw new Error("AI_PROVIDER_INVALID_RECOMMENDATION_BRIEF");
    }
    return guardRecommendationBrief(toRecommendationBrief(parsed, `real-ai:${this.config.textModel}`, input), input);
  }

  async identifyLyrics(text: string) {
    const raw = await this.complete(
      this.config.textModel,
      LYRIC_IDENTIFICATION_PROMPT,
      JSON.stringify({ user_input: text.trim() }),
      true,
      240,
      0,
    );
    let parsed: { is_lyrics: boolean; title: string | null; artist: string | null; confidence: number };
    try {
      parsed = modelLyricIdentificationSchema.parse(JSON.parse(stripCodeFence(raw)));
    } catch {
      throw new Error("AI_PROVIDER_INVALID_LYRIC_IDENTIFICATION");
    }
    if (!parsed.is_lyrics || !parsed.title || parsed.confidence < 0.86) return null;
    return { title: parsed.title, artist: parsed.artist, confidence: parsed.confidence };
  }

  private async complete(model: string, systemPrompt: string, content: unknown, jsonResponse: boolean, maxTokens: number, temperature: number, retryLimit?: number, multimodal = false): Promise<string> {
    const maxRetries = Math.min(this.config.maxRetries ?? 2, retryLimit ?? Number.POSITIVE_INFINITY);
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let response: Response;
      try {
        response = await this.request(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: multimodal
              ? [{ role: "user", content: multimodalUserContent(systemPrompt, content) }]
              : [{ role: "system", content: systemPrompt }, { role: "user", content }],
            ...(jsonResponse ? { response_format: { type: "json_object" } } : {}),
            ...(this.config.thinking ? { thinking: { type: this.config.thinking } } : {}),
            temperature,
            max_tokens: maxTokens,
            stream: false,
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
        });
      } catch {
        if (attempt === maxRetries) throw new Error("AI_PROVIDER_NETWORK_ERROR");
        await delay((this.config.retryBaseMs ?? 1000) * 2 ** attempt);
        continue;
      }

      let payload: ChatCompletionResponse;
      try {
        payload = await response.json() as ChatCompletionResponse;
      } catch {
        throw new Error(`AI_PROVIDER_ERROR:${response.status}`);
      }
      if (response.ok) {
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
        return content;
      }
      if (![429, 502, 503, 504].includes(response.status) || attempt === maxRetries) {
        throw new Error(`AI_PROVIDER_ERROR:${response.status}`);
      }
      const retryAfterMs = Number(response.headers.get("retry-after") ?? 0) * 1000;
      await delay(Math.max(retryAfterMs, (this.config.retryBaseMs ?? 1000) * 2 ** attempt));
    }
    throw new Error("AI_PROVIDER_RETRY_EXHAUSTED");
  }
}

function recommendationPlannerContent(input: RecommendationPlannerInput) {
  return JSON.stringify({
    requested_mode: input.requestedMode,
    draft_count: input.draftCount,
    context: input.context,
    context_evidence: contextEvidence(input.context),
    profile_summary: input.profileSummary,
  });
}

function contextEvidence(context: StructuredContext) {
  return {
    source: context.source,
    atmosphere: [...context.currentMood, ...context.targetMood],
    activity: context.activity,
    visual_environment: context.environment,
    dynamics: { arousal: context.arousal, target_energy: context.targetEnergy, valence: context.valence },
    transition: context.transition,
    hard_constraints: context.hardConstraints,
  };
}

function toRecommendationBrief(value: ModelRecommendationBrief, provider: string, input: RecommendationPlannerInput): RecommendationBrief {
  return {
    discoveryIntent: {
      mode: value.discovery_intent.mode,
      noveltyLevel: value.discovery_intent.novelty_level,
      useAccountProfile: input.profile.personalizationEnabled,
      allowUserLibrary: value.discovery_intent.allow_user_library,
      allowAdjacentArtists: value.discovery_intent.allow_adjacent_artists,
      allowPlatformSearch: value.discovery_intent.allow_platform_search,
      excludedSources: value.discovery_intent.excluded_sources,
      reason: value.discovery_intent.reason,
    },
    profileBasis: {
      profileVersion: input.profileSummary.profileVersion,
      profileConfidence: input.profileSummary.profileConfidence,
      matchedPreferenceClusters: input.profileSummary.preferenceClusters.slice(0, 4).map((cluster) => cluster.label),
      appliedSignals: [...input.profileSummary.accountGenres.slice(0, 5), ...input.profileSummary.lyricThemes.slice(0, 3)],
      overriddenByCurrentRequest: input.context.hardConstraints,
    },
    desiredSound: {
      energyRange: value.desired_sound.energy_range,
      lyricDensity: value.desired_sound.lyric_density,
      genres: value.desired_sound.genres,
      moods: value.desired_sound.moods,
      instruments: value.desired_sound.instruments,
      tempoWords: value.desired_sound.tempo_words,
      languagePreferences: value.desired_sound.language_preferences,
    },
    searchLanes: value.search_lanes.map((lane) => ({ lane: lane.lane, query: lane.query, weight: lane.weight, expectedRole: lane.expected_role })),
    avoid: value.avoid,
    draftTracks: value.draft_tracks.map((track) => ({ title: track.title, artist: track.artist, album: track.album, versionHint: track.version_hint, fitReason: track.fit_reason, riskNotes: track.risk_notes })),
    explanationFocus: value.explanation_focus,
    provider,
  };
}

function guardRecommendationBrief(brief: RecommendationBrief, input: RecommendationPlannerInput): RecommendationBrief {
  const explicitNoLibrary = input.context.hardConstraints.includes("不要歌单内歌曲");
  const mode = input.requestedMode === "auto" ? brief.discoveryIntent.mode : input.requestedMode;
  const allowUserLibrary = explicitNoLibrary ? false : brief.discoveryIntent.allowUserLibrary;
  const libraryKeys = new Set(input.profileSummary.representativeTracks
    .filter((track) => track.source === "liked" || track.source === "playlist")
    .map((track) => trackKey(track.title, track.artist)));
  const seen = new Set<string>();
  const draftTracks = brief.draftTracks.filter((track) => {
    const key = trackKey(track.title, track.artist ?? "");
    if (seen.has(key)) return false;
    seen.add(key);
    return allowUserLibrary || !libraryKeys.has(key);
  }).slice(0, input.draftCount);
  return {
    ...brief,
    discoveryIntent: {
      ...brief.discoveryIntent,
      mode,
      useAccountProfile: input.profile.personalizationEnabled,
      allowUserLibrary,
      excludedSources: allowUserLibrary
        ? brief.discoveryIntent.excludedSources
        : [...new Set([...brief.discoveryIntent.excludedSources, "liked" as const, "playlist" as const])],
    },
    desiredSound: {
      ...brief.desiredSound,
      energyRange: brief.desiredSound.energyRange[0] <= brief.desiredSound.energyRange[1]
        ? brief.desiredSound.energyRange
        : [brief.desiredSound.energyRange[1], brief.desiredSound.energyRange[0]],
      lyricDensity: input.context.lyricTolerance === "none" ? "none" : brief.desiredSound.lyricDensity,
    },
    draftTracks,
  };
}

function trackKey(title: string, artist: string) {
  return `${title}|${artist}`.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function userContent(input: ContextInput) {
  const text = input.text.trim() || "用户没有提供文字，请仅根据图片中可观察的信息理解此刻情境。";
  const contextText = `用户输入：${text}\n用户时区：${input.timezone ?? "unknown"}`;
  const imageUrl = input.image?.url ?? (input.image?.dataUrl ? base64Image(input.image.dataUrl) : undefined);
  if (!imageUrl) return contextText;
  return [
    { type: "image_url", image_url: { url: imageUrl } },
    { type: "text", text: contextText },
  ];
}

function multimodalUserContent(systemPrompt: string, content: unknown) {
  if (!Array.isArray(content)) return `${systemPrompt}\n\n${String(content)}`;
  return content.map((item) => {
    if (!item || typeof item !== "object" || !("type" in item) || item.type !== "text" || !("text" in item)) return item;
    return { ...item, text: `${systemPrompt}\n\n${String(item.text)}` };
  });
}

function base64Image(dataUrl: string) {
  return dataUrl.replace(/^data:image\/(?:jpeg|png|webp);base64,/i, "");
}

function isVisionFallbackError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message === "AI_PROVIDER_RETRY_EXHAUSTED"
    || error.message === "AI_PROVIDER_NETWORK_ERROR"
    || error.message === "AI_PROVIDER_EMPTY_RESPONSE"
    || error.message === "AI_PROVIDER_INVALID_RESPONSE"
    || /^AI_PROVIDER_ERROR:(429|502|503|504)$/.test(error.message);
}

function safeProviderReason(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  return error.message.match(/^AI_PROVIDER_ERROR:(\d{3})$/)?.[1]
    ?? error.message.replace(/^AI_PROVIDER_/, "").toLowerCase();
}

function sourceOf(input: ContextInput): ContextSource {
  if (input.image?.url || input.image?.dataUrl) return input.text.trim() ? "text_image" : "image";
  return "text";
}

function toStructuredContext(value: ModelInterpretation, source: ContextSource): StructuredContext {
  return {
    source,
    requestIntent: "recommendation",
    directPlay: null,
    currentMood: value.current_mood,
    targetMood: value.target_mood,
    activity: value.activity,
    environment: value.environment,
    socialState: value.social_state,
    valence: value.valence,
    arousal: value.arousal,
    targetEnergy: value.target_energy,
    lyricTolerance: value.lyric_tolerance,
    familiarityBias: value.familiarity_bias,
    languagePreferences: value.language_preferences,
    transition: value.transition,
    hardConstraints: value.hard_constraints,
    safetyRisk: value.safety_risk,
    confidence: value.confidence,
  };
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function parseInterpretation(raw: string) {
  try {
    return modelInterpretationSchema.parse(JSON.parse(stripCodeFence(raw)));
  } catch {
    throw new Error("AI_PROVIDER_INVALID_RESPONSE");
  }
}

function applyDeterministicGuards(context: StructuredContext, text: string): StructuredContext {
  const explicitNoLyrics = /不要歌词|无歌词|纯音乐/.test(text);
  const explicitNoLibrary = /不要.*歌单|不想听.*歌单|别放.*收藏|不要.*收藏/.test(text);
  const explicitExplore = /新歌|新鲜|没听过|探索|发现.*歌/.test(text) || explicitNoLibrary;
  const explicitFamiliar = /熟悉.*歌|老歌|听过的|我喜欢的/.test(text);
  const explicitLanguage = /华语|中文歌|粤语|英语歌|英文歌|日语歌|韩语歌/.test(text);
  const stagedRecovery = /缓一缓再振作|先.*缓.*再.*振作/.test(text);
  const explicitSafetyDenial = /不准备伤害自己|不会伤害自己|没有伤害自己的(打算|计划|念头)/.test(text);
  let safetyRisk: StructuredContext["safetyRisk"] = "none";
  if (/自杀|不想活|结束生命|伤害自己|已经准备好遗书|准备结束这一切/.test(text) && !explicitSafetyDenial) safetyRisk = "high";
  else if (/消失算了|活着没意思|撑不下去|不如消失|没有活下去的意义/.test(text) || explicitSafetyDenial) safetyRisk = "watch";

  const localizedActivity = context.activity ? localizeLabel(context.activity) : null;
  const currentMood = localizeLabels(context.currentMood).filter(isSpecificLabel);
  const targetMood = localizeLabels(context.targetMood).filter(isSpecificLabel);

  return {
    ...context,
    currentMood: currentMood.length ? currentMood : ["平静"],
    targetMood: targetMood.length ? targetMood : currentMood.length ? currentMood.slice(0, 2) : ["平静"],
    activity: localizedActivity && !/^(null|unknown|未知)$/i.test(localizedActivity) ? localizedActivity : null,
    environment: localizeLabels(context.environment).filter((item) => !/unknown|未知/i.test(item)),
    hardConstraints: [
      ...(explicitNoLyrics ? ["不要歌词"] : []),
      ...(explicitNoLibrary ? ["不要歌单内歌曲"] : []),
      ...localizeLabels(context.hardConstraints).filter((item) => !/no lyrics|不要歌词|不要歌单内歌曲/i.test(item)),
    ],
    lyricTolerance: explicitNoLyrics ? "none" : context.lyricTolerance,
    languagePreferences: explicitLanguage ? localizeLabels(context.languagePreferences) : [],
    targetEnergy: stagedRecovery ? Math.min(context.targetEnergy, 65) : context.targetEnergy,
    familiarityBias: explicitExplore ? 0.15 : explicitFamiliar ? 0.9 : context.familiarityBias,
    safetyRisk,
  };
}

const LABEL_TRANSLATIONS: Record<string, string> = {
  tired: "疲惫", distracted: "分心", focused: "专注", productive: "高效", studying: "学习",
  study: "学习", work: "工作", working: "工作", relaxed: "放松", calm: "平静", anxious: "焦虑",
  excited: "兴奋", happy: "开心", sad: "低落", lonely: "孤独", angry: "生气", sleepy: "困倦",
  energetic: "有活力", refreshed: "清醒", peaceful: "平静", night: "夜晚", indoor: "室内",
  outdoors: "户外", traveling: "旅行", travel: "旅行", driving: "驾驶", walking: "步行",
  chinese: "华语", english: "英语", "no lyrics": "不要歌词",
};

function localizeLabels(values: string[]) {
  return values.map(localizeLabel);
}

function localizeLabel(value: string) {
  return LABEL_TRANSLATIONS[value.trim().toLowerCase()] ?? value;
}

function isSpecificLabel(value: string) {
  return !/^(unknown|null|未知|无法判断|不确定|无)$/i.test(value.trim());
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
