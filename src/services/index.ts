import { musicProvider, recommendationPlanner } from "@/src/providers";
import { repository } from "@/src/repositories";
import { AccountMusicProfileService } from "./music-profile";
import { RecommendationService } from "./recommendation";

export const recommendationService = new RecommendationService(musicProvider, recommendationPlanner);
export const accountMusicProfileService = new AccountMusicProfileService(repository, musicProvider);
export { RecommendationService } from "./recommendation";
export { AccountMusicProfileService } from "./music-profile";
