import { repository } from "@/src/repositories";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentContext, presentRecommendation } from "@/src/server/presenters";

export async function GET(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const rows = await repository.listHistory(user.id, 20);
    return Response.json({ sessions: rows.map(({ context, recommendation }) => ({ context_session_id: context.id, input_text: context.inputText, context: presentContext(context.context), created_at: context.createdAt, recommendation: recommendation ? presentRecommendation(recommendation) : null })) });
  } catch (error) { return apiError(error); }
}
