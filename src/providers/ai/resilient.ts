import type { ContextInput, ContextInterpretation } from "@/src/domain";
import type { AIProvider } from "./types";

export class ResilientContextAIProvider implements AIProvider {
  readonly name: string;

  constructor(
    private readonly primary: AIProvider,
    private readonly fallback: AIProvider,
  ) {
    this.name = primary.name;
  }

  async interpretContext(input: ContextInput): Promise<ContextInterpretation> {
    try {
      return await this.primary.interpretContext(input);
    } catch (error) {
      if (!input.text.trim() || !isTransientAIError(error)) throw error;

      console.warn("[shiyinji-ai] semantic provider unavailable; using text fallback", {
        provider: this.primary.name,
        reason: safeAIErrorReason(error),
      });
      const result = await this.fallback.interpretContext({
        text: input.text,
        timezone: input.timezone,
      });
      return {
        ...result,
        provider: `fallback-rules:${this.fallback.name}`,
      };
    }
  }
}

export function isTransientAIError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message === "AI_PROVIDER_RETRY_EXHAUSTED"
    || error.message === "AI_PROVIDER_NETWORK_ERROR"
    || error.message === "AI_PROVIDER_EMPTY_RESPONSE"
    || error.message === "AI_PROVIDER_INVALID_RESPONSE"
    || /^AI_PROVIDER_ERROR:(429|502|503|504)$/.test(error.message);
}

function safeAIErrorReason(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  if (error.message === "AI_PROVIDER_RETRY_EXHAUSTED") return "retry_exhausted";
  if (error.message === "AI_PROVIDER_NETWORK_ERROR") return "network_error";
  if (error.message === "AI_PROVIDER_EMPTY_RESPONSE") return "empty_response";
  if (error.message === "AI_PROVIDER_INVALID_RESPONSE") return "invalid_response";
  return error.message.match(/^AI_PROVIDER_ERROR:(\d{3})$/)?.[1] ?? "provider_error";
}
