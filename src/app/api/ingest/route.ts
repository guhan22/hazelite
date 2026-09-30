import { isScheduler } from "@/lib/auth";
import { logError } from "@/lib/http";
import { refreshAll } from "@/lib/refresh";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isScheduler(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ rows: await refreshAll() });
  } catch (err) {
    logError("ingest via API", err);
    return Response.json({ error: "ingest failed" }, { status: 502 });
  }
}

/** Triggers an immediate refresh. Vercel Cron calls GET; other schedulers (GitHub Actions) POST. */
export const GET = handle;
export const POST = handle;
