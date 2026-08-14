import { repository } from "@/src/repositories";
import { recommendationService } from "@/src/services";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentRecommendation } from "@/src/server/presenters";
import { recommendationRequest } from "@/src/server/request";

export async function POST(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const payload = recommendationRequest.parse(await request.json());
    const contextSession = await repository.getContextSession(user.id, payload.context_session_id);
    if (!contextSession) return errorResponse("CONTEXT_NOT_FOUND", "这次情境已经失效", 404, false);
    const profile = await repository.getProfile(user.id);
    const plan = await recommendationService.recommend(contextSession.context, profile, payload.count);
    if (!plan.tracks.length) return errorResponse("NO_PLAYABLE_TRACK", "当前没有符合约束且可播放的歌曲", 409, true);
    await repository.saveTracks(plan.tracks);
    const recommendation = await repository.createRecommendation(user.id, contextSession.id, profile.version, plan.modelVersion, plan.tracks);
    return Response.json(presentRecommendation(recommendation), { status: 201 });
  } catch (error) { return apiError(error); }
}
