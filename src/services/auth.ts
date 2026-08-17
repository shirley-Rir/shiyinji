import { env } from "cloudflare:workers";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, getDbBinding } from "@/db";
import { initializeDatabase } from "@/db/initialize";
import { authCredentials, authSessions, emailVerificationCodes, users } from "@/db/schema";
import type { AppUser } from "@/src/repositories/types";
import { repository } from "@/src/repositories";
import { hashPassword, hashValue, randomToken, randomVerificationCode, verifyPassword } from "./auth-crypto";
import { sendVerificationEmail } from "./email";

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

export class AuthError extends Error {
  constructor(public readonly code: string) { super(code); }
}

export async function requestEmailCode(email: string, purpose: "register" | "login") {
  await initializeDatabase();
  const db = getDb();
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (purpose === "register" && existingUser) throw new AuthError("ACCOUNT_ALREADY_EXISTS");
  if (purpose === "login" && !existingUser) throw new AuthError("ACCOUNT_NOT_FOUND");

  const latest = await db.select().from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.email, email), eq(emailVerificationCodes.purpose, purpose)))
    .orderBy(desc(emailVerificationCodes.createdAt)).get();
  if (latest && Date.now() - new Date(latest.createdAt).getTime() < CODE_RESEND_MS) throw new AuthError("CODE_REQUEST_TOO_FREQUENT");

  const code = randomVerificationCode();
  const salt = randomToken(12);
  const codeHash = await hashValue(code, salt);
  const id = `code_${crypto.randomUUID()}`;
  await db.insert(emailVerificationCodes).values({ id, email, purpose, codeHash, codeSalt: salt, expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString() });
  try {
    await sendVerificationEmail({ email, code, purpose });
  } catch (error) {
    await db.update(emailVerificationCodes).set({ consumedAt: new Date().toISOString() }).where(eq(emailVerificationCodes.id, id));
    throw error;
  }
  return env.AUTH_EXPOSE_DEV_CODE === "true" && env.APP_ENV !== "production" ? code : null;
}

export async function registerWithEmail(input: { email: string; code: string; password: string; displayName: string }) {
  await initializeDatabase();
  const db = getDb();
  if (await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) throw new AuthError("ACCOUNT_ALREADY_EXISTS");
  const codeId = await verifyEmailCode(input.email, "register", input.code);
  const password = await hashPassword(input.password);
  const user: AppUser = { id: `usr_${crypto.randomUUID()}`, email: input.email, displayName: input.displayName };
  const now = new Date().toISOString();
  const d1 = getDbBinding();
  await d1.batch([
    d1.prepare("INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(user.id, user.email, user.displayName, now, now),
    d1.prepare("INSERT INTO auth_credentials (user_id, password_hash, password_salt, password_iterations, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(user.id, password.hash, password.salt, password.iterations, now, now, now),
    d1.prepare("UPDATE email_verification_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, codeId),
  ]);
  await repository.ensureUser(user);
  return createSession(user);
}

export async function loginWithPassword(email: string, password: string) {
  await initializeDatabase();
  const db = getDb();
  const row = await db.select({ user: users, credential: authCredentials }).from(users)
    .innerJoin(authCredentials, eq(authCredentials.userId, users.id)).where(eq(users.email, email)).get();
  if (!row || !await verifyPassword(password, row.credential.passwordHash, row.credential.passwordSalt, row.credential.passwordIterations)) {
    throw new AuthError("INVALID_CREDENTIALS");
  }
  return createSession(mapUser(row.user));
}

export async function loginWithCode(email: string, code: string) {
  await initializeDatabase();
  const db = getDb();
  const row = await db.select().from(users).where(eq(users.email, email)).get();
  if (!row) throw new AuthError("INVALID_CREDENTIALS");
  const codeId = await verifyEmailCode(email, "login", code);
  await db.update(emailVerificationCodes).set({ consumedAt: new Date().toISOString() }).where(eq(emailVerificationCodes.id, codeId));
  return createSession(mapUser(row));
}

export async function getSessionUser(token: string): Promise<AppUser | null> {
  await initializeDatabase();
  const tokenHash = await hashValue(token);
  const db = getDb();
  const row = await db.select({ session: authSessions, user: users }).from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date().toISOString()))).get();
  if (!row) return null;
  const now = new Date();
  if (now.getTime() - new Date(row.session.lastSeenAt).getTime() > 60 * 60 * 1000) {
    await db.update(authSessions).set({ lastSeenAt: now.toISOString() }).where(eq(authSessions.id, row.session.id));
  }
  return mapUser(row.user);
}

export async function revokeSession(token: string) {
  await initializeDatabase();
  const tokenHash = await hashValue(token);
  await getDb().update(authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(authSessions.tokenHash, tokenHash));
}

async function verifyEmailCode(email: string, purpose: "register" | "login", code: string) {
  const db = getDb();
  const row = await db.select().from(emailVerificationCodes)
    .where(and(eq(emailVerificationCodes.email, email), eq(emailVerificationCodes.purpose, purpose), isNull(emailVerificationCodes.consumedAt)))
    .orderBy(desc(emailVerificationCodes.createdAt)).get();
  if (!row || row.attempts >= MAX_CODE_ATTEMPTS || new Date(row.expiresAt).getTime() <= Date.now()) throw new AuthError("INVALID_OR_EXPIRED_CODE");
  const matches = await hashValue(code, row.codeSalt) === row.codeHash;
  if (!matches) {
    await db.update(emailVerificationCodes).set({ attempts: row.attempts + 1 }).where(eq(emailVerificationCodes.id, row.id));
    throw new AuthError("INVALID_OR_EXPIRED_CODE");
  }
  return row.id;
}

async function createSession(user: AppUser) {
  const token = randomToken();
  const now = new Date();
  const days = Math.min(30, Math.max(1, Number(env.AUTH_SESSION_DAYS ?? 14)));
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await getDb().insert(authSessions).values({ id: `ses_${crypto.randomUUID()}`, userId: user.id, tokenHash: await hashValue(token), expiresAt: expiresAt.toISOString(), lastSeenAt: now.toISOString() });
  return { user, token, expiresAt };
}

function mapUser(row: typeof users.$inferSelect): AppUser {
  return { id: row.id, email: row.email, displayName: row.displayName };
}
