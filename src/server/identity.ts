import type { AppUser } from "@/src/repositories/types";
import { getSessionUser } from "@/src/services/auth";
import { readSessionToken } from "./auth-cookie";

export class AuthenticationError extends Error {
  constructor() { super("AUTHENTICATION_REQUIRED"); }
}

export async function requireApiUser(request: Request): Promise<AppUser> {
  const token = readSessionToken(request);
  const user = token ? await getSessionUser(token) : null;
  if (user) return user;
  throw new AuthenticationError();
}
