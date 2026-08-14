import { musicProvider } from "@/src/providers";
import { apiError } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";

export async function GET(request: Request, { params }: { params: Promise<{ trackId: string }> }) {
  try {
    requireApiUser(request);
    const { trackId } = await params;
    const lyrics = musicProvider.getLyrics
      ? await musicProvider.getLyrics(trackId)
      : { trackId, synced: false, lines: [] };
    return Response.json({
      track_id: lyrics.trackId,
      synced: lyrics.synced,
      lines: lyrics.lines.map((line) => ({ time_ms: line.timeMs, text: line.text, translation: line.translation ?? null })),
    });
  } catch (error) { return apiError(error); }
}
