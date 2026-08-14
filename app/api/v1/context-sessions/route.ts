import { aiProvider } from "@/src/providers";
import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";
import { presentContext } from "@/src/server/presenters";

export async function POST(request: Request) {
  try {
    const user = requireApiUser(request);
    await repository.ensureUser(user);
    const form = await request.formData();
    const text = String(form.get("text") ?? "").trim();
    const imageValue = form.get("image");
    const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
    if (!text && !image) return errorResponse("EMPTY_CONTEXT", "写下一点感受，或放一张此刻的照片", 400, false);
    if (text.length > 1000) return errorResponse("TEXT_TOO_LONG", "情境文字不能超过 1000 字", 400, false);
    if (image && (image.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(image.type))) return errorResponse("INVALID_IMAGE", "图片需为 JPEG、PNG 或 WebP，且不超过 10MB", 400, false);

    const imageMetadata = image ? { name: image.name, type: image.type, size: image.size } : null;
    const interpretation = await aiProvider.interpretContext({ text, image: imageMetadata ?? undefined, timezone: String(form.get("timezone") ?? "") || undefined });
    const session = await repository.createContextSession(user.id, text, imageMetadata, interpretation);
    return Response.json({ context_session_id: session.id, context: presentContext(session.context), clarification: session.clarification, provider: interpretation.provider }, { status: 201 });
  } catch (error) { return apiError(error); }
}
