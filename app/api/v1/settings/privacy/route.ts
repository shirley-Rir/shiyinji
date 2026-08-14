import { z } from "zod";
import { repository } from "@/src/repositories";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentProfile } from "@/src/server/presenters";

const schema = z.object({ personalization_enabled: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const payload = schema.parse(await request.json());
    const profile = await repository.updateProfile(user.id, { personalizationEnabled: payload.personalization_enabled });
    return Response.json({ profile: presentProfile(profile) });
  } catch (error) { return apiError(error); }
}
