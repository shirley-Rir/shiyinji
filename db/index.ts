import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDbBinding(): D1Database {
  if (!env.DB) {
    throw new Error("DATABASE_UNAVAILABLE");
  }
  return env.DB;
}

export function getDb() {
  return drizzle(getDbBinding(), { schema });
}
