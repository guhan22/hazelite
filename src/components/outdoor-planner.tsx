"use client";

import { bandFor, pm25GuideFor, PM25_BANDS, PROFILE_IDS, PROFILES, type Profile } from "@/lib/bands";
import { titleCase } from "@/lib/format";
import type { LatestReading } from "@/lib/queries";
import { REGIONS, type Region } from "@/lib/schema";
import { useStoredChoice } from "@/lib/use-stored-choice";
import { AreaSelect } from "./area-select";
import { Card } from "./card";
import { Segmented } from "./segmented";
import { StatusIcon } from "./status";

/** "Can I go out?": NEA's next-hour activity guide for the viewer's area and health profile. */
export function OutdoorPlanner({
  readings,
  tomorrow,
  className,
}: {
  className?: string;
  readings: Pick<LatestReading, "region" | "pm25_1h">[];
  /** The model's highest PM2.5 for tomorrow's daytime, islandwide. */
  tomorrow: number | null;
}) {
  const [profile, setProfile] = useStoredChoice<Profile>("hazelite:profile", PROFILE_IDS, "general");
  const [region, setRegion] = useStoredChoice<Region>("hazelite:region", REGIONS, "central");

  const pm25 = readings.find((r) => r.region === region)?.pm25_1h ?? null;
  const band = bandFor(PM25_BANDS, pm25);
  const tomorrowBand = bandFor(PM25_BANDS, tomorrow);

  return (
    <Card title="Can I go out?" subtitle="NEA's guide for the next hour, based on the latest 1-hr PM2.5 reading" className={className}>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <Segmented label="Health profile" value={profile} options={PROFILES} onChange={setProfile} />
        <AreaSelect value={region} onChange={setRegion} className="ml-auto" />
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-border p-4" aria-live="polite">
        {band && <StatusIcon severity={band.severity} size="1.5rem" />}
        <div>
          <p className="text-lg font-medium">{band ? pm25GuideFor(band.severity, profile) : "No recent PM2.5 reading for this area"}</p>
          <p className="mt-0.5 text-sm text-ink-2">
            1-hr PM2.5 in {titleCase(region)}: {pm25 ?? "–"} µg/m³{band && ` · ${band.label}`}
          </p>
        </div>
      </div>

      {tomorrowBand && (
        <div className="mt-2 flex items-start gap-3 rounded-lg border border-dashed border-border px-4 py-3">
          <StatusIcon severity={tomorrowBand.severity} size="1.25rem" />
          <p className="text-sm">
            <span className="font-medium">Tomorrow, 7 am–7 pm:</span> {pm25GuideFor(tomorrowBand.severity, profile, "")}
            <span className="block text-xs text-ink-2">
              Model forecast: PM2.5 up to {tomorrow} µg/m³ · {tomorrowBand.label}
            </span>
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        Vulnerable means the elderly, pregnant women, children, and people with chronic lung or heart disease. This guide
        isn&apos;t prescriptive; if you feel unwell, seek medical attention. Tomorrow&apos;s line is a computer-model forecast for
        Singapore as a whole, so check again in the morning.
      </p>
    </Card>
  );
}
