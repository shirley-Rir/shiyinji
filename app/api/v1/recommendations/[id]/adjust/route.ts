import { z } from "zod";
import { repository } from "@/src/repositories";
import { recommendationService } from "@/src/services";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentRecommendation } from "@/src/server/presenters";

const schema = z.object({
  direction: z.enum(["quieter", "more_energy", "more_familiar", "more_fresh"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const { id } = await params;
    const payload = schema.parse(await request.json());
    const previous = await repository.getRecommendation(user.id, id);
    if (!previous) return errorResponse("RECOMMENDATION_NOT_FOUND", "这次推荐已经失效", 404, false);
    const contextSession = await repository.getContextSession(user.id, previous.contextSessionId);
    if (!contextSession) return errorResponse("CONTEXT_NOT_FOUND", "这次情境已经失效", 404, false);
    const context = { ...contextSession.context };
    if (payload.direction === "quieter") context.targetEnergy = Math.max(0, context.targetEnergy - 20);
    if (payload.direction === "more_energy") context.targetEnergy = Math.min(100, context.targetEnergy + 20);
    if (payload.direction === "more_familiar") context.familiarityBias = Math.min(1, context.familiarityBias + 0.2);
    if (payload.direction === "more_fresh") context.familiarityBias = Math.max(0, context.familiarityBias - 0.2);
    const profile = await repository.getProfile(user.id);
    const plan = await recommendationService.recommend(context, profile, 5);
    await repository.saveTracks(plan.tracks);
    const recommendation = await repository.createRecommendation(user.id, contextSession.id, profile.version, `${plan.modelVersion}:${payload.direction}`, plan.tracks);
    return Response.json(presentRecommendation(recommendation), { status: 201 });
  } catch (error) { return apiError(error); }
}
