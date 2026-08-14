import { repository } from "@/src/repositories";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentMusicProfile } from "@/src/server/presenters";

export async function GET(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const profile = await repository.getAccountMusicProfile(user.id);
    return Response.json({ music_profile: profile ? presentMusicProfile(profile) : null });
  } catch (error) { return apiError(error); }
}
