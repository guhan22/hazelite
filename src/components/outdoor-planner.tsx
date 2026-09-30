"use client";

import { useState } from "react";
import { bandFor, pm25GuideFor, PM25_BANDS, type Profile } from "@/lib/bands";
import { titleCase } from "@/lib/format";
import { nearestRegion } from "@/lib/geo";
import type { LatestReading } from "@/lib/queries";
import { REGIONS, type Region } from "@/lib/schema";
import { useStoredChoice } from "@/lib/use-stored-choice";
import { StatusIcon } from "./status";

const PROFILES: { id: Profile; label: string }[] = [
  { id: "general", label: "Generally healthy" },
  { id: "vulnerable", label: "Vulnerable" },
];

// Rough bounding box for mainland Singapore and its nearby islands.
const inSingapore = (lat: number, lon: number) => lat > 1.15 && lat < 1.48 && lon > 103.6 && lon < 104.1;

const segment = (active: boolean) =>
  `rounded-full border px-3 py-1 transition-colors ${active ? "border-ink bg-ink text-page" : "border-border text-ink-2 hover:bg-grid"}`;

/** "Can I go out?": NEA's next-hour activity guide for the viewer's area and health profile. */
export function OutdoorPlanner({ readings }: { readings: Pick<LatestReading, "region" | "pm25_1h">[] }) {
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

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5" aria-labelledby="planner-title">
      <h2 id="planner-title" className="text-base font-semibold">
        Can I go out?
      </h2>
      <p className="text-xs text-muted">NEA&apos;s guide for the next hour, based on the latest 1-hr PM2.5 reading</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex gap-1.5" role="group" aria-label="Health profile">
          {PROFILES.map((p) => (
            <button key={p.id} type="button" aria-pressed={profile === p.id} onClick={() => setProfile(p.id)} className={segment(profile === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-ink-2">
          Area
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as Region)}
            className="rounded-full border border-border bg-surface px-3 py-1 text-ink"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={locate} className={segment(false)}>
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

      <p className="mt-3 text-xs text-muted">
        Vulnerable means the elderly, pregnant women, children, and people with chronic lung or heart disease. This guide
        isn&apos;t prescriptive; if you feel unwell, seek medical attention. For tomorrow&apos;s plans, use the 24-hr PSI health
        advisory above.
      </p>
    </section>
  );
}
