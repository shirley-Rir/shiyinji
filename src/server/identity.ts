import type { AppUser } from "@/src/repositories/types";

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

export class AuthenticationError extends Error {
  constructor() { super("AUTHENTICATION_REQUIRED"); }
}

export function requireApiUser(request: Request): AppUser {
  const id = request.headers.get(USER_ID_HEADER);
  const email = request.headers.get(USER_EMAIL_HEADER);
  if (id && email) {
    const encodedName = request.headers.get(USER_NAME_HEADER);
    const displayName = encodedName && request.headers.get(USER_NAME_ENCODING_HEADER) === "percent-encoded-utf-8"
      ? safeDecode(encodedName) ?? email
      : email;
    return { id, email, displayName };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { id: "local-demo-user", email: "demo@shiyinji.local", displayName: "本地体验者" };
  }

  throw new AuthenticationError();
}

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return null; }
}
