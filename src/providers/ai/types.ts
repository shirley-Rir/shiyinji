import type { ContextInput, ContextInterpretation, RecommendationBrief, RecommendationPlannerInput } from "@/src/domain";

export interface AIProvider {
  readonly name: string;
  interpretContext(input: ContextInput): Promise<ContextInterpretation>;
}

export interface RecommendationPlanner {
  readonly name: string;
  planRecommendation(input: RecommendationPlannerInput): Promise<RecommendationBrief>;
}

export type LyricIdentification = {
  title: string;
  artist: string | null;
  confidence: number;
};

export interface LyricsIdentifier {
  identifyLyrics(text: string): Promise<LyricIdentification | null>;
}
