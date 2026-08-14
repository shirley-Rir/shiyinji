import { musicProvider } from "@/src/providers";
import { RecommendationService } from "./recommendation";

export const recommendationService = new RecommendationService(musicProvider);
export { RecommendationService } from "./recommendation";
