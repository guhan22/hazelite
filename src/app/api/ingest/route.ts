import { createHash, timingSafeEqual } from "node:crypto";
import { refreshAll } from "@/lib/refresh";

export const dynamic = "force-dynamic";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Fails closed: with no secret configured, nobody may trigger an ingest over HTTP.
 * CRON_SECRET is what Vercel Cron sends as a bearer token; INGEST_TOKEN serves other schedulers.
 */
function authorized(request: Request) {
  const presented = digest(request.headers.get("authorization") ?? "");
  // Compare fixed-length digests in constant time so a secret can't be guessed byte by byte.
  return [process.env.CRON_SECRET, process.env.INGEST_TOKEN].some(
    (secret) => !!secret && timingSafeEqual(presented, digest(`Bearer ${secret}`)),
  );
}

async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ rows: await refreshAll() });
  } catch (err) {
    console.error("[hazelite] ingest via API failed:", err);
    return Response.json({ error: "ingest failed" }, { status: 502 });
  }
}

/** Triggers an immediate refresh. Vercel Cron calls GET; other schedulers (GitHub Actions) POST. */
export const GET = handle;
export const POST = handle;
