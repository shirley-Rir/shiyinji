import { repository } from "@/src/repositories";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentProfile } from "@/src/server/presenters";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const profile = await repository.ensureUser(user);
    return Response.json({ user: { id: user.id, email: user.email, display_name: user.displayName }, profile: presentProfile(profile), music_connection: { provider: "mock", status: "demo" } });
  } catch (error) { return apiError(error); }
}
