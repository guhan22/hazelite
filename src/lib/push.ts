import webpush from "web-push";
import { ALERT_LEVELS, PROFILE_IDS, type AqiLevel, type Profile } from "./bands";
import { pool } from "./db";
import { REGIONS, type Region } from "./schema";

const MAX_SUBSCRIPTIONS = 10_000;

/**
 * The server POSTs to whatever endpoint a browser registers, so only the real push services are
 * accepted (otherwise the alert sender could be pointed at internal or arbitrary hosts).
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/];
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
  region: Region;
  level: AqiLevel;
  profile: Profile;
  /** Also notify when a new version of the app goes live. */
  updates: boolean;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (allowed.includes(v as T) ? (v as T) : null);

function validEndpoint(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1000) return null;
  try {
    const url = new URL(v);
    return url.protocol === "https:" && PUSH_HOSTS.some((h) => h.test(url.hostname)) ? v : null;
  } catch {
    return null;
  }
}

const validKey = (v: unknown, min: number, max: number) =>
  typeof v === "string" && v.length >= min && v.length <= max && BASE64URL.test(v) ? v : null;

/** Validates a browser's PushSubscription JSON plus the alert choices. Null if anything is off. */
export function parseSubscription(body: unknown): Subscription | null {
  const b = body as {
    subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    region?: unknown;
    level?: unknown;
    profile?: unknown;
    updates?: unknown;
  } | null;
  const endpoint = validEndpoint(b?.subscription?.endpoint);
  const p256dh = validKey(b?.subscription?.keys?.p256dh, 80, 100); // 65-byte P-256 public key
  const auth = validKey(b?.subscription?.keys?.auth, 16, 32); // 16-byte secret
  const region = pick(b?.region, REGIONS);
  const level = pick(b?.level, ALERT_LEVELS);
  const profile = pick(b?.profile, PROFILE_IDS);
  const updates = b?.updates === true;
  return endpoint && p256dh && auth && region && level && profile ? { endpoint, p256dh, auth, region, level, profile, updates } : null;
}

export const parseEndpoint = (body: unknown) => validEndpoint((body as { endpoint?: unknown } | null)?.endpoint);

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/**
 * Saves (or updates) a subscription and resets its alert state, so the next check reports the new
 * area's level from scratch. Returns false when the table is full.
 */
export async function saveSubscription(s: Subscription): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, region, level, profile, updates)
     SELECT $1, $2, $3, $4, $5, $6, $7
     WHERE (SELECT count(*) FROM push_subscriptions) < $8 OR EXISTS (SELECT 1 FROM push_subscriptions WHERE endpoint = $1)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, region = EXCLUDED.region,
       level = EXCLUDED.level, profile = EXCLUDED.profile, updates = EXCLUDED.updates, last_severity = 'good', notified_at = NULL`,
    [s.endpoint, s.p256dh, s.auth, s.region, s.level, s.profile, s.updates, MAX_SUBSCRIPTIONS],
  );
  return rowCount === 1;
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

export interface Notice {
  title: string;
  body: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag: string;
}

/**
 * Sends one notification. Alerts go stale fast, so push services may drop them after an hour.
 * A subscription the browser has discarded (404/410) is deleted and false returned.
 */
export async function send(s: Pick<Subscription, "endpoint" | "p256dh" | "auth">, notice: Notice): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notice), {
      TTL: 3600,
      urgency: "high",
      vapidDetails: {
        subject: process.env.VAPID_SUBJECT ?? "https://hazelite.vercel.app",
        publicKey: process.env.VAPID_PUBLIC_KEY!,
        privateKey: process.env.VAPID_PRIVATE_KEY!,
      },
    });
    return true;
  } catch (err) {
    if (err instanceof webpush.WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
      await deleteSubscription(s.endpoint);
      return false;
    }
    // WebPushError's message includes the endpoint; keep logs to the host and status.
    const status = err instanceof webpush.WebPushError ? err.statusCode : "network";
    throw new Error(`push to ${new URL(s.endpoint).host} failed (${status})`);
  }
}

/** Runs `task` for every item, a batch at a time so a large subscriber list doesn't open thousands of requests at once. */
export async function settleInBatches<T>(items: T[], task: (item: T) => Promise<unknown>, size = 50) {
  const results: PromiseSettledResult<unknown>[] = [];
  for (let i = 0; i < items.length; i += size) results.push(...(await Promise.allSettled(items.slice(i, i + size).map(task))));
  return results;
}
