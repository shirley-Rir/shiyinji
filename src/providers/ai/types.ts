import type { ContextInput, ContextInterpretation } from "@/src/domain";

export interface AIProvider {
  readonly name: string;
  interpretContext(input: ContextInput): Promise<ContextInterpretation>;
}
