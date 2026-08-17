import { sessionCookie } from "@/src/server/auth-cookie";
import { apiError } from "@/src/server/http";
import { passwordLoginRequest } from "@/src/server/request";
import { loginWithPassword } from "@/src/services/auth";

export async function POST(request: Request) {
  try {
    const input = passwordLoginRequest.parse(await request.json());
    const session = await loginWithPassword(input.email, input.password);
    return Response.json({ user: { id: session.user.id, email: session.user.email, display_name: session.user.displayName } }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt, request) } });
  } catch (error) { return apiError(error); }
}
