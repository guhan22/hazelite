"use client";

import { useState } from "react";
import { bandFor, pm25GuideFor, PM25_BANDS, type Profile } from "@/lib/bands";
import { titleCase } from "@/lib/format";
import { nearestRegion } from "@/lib/geo";
import type { LatestReading } from "@/lib/queries";
import { REGIONS, type Region } from "@/lib/schema";
import { useStoredChoice } from "@/lib/use-stored-choice";
import { Card } from "./card";
import { field, pill } from "./styles";
import { StatusIcon } from "./status";

const PROFILES: { id: Profile; label: string }[] = [
  { id: "general", label: "Generally healthy" },
  { id: "vulnerable", label: "Vulnerable" },
];

// Rough bounding box for mainland Singapore and its nearby islands.
const inSingapore = (lat: number, lon: number) => lat > 1.15 && lat < 1.48 && lon > 103.6 && lon < 104.1;

/** "Can I go out?": NEA's next-hour activity guide for the viewer's area and health profile. */
export function OutdoorPlanner({
  readings,
  tomorrow,
}: {
  readings: Pick<LatestReading, "region" | "pm25_1h">[];
  /** The model's highest PM2.5 for tomorrow's daytime, islandwide. */
  tomorrow: number | null;
}) {
  const [profile, setProfile] = useStoredChoice<Profile>("hazelite:profile", ["general", "vulnerable"], "general");
  const [region, setRegion] = useStoredChoice<Region>("hazelite:region", REGIONS, "central");
  const [locating, setLocating] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("Location isn't available in this browser.");
    setLocating("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!inSingapore(coords.latitude, coords.longitude)) return setLocating("You seem to be outside Singapore.");
        setRegion(nearestRegion(coords.latitude, coords.longitude));
        setLocating(null);
      },
      () => setLocating("Couldn't get your location. Pick your area instead."),
      { maximumAge: 10 * 60_000, timeout: 10_000 },
    );
  };

  const pm25 = readings.find((r) => r.region === region)?.pm25_1h ?? null;
  const band = bandFor(PM25_BANDS, pm25);
  const tomorrowBand = bandFor(PM25_BANDS, tomorrow);

  return (
    <Card title="Can I go out?" subtitle="NEA's guide for the next hour, based on the latest 1-hr PM2.5 reading" className="mt-6">
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex gap-1.5" role="group" aria-label="Health profile">
          {PROFILES.map((p) => (
            <button key={p.id} type="button" aria-pressed={profile === p.id} onClick={() => setProfile(p.id)} className={pill(profile === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-ink-2">
          Area
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
            className={field}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={locate} className={pill(false)}>
          Use my location
        </button>
      </div>
      {locating && (
        <p className="mt-2 text-xs text-muted" role="status">
          {locating}
        </p>
      )}

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
