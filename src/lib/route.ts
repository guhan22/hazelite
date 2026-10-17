// Shared helpers for the API routes.

export const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Public read-only data, cached by the CDN for five minutes (and served stale while refreshing), so
 * however often it's requested the database sees about one query per path every few minutes.
 */
export const publicJson = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });

const MAX_BODY = 4096;

/**
 * Reads a small JSON body, or returns the error response to send. Cross-site browser requests are
 * refused (browsers send Sec-Fetch-Site; server-to-server callers don't), and requiring JSON keeps a
 * plain HTML form on another site from posting here.
 */
export async function readJson(request: Request): Promise<unknown | Response> {
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
