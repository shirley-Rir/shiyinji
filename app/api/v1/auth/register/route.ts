import { sessionCookie } from "@/src/server/auth-cookie";
import { apiError } from "@/src/server/http";
import { registerRequest } from "@/src/server/request";
import { registerWithEmail } from "@/src/services/auth";

export async function POST(request: Request) {
  try {
    const input = registerRequest.parse(await request.json());
    const session = await registerWithEmail({ email: input.email, code: input.code, password: input.password, displayName: input.display_name });
    return Response.json({ user: presentUser(session.user) }, { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt, request) } });
  } catch (error) { return apiError(error); }
}

function presentUser(user: { id: string; email: string; displayName: string }) {
  return { id: user.id, email: user.email, display_name: user.displayName };
}
