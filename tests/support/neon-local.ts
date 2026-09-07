import { createServer } from "node:http";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { Pool, type PoolClient, type QueryResult } from "pg";
import * as schema from "../../src/lib/db/schema";
import type { Db } from "../../src/lib/db";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

export function requireQaDatabaseUrl(value = process.env.QA_DATABASE_URL): string {
  if (!value) throw new Error("Set QA_DATABASE_URL explicitly for an isolated local QA database.");
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !LOOPBACK_HOSTS.has(url.hostname) ||
      !/^gcdtracker_qa[a-z0-9_]*$/.test(database) ||
      !url.username || url.search || url.hash) {
    throw new Error("QA_DATABASE_URL must name a loopback gcdtracker_qa* PostgreSQL database without URL parameters.");
  }
  return value;
}

interface NeonQuery { query: string; params: unknown[] }
interface NeonBody { queries?: NeonQuery[]; query?: string; params?: unknown[] }

function validateQuery(value: unknown): NeonQuery {
  if (!value || typeof value !== "object") throw new Error("Expected a serialized Neon query.");
  const query = value as NeonQuery;
  if (typeof query.query !== "string" || !Array.isArray(query.params)) throw new Error("Expected SQL and a parameter array.");
  return query;
}

/** Preserve PostgreSQL wire values so Neon's own OID parsers, then Drizzle's mappers, run normally. */
async function rawQuery(client: PoolClient, query: NeonQuery) {
  const result = await client.query({
    text: query.query, values: query.params, rowMode: "array",
    types: { getTypeParser: () => (value: string) => value },
  });
  if (Array.isArray(result)) throw new Error("Send separate queries for separate statements.");
  return {
    command: result.command, rowCount: result.rowCount, rows: result.rows,
    fields: result.fields.map((field) => ({
      name: field.name, tableID: field.tableID, columnID: field.columnID,
      dataTypeID: field.dataTypeID, dataTypeSize: field.dataTypeSize,
      dataTypeModifier: field.dataTypeModifier, format: "text",
    })),
  };
}

const ISOLATION_LEVELS: Record<string, string> = {
  ReadCommitted: "READ COMMITTED", ReadUncommitted: "READ UNCOMMITTED",
  RepeatableRead: "REPEATABLE READ", Serializable: "SERIALIZABLE",
};

async function executeNeonBody(pool: Pool, body: NeonBody, headers: Headers) {
  const batch = body.queries !== undefined;
  const queries = batch
    ? (Array.isArray(body.queries) ? body.queries.map(validateQuery) : (() => { throw new Error("Invalid query batch."); })())
    : [validateQuery(body)];
  if (!queries.length || queries.length > 1000) throw new Error("Invalid batch size.");
  const client = await pool.connect();
  let transaction = false;
  try {
    if (batch) {
      const requestedIsolation = headers.get("neon-batch-isolation-level") ?? "ReadCommitted";
      const isolation = ISOLATION_LEVELS[requestedIsolation];
      if (!isolation) throw new Error("Unsupported transaction isolation.");
      const readOnly = headers.get("neon-batch-read-only") === "true";
      const deferrable = headers.get("neon-batch-deferrable") === "true";
      await client.query("BEGIN ISOLATION LEVEL " + isolation + (readOnly ? " READ ONLY" : " READ WRITE") + (deferrable ? " DEFERRABLE" : " NOT DEFERRABLE"));
      transaction = true;
    }
    const results = [];
    for (const query of queries) results.push(await rawQuery(client, query));
    if (transaction) { await client.query("COMMIT"); transaction = false; }
    return batch ? { results } : results[0];
  } catch (error) {
    if (transaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface NeonBridge {
  db: Db;
  pool: Pool;
  query: Pool["query"];
  endpoint: string;
  connectionString: string;
  close(): Promise<void>;
}

/** Test-only HTTP adapter. The pool can only target the explicit isolated QA URL, never DATABASE_URL. */
export async function createNeonBridge(options: { port?: number } = {}): Promise<NeonBridge> {
  const connectionString = requireQaDatabaseUrl();
  const expected = new URL(connectionString);
  const pool = new Pool({ connectionString, max: 24, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 });
  const check: QueryResult<{ database: string }> = await pool.query("select current_database() as database");
  if (check.rows[0]?.database !== decodeURIComponent(expected.pathname.slice(1))) {
    await pool.end();
    throw new Error("Connected database does not match the explicit QA database.");
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST" || req.url !== "/sql") {
      res.writeHead(404); res.end(JSON.stringify({ message: "QA bridge route not found." })); return;
    }
    try {
      const header = req.headers["neon-connection-string"];
      if (typeof header !== "string") throw new Error("Missing Neon connection header.");
      const requested = new URL(requireQaDatabaseUrl(header));
      if (requested.hostname !== expected.hostname || requested.port !== expected.port ||
          requested.pathname !== expected.pathname || requested.username !== expected.username || requested.password !== expected.password) {
        throw new Error("Neon request does not match the configured QA database.");
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > MAX_REQUEST_BYTES) throw new Error("QA query payload too large.");
        chunks.push(buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as NeonBody;
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
      const result = await executeNeonBody(pool, body, headers);
      res.writeHead(200); res.end(JSON.stringify(result));
    } catch (error) {
      const detail = error as Error & { code?: string; severity?: string; detail?: string; constraint?: string };
      res.writeHead(400);
      res.end(JSON.stringify({ message: detail.message, code: detail.code, severity: detail.severity, detail: detail.detail, constraint: detail.constraint }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("QA bridge failed to bind loopback.");
  const endpoint = "http://127.0.0.1:" + address.port + "/sql";
  const priorEndpoint = neonConfig.fetchEndpoint;
  const priorFetch = neonConfig.fetchFunction;
  neonConfig.fetchEndpoint = endpoint;
  neonConfig.fetchFunction = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== endpoint) throw new Error("QA Neon fetch attempted a non-bridge endpoint.");
    return globalThis.fetch(input, init);
  };
  const db = drizzle(neon(connectionString), { schema });
  return {
    db, pool, query: pool.query.bind(pool), endpoint, connectionString,
    async close() {
      neonConfig.fetchEndpoint = priorEndpoint;
      neonConfig.fetchFunction = priorFetch;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await pool.end();
    },
  };
}
