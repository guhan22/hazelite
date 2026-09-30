import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Whether a request carries a scheduler's bearer token: CRON_SECRET (sent by Vercel Cron) or
 * INGEST_TOKEN (GitHub Actions). Fails closed: with neither configured, nobody is authorised.
 */
export function isScheduler(request: Request): boolean {
  const presented = digest(request.headers.get("authorization") ?? "");
  // Compare fixed-length digests in constant time so a secret can't be guessed byte by byte.
  return [process.env.CRON_SECRET, process.env.INGEST_TOKEN].some(
    (secret) => !!secret && timingSafeEqual(presented, digest(`Bearer ${secret}`)),
  );
}
