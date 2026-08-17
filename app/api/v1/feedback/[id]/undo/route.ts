import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const { id } = await params;
    const undone = await repository.undoFeedback(user.id, id);
    if (!undone) return errorResponse("FEEDBACK_NOT_FOUND", "反馈不存在或已撤销", 404, false);
    return Response.json({ feedback_id: id, status: "undone" });
  } catch (error) { return apiError(error); }
}
