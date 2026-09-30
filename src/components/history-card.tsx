import { bandFor, PSI_BANDS } from "@/lib/bands";
import { fmtDate } from "@/lib/format";
import type { HistoryContext } from "@/lib/queries";
import { DAY } from "@/lib/time";
import { Card } from "./card";
import { StatusLabel } from "./status";

const YEAR_MS = 365 * DAY;

/** How today's islandwide 24-hr PSI compares with the stored history. */
export function HistoryCard({ psi, at, history }: { psi: number; at: Date; history: HistoryContext }) {
  const { percentile, lastThisHigh, recordsSince, yearAgo, coverage } = history;
  const fullYear = recordsSince != null && at.getTime() - recordsSince.getTime() >= YEAR_MS;
  const period = fullYear ? "the past year" : `stored history (since ${fmtDate.format(recordsSince ?? at)})`;

  return (
    <Card title="How today compares" subtitle="Islandwide 24-hr PSI against the stored history" className="text-sm">
      <ul className="space-y-1">
        {percentile != null && (
          <li>
            Worse than <strong className="font-semibold">{percentile}%</strong> of hours in {period}
          </li>
        )}
        {percentile != null && percentile >= 75 && (
          <li>
            {lastThisHigh
              ? `Before this week, last this high on ${fmtDate.format(lastThisHigh)}`
              : `Highest in ${period}, apart from this week`}
          </li>
        )}
        <li className="flex flex-wrap items-center gap-x-1.5">
          A year ago: {yearAgo == null ? <span className="text-muted">no data</span> : (
            <>
              <strong className="font-semibold">{yearAgo}</strong>
              <StatusLabel band={bandFor(PSI_BANDS, yearAgo)} className="text-xs text-ink-2" />
              <span className="text-xs text-muted">(now {psi})</span>
            </>
          )}
        </li>
      </ul>
      {coverage != null && coverage < 95 && (
        <p className="mt-1.5 text-xs text-muted">
          Based on {coverage}% of the hours in that period; older readings are still being loaded.
        </p>
      )}
    </Card>
  );
}
