const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` with a timeout that retries 429 and 5xx responses with exponential backoff, and throws on
 * any other failure. Error messages name only the host, never the URL, since some URLs carry API keys.
 */
export async function fetchOk(url: string, headers: Record<string, string> = {}, attempt = 0): Promise<Response> {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(2 ** attempt * 2000);
    return fetchOk(url, headers, attempt + 1);
  }
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res;
}

// Upstream responses are untrusted: these narrow unknown JSON values instead of casting them.
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The URL if it is https, else null (so a feed can never smuggle in a `javascript:` link). */
export function httpsUrl(v: string): string | null {
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
export const logError = (what: string, err: unknown) => console.error(`[hazelite] ${what} failed:`, errorMessage(err));
