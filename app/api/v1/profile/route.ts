import { repository } from "@/src/repositories";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentProfile } from "@/src/server/presenters";
import { profilePatchRequest } from "@/src/server/request";

export async function GET(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    return Response.json({ profile: presentProfile(await repository.getProfile(user.id)) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const payload = profilePatchRequest.parse(await request.json());
    const profile = await repository.updateProfile(user.id, { explicit: payload.explicit, personalizationEnabled: payload.personalization_enabled });
    return Response.json({ profile: presentProfile(profile) });
  } catch (error) { return apiError(error); }
}
