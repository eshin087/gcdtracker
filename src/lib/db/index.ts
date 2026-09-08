import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Preview deployments never inherit a production connection by accident.
const url = process.env.VERCEL_ENV === "preview" ? process.env.PREVIEW_DATABASE_URL : process.env.DATABASE_URL;
// Local-only HTTP bridge exercises the production Neon driver against isolated PostgreSQL.
if (process.env.GCD_QA_MODE === "1" && process.env.VERCEL_ENV !== "production" && url && process.env.QA_NEON_HTTP_ENDPOINT) {
  const databaseHost = new URL(url).hostname;
  const endpoint = new URL(process.env.QA_NEON_HTTP_ENDPOINT);
  if (!["localhost", "127.0.0.1"].includes(databaseHost) || !["localhost", "127.0.0.1"].includes(endpoint.hostname)) throw new Error("QA database must be loopback");
  neonConfig.fetchEndpoint = endpoint.toString();
}

/**
 * Neon over HTTP: one round trip per statement, no connection to hold.
 * `db` is null when DATABASE_URL is unset so every caller can degrade to an
 * empty "sensor offline" state instead of throwing.
 */
export const db = url ? drizzle(neon(url), { schema }) : null;

export type Db = NonNullable<typeof db>;

export function requireDb(): Db {
  if (!db) throw new Error("no-database");
  return db;
}

export { schema };
