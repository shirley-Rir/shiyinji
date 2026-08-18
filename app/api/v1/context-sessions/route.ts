import { aiProvider, lyricsIdentifier } from "@/src/providers";
import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentContext } from "@/src/server/presenters";
import { contextImageStorage } from "@/src/services/context-image-storage";
import { createDirectPlayInterpretation, createLyricDirectPlayInterpretation, isLyricLookupCandidate } from "@/src/services/request-intent";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const form = await request.formData();
    const text = String(form.get("text") ?? "").trim();
    const imageValue = form.get("image");
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;

    if (!text && !image) return errorResponse("EMPTY_CONTEXT", "写下一点感受，或放一张此刻的照片", 400, false);
    if (text.length > 1000) return errorResponse("TEXT_TOO_LONG", "情境文字不能超过 1000 字", 400, false);
    if (image && (!ACCEPTED_IMAGE_TYPES.has(image.type) || image.size > maxImageBytes())) {
      return errorResponse("INVALID_IMAGE", "图片需为 JPEG、PNG 或 WebP，且不超过 25MB", 400, false);
    }
    if (image && !contextImageStorage.isConfigured) {
      return errorResponse("IMAGE_STORAGE_UNAVAILABLE", "图片存储服务尚未配置完成", 503, false);
    }

    const storedImage = image ? await contextImageStorage.upload({ userId: user.id, file: image }) : null;
    const imageMetadata = storedImage && image ? {
      name: image.name,
      type: image.type,
      size: image.size,
      storage: "tencent-cos",
      objectKey: storedImage.key,
      uploadedAt: storedImage.uploadedAt,
    } : null;
    const modelImage = storedImage && image ? {
      name: image.name,
      type: image.type,
      size: image.size,
      url: storedImage.signedUrl,
    } : undefined;
    const contextInput = { text, image: modelImage, timezone: String(form.get("timezone") ?? "") || undefined };
    const directPlay = createDirectPlayInterpretation(contextInput);
    const lyricMatch = !directPlay && !image && lyricsIdentifier && isLyricLookupCandidate(text)
      ? await lyricsIdentifier.identifyLyrics(text).catch(() => null)
      : null;
    const interpretation = directPlay
      ?? (lyricMatch ? createLyricDirectPlayInterpretation(contextInput, lyricMatch) : null)
      ?? await aiProvider.interpretContext(contextInput);
    const session = await repository.createContextSession(user.id, text, imageMetadata, interpretation);

    return Response.json({
      context_session_id: session.id,
      context: presentContext(session.context),
      clarification: session.clarification,
      provider: interpretation.provider,
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

function maxImageBytes() {
  const configured = Number(process.env.COS_IMAGE_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 50 * 1024 * 1024)
    : DEFAULT_MAX_IMAGE_BYTES;
}
