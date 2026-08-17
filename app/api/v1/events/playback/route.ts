import { repository } from "@/src/repositories";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { playbackEventRequest } from "@/src/server/request";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const payload = playbackEventRequest.parse(await request.json());
    await repository.recordPlaybackEvent({ id: `evt_${crypto.randomUUID()}`, clientEventId: payload.event_id, userId: user.id, recommendationId: payload.recommendation_id ?? null, trackId: payload.track_id, eventType: payload.event_type, positionMs: payload.position_ms, occurredAt: payload.occurred_at });
    return Response.json({ accepted: true }, { status: 202 });
  } catch (error) { return apiError(error); }
}
