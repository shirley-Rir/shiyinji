import { musicProvider } from "@/src/providers";
import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { playbackResolveRequest } from "@/src/server/request";

export async function POST(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const payload = playbackResolveRequest.parse(await request.json());
    const recommendation = await repository.getRecommendation(user.id, payload.recommendation_id);
    if (!recommendation || !recommendation.tracks.some((track) => track.id === payload.track_id)) return errorResponse("RECOMMENDATION_NOT_FOUND", "歌曲不属于这次推荐", 404, false);
    const handle = await musicProvider.resolvePlayback(payload.track_id, user.id);
    return Response.json({ playback_handle: handle.id, track_id: handle.trackId, url: handle.url, mime_type: handle.mimeType, expires_at: handle.expiresAt });
  } catch (error) { return apiError(error); }
}
