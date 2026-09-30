import { confirmation } from "@/lib/alerts";
import { logError } from "@/lib/http";
import { deleteSubscription, parseEndpoint, parseSubscription, pushConfigured, saveSubscription, send } from "@/lib/push";

export const dynamic = "force-dynamic";

const MAX_BODY = 4096;
const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Reads a small same-origin JSON body. Cross-site requests are refused (browsers send Sec-Fetch-Site),
 * and requiring JSON keeps a plain HTML form on another site from posting here.
 */
async function readJson(request: Request): Promise<unknown | Response> {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return fail(403, "forbidden");
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail(415, "expected JSON");
  const text = await request.text();
  if (text.length > MAX_BODY) return fail(413, "too large");
  try {
    return JSON.parse(text);
  } catch {
    return fail(400, "invalid JSON");
  }
}

/** Subscribes this browser to haze alerts (or updates its choices), then sends a confirmation. */
export async function POST(request: Request) {
  if (!pushConfigured()) return fail(503, "alerts unavailable");
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const sub = parseSubscription(body);
  if (!sub) return fail(400, "invalid subscription");
  try {
    if (!(await saveSubscription(sub))) return fail(503, "alerts are full");
    // Keep a subscription only once a notification has actually got through.
    const delivered = await send(sub, confirmation(sub)).catch((err) => (logError("confirmation", err), false));
    if (delivered) return Response.json({ ok: true });
    await deleteSubscription(sub.endpoint);
    return fail(502, "couldn't reach your browser's push service");
  } catch (err) {
    logError("subscribe", err);
    return fail(502, "couldn't turn on alerts");
  }
}

/** Unsubscribes. Knowing the push endpoint (a capability URL) is what authorises this. */
export async function DELETE(request: Request) {
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const endpoint = parseEndpoint(body);
  if (!endpoint) return fail(400, "invalid endpoint");
  try {
    await deleteSubscription(endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    logError("unsubscribe", err);
    return fail(502, "couldn't turn off alerts");
  }
}
