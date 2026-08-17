import { sessionCookie } from "@/src/server/auth-cookie";
import { apiError } from "@/src/server/http";
import { codeLoginRequest } from "@/src/server/request";
import { loginWithCode } from "@/src/services/auth";

export async function POST(request: Request) {
  try {
    const input = codeLoginRequest.parse(await request.json());
    const session = await loginWithCode(input.email, input.code);
    return Response.json({ user: { id: session.user.id, email: session.user.email, display_name: session.user.displayName } }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt, request) } });
  } catch (error) { return apiError(error); }
}
