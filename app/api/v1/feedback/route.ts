import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { feedbackRequest } from "@/src/server/request";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const payload = feedbackRequest.parse(await request.json());
    const recommendation = await repository.getRecommendation(user.id, payload.recommendation_id);
    if (!recommendation || !recommendation.tracks.some((track) => track.id === payload.track_id)) return errorResponse("RECOMMENDATION_NOT_FOUND", "反馈目标不属于这次推荐", 404, false);
    const id = `fb_${crypto.randomUUID()}`;
    await repository.recordFeedback({ id, userId: user.id, recommendationId: payload.recommendation_id, trackId: payload.track_id, type: payload.type, scope: payload.scope, reason: payload.reason, direction: payload.direction });
    return Response.json({ feedback_id: id, status: "active", scope: payload.scope }, { status: 201 });
  } catch (error) { return apiError(error); }
}
