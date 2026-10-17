import { isScheduler } from "@/lib/auth";
import { logError } from "@/lib/http";
import { refreshAll } from "@/lib/refresh";
import { fail } from "@/lib/route";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!isScheduler(request)) return fail(401, "unauthorized");
  try {
    return Response.json({ rows: await refreshAll() });
  } catch (err) {
    logError("ingest via API", err);
    return fail(502, "ingest failed");
  }
}

/** Triggers an immediate refresh. Vercel Cron calls GET; other schedulers (GitHub Actions) POST. */
export const GET = handle;
export const POST = handle;
