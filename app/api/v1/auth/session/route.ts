import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    return Response.json({ user: { id: user.id, email: user.email, display_name: user.displayName } });
  } catch (error) { return apiError(error); }
}
