import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

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
