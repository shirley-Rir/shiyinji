import type { ContextInput, ContextInterpretation, ContextSource, StructuredContext } from "@/src/domain";
import type { AIProvider } from "./types";
import { CONTEXT_INTERPRETER_PROMPT } from "./prompt";
import { modelInterpretationSchema, type ModelInterpretation } from "./schema";

type ProviderConfig = {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  visionModel?: string;
  timeoutMs?: number;
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
      context: applySafetyGuard(toStructuredContext(parsed, sourceOf(input)), input.text),
      clarification: parsed.clarification,
      provider: `real-ai:${model}`,
    };
  }

  private async complete(model: string, input: ContextInput): Promise<string> {
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
        temperature: 0.1,
        max_tokens: 1200,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    });

    const payload = await response.json() as ChatCompletionResponse;
    if (!response.ok) throw new Error(`AI_PROVIDER_ERROR:${response.status}:${payload.error?.message ?? "unknown"}`);
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI_PROVIDER_EMPTY_RESPONSE");
    return content;
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

function applySafetyGuard(context: StructuredContext, text: string): StructuredContext {
  if (/自杀|不想活|结束生命|伤害自己/.test(text)) return { ...context, safetyRisk: "high" };
  if (/消失算了|活着没意思|撑不下去/.test(text) && context.safetyRisk === "none") return { ...context, safetyRisk: "watch" };
  return context;
}
