import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

// No fallback credentials: without DATABASE_URL, queries fail and the page shows setup help.
// Channel binding (SCRAM-SHA-256-PLUS) ties the login to the TLS session when the server offers it,
// as Neon does; plain local connections simply fall back to SCRAM-SHA-256.
// Idle connections close after pg's default 10 s, so Neon can scale to zero between polls.
export const pool =
  globalForPg.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, enableChannelBinding: true });

if (!globalForPg.pgPool) {
  // On Vercel, release idle clients before the function suspends so connections don't leak.
  attachDatabasePool(pool);
  if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
}

/** Applies any db/migrations/*.sql files not yet recorded in schema_migrations. */
export async function migrate(): Promise<string[]> {
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    // Serialise concurrent migrators (e.g. dev server + CLI script).
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    client.release();
  }
  return applied;
}
