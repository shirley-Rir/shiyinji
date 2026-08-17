import { clearSessionCookie, readSessionToken } from "@/src/server/auth-cookie";
import { apiError } from "@/src/server/http";
import { revokeSession } from "@/src/services/auth";

export async function POST(request: Request) {
  try {
    const token = readSessionToken(request);
    if (token) await revokeSession(token);
    return new Response(null, { status: 204, headers: { "Set-Cookie": clearSessionCookie(request) } });
  } catch (error) { return apiError(error); }
}
