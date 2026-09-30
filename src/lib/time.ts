export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
/** Singapore is UTC+8 all year (no daylight saving). */
export const SGT_OFFSET = 8 * HOUR;

/** Start of the SGT calendar day `daysAhead` days after the one containing `t`, as epoch ms. */
export const sgtDayStart = (t: number, daysAhead = 0) => Math.floor((t + SGT_OFFSET) / DAY) * DAY - SGT_OFFSET + daysAhead * DAY;

/** YYYY-MM-DD in Singapore time, `daysAgo` days before now. */
export const sgtDate = (daysAgo = 0) => new Date(Date.now() + SGT_OFFSET - daysAgo * DAY).toISOString().slice(0, 10);
