import { logError } from "@/lib/http";
import { deleteSubscription, parseEndpoint, parseSubscription, pushConfigured, saveSubscription } from "@/lib/push";
import { fail, readJson } from "@/lib/route";

export const dynamic = "force-dynamic";

/** Subscribes this browser to haze alerts, or updates its choices. */
export async function POST(request: Request) {
  if (!pushConfigured()) return fail(503, "alerts unavailable");
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const sub = parseSubscription(body);
  if (!sub) return fail(400, "invalid subscription");
  try {
    if (!(await saveSubscription(sub))) return fail(503, "alerts are full");
    return Response.json({ ok: true });
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
