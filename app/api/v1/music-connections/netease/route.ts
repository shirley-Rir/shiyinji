import { z } from "zod";
import { neteaseSessionManager } from "@/src/providers";
import { repository } from "@/src/repositories";
import { apiError, errorResponse } from "@/src/server/http";
import { requireApiUser } from "@/src/server/identity";

const qrCheckRequest = z.object({ key: z.string().min(8).max(200) });

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const sessions = requireNeteaseSessions();
    await sessions.getSession(user.id);
    return Response.json({ connection: await sessions.getStatus(user.id) });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const qr = await requireNeteaseSessions().createQr(user.id);
    return Response.json({ key: qr.key, qr_image: qr.qrImage, connection: { status: "waiting" } }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    const payload = qrCheckRequest.parse(await request.json());
    return Response.json({ connection: await requireNeteaseSessions().checkQr(user.id, payload.key) });
  } catch (error) {
    if (error instanceof Error && error.message === "NCM_QR_INVALID_KEY") return errorResponse("NCM_QR_INVALID_KEY", "二维码会话已失效，请重新生成", 400, false);
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    await repository.ensureUser(user);
    await requireNeteaseSessions().disconnect(user.id);
    return new Response(null, { status: 204 });
  } catch (error) { return apiError(error); }
}

function requireNeteaseSessions() {
  if (!neteaseSessionManager) throw new Error("NCM_API_ERROR:NOT_CONFIGURED");
  return neteaseSessionManager;
}
