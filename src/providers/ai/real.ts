import type { ContextInput, ContextInterpretation, ContextSource, StructuredContext } from "@/src/domain";
import type { AIProvider } from "./types";
import { CONTEXT_INTERPRETER_PROMPT } from "./prompt";
import { modelInterpretationSchema, type ModelInterpretation } from "./schema";

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  visionModel?: string;
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

export class OpenAICompatibleAIProvider implements AIProvider {
  readonly name: string;
  private readonly request: typeof fetch;

  constructor(private readonly config: ProviderConfig) {
    this.name = `real-ai:${config.textModel}`;
    this.request = config.fetch ?? fetch;
  }

  async interpretContext(input: ContextInput): Promise<ContextInterpretation> {
    const hasImage = Boolean(input.image?.dataUrl);
    const model = hasImage ? this.config.visionModel : this.config.textModel;
    if (!model) throw new Error("AI_VISION_MODEL_REQUIRED");

    const raw = await this.complete(model, input);
    let parsed: ModelInterpretation;
    try {
      parsed = modelInterpretationSchema.parse(JSON.parse(stripCodeFence(raw)));
    } catch {
      throw new Error("AI_PROVIDER_INVALID_RESPONSE");
    }
    return {
      context: applyDeterministicGuards(toStructuredContext(parsed, sourceOf(input)), input.text),
      clarification: parsed.clarification,
      provider: `real-ai:${model}`,
    };
  }

  private async complete(model: string, input: ContextInput): Promise<string> {
    const maxRetries = this.config.maxRetries ?? 2;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await this.request(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: CONTEXT_INTERPRETER_PROMPT },
            { role: "user", content: userContent(input) },
          ],
          ...(!input.image?.dataUrl ? { response_format: { type: "json_object" } } : {}),
          ...(this.config.thinking ? { thinking: { type: this.config.thinking } } : {}),
          temperature: 0.1,
          max_tokens: 1200,
          stream: false,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });

      const payload = await response.json() as ChatCompletionResponse;
      if (response.ok) {
        const content = payload.choices?.[0]?.message?.content;
        if (!content) throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
        return content;
      }
      if (![429, 503].includes(response.status) || attempt === maxRetries) {
        throw new Error(`AI_PROVIDER_ERROR:${response.status}:${payload.error?.message ?? "unknown"}`);
      }
      const retryAfterMs = Number(response.headers.get("retry-after") ?? 0) * 1000;
      await delay(Math.max(retryAfterMs, (this.config.retryBaseMs ?? 1000) * 2 ** attempt));
    }
    throw new Error("AI_PROVIDER_RETRY_EXHAUSTED");
  }
}

function userContent(input: ContextInput) {
  const text = input.text.trim() || "用户没有提供文字，请仅根据图片中可观察的信息理解此刻情境。";
  const contextText = `用户输入：${text}\n用户时区：${input.timezone ?? "unknown"}`;
  if (!input.image?.dataUrl) return contextText;
  return [
    { type: "text", text: contextText },
    { type: "image_url", image_url: { url: input.image.dataUrl } },
  ];
}

function sourceOf(input: ContextInput): ContextSource {
  if (input.image?.dataUrl) return input.text.trim() ? "text_image" : "image";
  return "text";
}

function toStructuredContext(value: ModelInterpretation, source: ContextSource): StructuredContext {
  return {
    source,
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

function applyDeterministicGuards(context: StructuredContext, text: string): StructuredContext {
  const explicitNoLyrics = /不要歌词|无歌词|纯音乐/.test(text);
  const explicitLanguage = /华语|中文歌|粤语|英语歌|英文歌|日语歌|韩语歌/.test(text);
  const stagedRecovery = /缓一缓再振作|先.*缓.*再.*振作/.test(text);
  const explicitSafetyDenial = /不准备伤害自己|不会伤害自己|没有伤害自己的(打算|计划|念头)/.test(text);
  let safetyRisk: StructuredContext["safetyRisk"] = "none";
  if (/自杀|不想活|结束生命|伤害自己|已经准备好遗书|准备结束这一切/.test(text) && !explicitSafetyDenial) safetyRisk = "high";
  else if (/消失算了|活着没意思|撑不下去|不如消失|没有活下去的意义/.test(text) || explicitSafetyDenial) safetyRisk = "watch";

  const localizedActivity = context.activity ? localizeLabel(context.activity) : null;

  return {
    ...context,
    currentMood: localizeLabels(context.currentMood),
    targetMood: localizeLabels(context.targetMood),
    activity: localizedActivity && !/^(null|unknown|未知)$/i.test(localizedActivity) ? localizedActivity : null,
    environment: localizeLabels(context.environment).filter((item) => !/unknown|未知/i.test(item)),
    hardConstraints: explicitNoLyrics ? ["不要歌词", ...context.hardConstraints.filter((item) => !/no lyrics|不要歌词/i.test(item))] : localizeLabels(context.hardConstraints),
    lyricTolerance: explicitNoLyrics ? "none" : context.lyricTolerance,
    languagePreferences: explicitLanguage ? localizeLabels(context.languagePreferences) : [],
    targetEnergy: stagedRecovery ? Math.min(context.targetEnergy, 65) : context.targetEnergy,
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
