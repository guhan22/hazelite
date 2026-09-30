export const sgtFormat = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", ...opts });

/** e.g. "Wed, 30 Sept, 1:00 pm" in Singapore time. */
export const fmtDateTime = sgtFormat({ weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** e.g. "30 Sept 2026" in Singapore time. */
export const fmtDate = sgtFormat({ day: "numeric", month: "short", year: "numeric" });

/** Label for a series point: date and time for hourly points, just the date for daily ones. */
export const fmtPoint = (t: number, bucket: "hour" | "day") => (bucket === "day" ? fmtDate : fmtDateTime).format(t);

export const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);
