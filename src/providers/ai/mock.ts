import type { ContextInput, ContextInterpretation, StructuredContext } from "@/src/domain";
import type { AIProvider } from "./types";

const HIGH_RISK_PATTERN = /自杀|不想活|结束生命|伤害自己/;

export class MockAIProvider implements AIProvider {
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
  const risk = HIGH_RISK_PATTERN.test(text) ? "high" : "none";
  const signals = [focus, travel, low, quiet, energetic, noLyrics, familiar, fresh].filter(Boolean).length;
  const source = hasImage ? (text ? "text_image" : "image") : "text";

  return {
    source,
    currentMood: low ? ["疲惫", "低落"] : focus ? ["准备投入"] : travel ? ["期待"] : ["平常"],
    targetMood: energetic ? ["振作"] : focus ? ["专注"] : travel ? ["开阔"] : ["平静"],
    activity: focus ? "工作或学习" : travel ? "旅行途中" : low ? "休息" : null,
    environment: travel ? ["在路上", "开阔"] : hasImage ? ["图片情境"] : [],
    socialState: "unknown",
    valence: low ? -0.35 : energetic ? 0.45 : 0.1,
    arousal: energetic ? 0.78 : focus ? 0.48 : quiet || low ? 0.28 : 0.45,
    targetEnergy: energetic ? 76 : travel ? 58 : focus ? 42 : quiet || low ? 28 : 48,
    lyricTolerance: noLyrics ? "none" : focus ? "low" : "medium",
    familiarityBias: familiar ? 0.88 : fresh ? 0.25 : 0.68,
    languagePreferences: [],
    transition: low ? "从疲惫到舒展" : focus ? "从分散到专注" : travel ? "从期待到开阔" : null,
    hardConstraints: noLyrics ? ["不要歌词"] : /不要太伤感/.test(text) ? ["不要太伤感"] : [],
    safetyRisk: risk,
    confidence: Math.min(0.92, (hasImage ? 0.58 : 0.42) + signals * 0.07 + Math.min(text.length, 60) / 300),
  };
}
