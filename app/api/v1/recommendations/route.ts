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
    if (contextSession.context.safetyRisk === "high") {
      return errorResponse("SAFETY_SUPPORT_REQUIRED", "此刻请先联系身边可信任的人或当地紧急服务，音乐不能替代及时的现实支持", 409, false);
    }
    const profile = await repository.getProfile(user.id);
    const plan = await recommendationService.recommend(contextSession.context, profile, payload.count, { discoveryMode: payload.discovery_mode });
    if (!plan.tracks.length && contextSession.context.requestIntent === "direct_play") {
      return errorResponse("DIRECT_TRACK_NOT_FOUND", "没有找到这首歌的可播放版本，请补充歌手名或检查歌曲名称", 404, false);
    }
    if (!plan.tracks.length) return errorResponse("NO_PLAYABLE_TRACK", "当前没有符合约束且可播放的歌曲", 409, true);
    await repository.saveTracks(plan.tracks);
    const recommendation = await repository.createRecommendation(user.id, contextSession.id, profile.version, plan.modelVersion, plan.tracks);
    return Response.json({
      ...presentRecommendation(recommendation),
      strategy: {
        model_version: plan.modelVersion,
        discovery_mode: contextSession.context.requestIntent === "direct_play" ? "direct" : plan.brief?.discoveryIntent.mode ?? "fallback",
        draft_count: plan.diagnostics?.draftCount ?? 0,
        matched_draft_count: plan.diagnostics?.matchedDraftCount ?? 0,
        fallback_candidate_count: plan.diagnostics?.fallbackCandidateCount ?? 0,
        planner_fallback_reason: plan.diagnostics?.plannerFallbackReason ?? null,
        failure_counts: plan.diagnostics?.failureCounts ?? {},
        draft_resolutions: plan.diagnostics?.resolutions ?? [],
      },
    }, { status: 201 });
  } catch (error) { return apiError(error); }
}
