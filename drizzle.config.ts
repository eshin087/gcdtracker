import { defineConfig } from "drizzle-kit";

// drizzle-kit does not load .env files; pick up .env.local (written by `vercel env pull`).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // no .env.local — DATABASE_URL must come from the environment
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
