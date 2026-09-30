import { bandFor, pm25GuideFor, PM25_BANDS, type Severity } from "./bands";
import { pool } from "./db";
import { titleCase } from "./format";
import { logError } from "./http";
import { pushConfigured, send, type Notice, type Subscription } from "./push";
import { getLatest } from "./queries";

const rank = (s: Severity) => PM25_BANDS.findIndex((b) => b.severity === s);
/** Hours between a clear and the next alert (or between clears), so a reading hovering on a boundary doesn't spam. */
const COOLDOWN_HOURS = 2;
/** Readings older than this are too stale to alert on. */
const MAX_AGE_HOURS = 2;

type Tracked = Subscription & { lastSeverity: Severity; cooling: boolean };

/**
 * What to do for one subscriber given their area's current severity:
 * - "alert" when it reaches their level or gets worse after that (escalations ignore the cooldown);
 * - "clear" once it drops back below their level;
 * - "track" to quietly follow an improvement that's still at or above their level, so a later rise alerts again.
 */
export function decide(sub: Pick<Tracked, "level" | "lastSeverity" | "cooling">, now: Severity): "alert" | "clear" | "track" | null {
  const [cur, last, level] = [rank(now), rank(sub.lastSeverity), rank(sub.level)];
  if (cur >= level && cur > last) return last >= level || !sub.cooling ? "alert" : null;
  if (cur < level && last >= level) return sub.cooling ? null : "clear";
  if (cur >= level && cur < last) return "track";
  return null;
}

function notice(action: "alert" | "clear", sub: Tracked, pm25: number): Notice {
  const band = bandFor(PM25_BANDS, pm25)!;
  const where = titleCase(sub.region);
  return action === "alert"
    ? { title: `Haze alert · ${where}`, body: `1-hr PM2.5 is ${band.label} (${pm25} µg/m³). ${pm25GuideFor(band.severity, sub.profile)}.`, tag: `hazelite-${sub.region}` }
    : band.severity === "good"
      ? { title: `Air has cleared · ${where}`, body: `1-hr PM2.5 is back to ${band.label} (${pm25} µg/m³).`, tag: `hazelite-${sub.region}` }
      : { title: `Haze easing · ${where}`, body: `1-hr PM2.5 is down to ${band.label} (${pm25} µg/m³), below your alert level.`, tag: `hazelite-${sub.region}` };
}

/** Confirms a new or changed subscription straight away, which also proves notifications get through. */
export function confirmation(sub: Subscription): Notice {
  const level = PM25_BANDS.find((b) => b.severity === sub.level)!;
  return {
    title: `Haze alerts on · ${titleCase(sub.region)}`,
    body: `We'll tell you when 1-hr PM2.5 reaches ${level.label} (${level.min}+ µg/m³), and when it clears.`,
    tag: "hazelite-confirm",
  };
}

/** Checks every subscriber against the latest readings and sends what's due. Never throws. */
export async function sendAlerts(): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const latest = await getLatest();
    if (!latest[0] || Date.now() - latest[0].observedAt.getTime() > MAX_AGE_HOURS * 3_600_000) return;
    const pm25 = new Map(latest.map((r) => [r.region, r.pm25_1h]));

    const { rows } = await pool.query<Tracked>(
      `SELECT endpoint, p256dh, auth, region, level, profile, last_severity AS "lastSeverity",
              coalesce(notified_at > now() - make_interval(hours => $1), false) AS cooling
       FROM push_subscriptions`,
      [COOLDOWN_HOURS],
    );
    const results = await Promise.allSettled(
      rows.map(async (sub) => {
        const value = pm25.get(sub.region);
        const band = bandFor(PM25_BANDS, value);
        const action = band && decide(sub, band.severity);
        if (!action) return;
        // Compare-and-set on the last severity, so overlapping runs notify each change once.
        const { rowCount } = await pool.query(
          `UPDATE push_subscriptions SET last_severity = $3${action === "track" ? "" : ", notified_at = now()"}
           WHERE endpoint = $1 AND last_severity = $2`,
          [sub.endpoint, sub.lastSeverity, band.severity],
        );
        if (rowCount && action !== "track") await send(sub, notice(action, sub, value!));
      }),
    );
    results.forEach((r) => r.status === "rejected" && logError("alert", r.reason));
  } catch (err) {
    logError("alerts", err);
  }
}
