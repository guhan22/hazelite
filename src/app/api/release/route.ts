import { announceRelease } from "@/lib/alerts";
import { isScheduler } from "@/lib/auth";
import { logError } from "@/lib/http";

export const dynamic = "force-dynamic";

const VERSION = /^[\w.-]{1,64}$/;

/**
 * Announces a new production version to update subscribers. Called by the GitHub Actions workflow
 * once Vercel reports the deployment live, with `{ version: <commit sha>, summary: <first line of the commit> }`.
 */
export async function POST(request: Request) {
  if (!isScheduler(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { version?: unknown; summary?: unknown } | null;
  const version = typeof body?.version === "string" && VERSION.test(body.version) ? body.version : null;
  if (!version) return Response.json({ error: "invalid version" }, { status: 400 });
  const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 200) : "";
  try {
    return Response.json({ sent: await announceRelease(version, summary) });
  } catch (err) {
    logError("release announcement", err);
    return Response.json({ error: "announcement failed" }, { status: 502 });
  }
}
