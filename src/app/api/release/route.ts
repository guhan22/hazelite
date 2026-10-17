import { announceRelease } from "@/lib/alerts";
import { isScheduler } from "@/lib/auth";
import { logError } from "@/lib/http";
import { fail, readJson } from "@/lib/route";

export const dynamic = "force-dynamic";

const VERSION = /^[\w.-]{1,64}$/;

/**
 * Announces a new production version to update subscribers. Called by the GitHub Actions workflow
 * once Vercel reports the deployment live, with `{ version: <commit sha>, summary: <the commit's
 * Release-Note trailer, or empty> }`.
 */
export async function POST(request: Request) {
  if (!isScheduler(request)) return fail(401, "unauthorized");
  const parsed = await readJson(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed as { version?: unknown; summary?: unknown } | null;
  const version = typeof body?.version === "string" && VERSION.test(body.version) ? body.version : null;
  if (!version) return fail(400, "invalid version");
  const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 200) : "";
  try {
    return Response.json({ sent: await announceRelease(version, summary) });
  } catch (err) {
    logError("release announcement", err);
    return fail(502, "announcement failed");
  }
}
