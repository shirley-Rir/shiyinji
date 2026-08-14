import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const { sessionId } = await params;
    const deleted = await repository.deleteHistory(user.id, sessionId);
    if (!deleted) return errorResponse("CONTEXT_NOT_FOUND", "历史记录不存在", 404, false);
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}
