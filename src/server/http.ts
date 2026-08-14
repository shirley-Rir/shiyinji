import { ZodError } from "zod";
import { AuthenticationError } from "./identity";

export function apiError(error: unknown): Response {
  if (error instanceof AuthenticationError) return errorResponse("AUTHENTICATION_REQUIRED", "请先登录拾音记", 401, false);
  if (error instanceof ZodError) return errorResponse("INVALID_REQUEST", error.issues[0]?.message ?? "请求参数不正确", 400, false);
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  if (code.endsWith("_NOT_FOUND")) return errorResponse(code, "请求的资源不存在", 404, false);
  if (code === "TRACK_NOT_PLAYABLE") return errorResponse(code, "这首歌当前无法播放", 409, true);
  if (code === "DATABASE_UNAVAILABLE") return errorResponse(code, "数据服务暂时不可用", 503, true);
  if (code === "AI_API_KEY_REQUIRED") return errorResponse(code, "语义理解服务尚未配置", 503, false);
  if (code.startsWith("AI_PROVIDER_")) return errorResponse("AI_PROVIDER_UNAVAILABLE", "语义理解服务暂时不可用", 503, true);
  if (code.startsWith("NCM_API_ERROR")) return errorResponse("MUSIC_PROVIDER_UNAVAILABLE", "音乐服务暂时不可用", 503, true);
  console.error("[shiyinji-api]", error);
  return errorResponse("INTERNAL_ERROR", "服务暂时没有接住这次请求", 500, true);
}

export function errorResponse(code: string, message: string, status: number, retryable: boolean) {
  return Response.json({ error: { code, message, request_id: `req_${crypto.randomUUID()}`, retryable } }, { status });
}
