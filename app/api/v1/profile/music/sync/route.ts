import { repository } from "@/src/repositories";
import { accountMusicProfileService } from "@/src/services";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentMusicProfile } from "@/src/server/presenters";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const profile = await accountMusicProfileService.sync(user.id);
    return Response.json({ music_profile: presentMusicProfile(profile) });
  } catch (error) { return apiError(error); }
}
