import { bandFor, PM25_BANDS, PSI_BANDS } from "@/lib/bands";
import type { LatestReading } from "@/lib/queries";
import type { Region } from "@/lib/schema";
import { StatusLabel, statusVar } from "./status";

const AREA: Record<Region, string> = {
  north: "1 / 2",
  west: "2 / 1",
  central: "2 / 2",
  east: "2 / 3",
  south: "3 / 2",
};

/** Schematic tile map of NEA's five reporting regions, arranged by compass position. */
export function RegionMap({
  readings,
  selected,
  onSelect,
}: {
  readings: LatestReading[];
  selected: Region | null;
  onSelect: (region: Region) => void;
}) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2" role="group" aria-label="24-hr PSI by region">
      {readings.map((r) => {
        const band = bandFor(PSI_BANDS, r.psi24h);
        const pmBand = bandFor(PM25_BANDS, r.pm25_1h);
        const tint = band ? statusVar(band.severity) : "var(--grid)";
        const isSelected = selected === r.region;
        return (
          <button
            key={r.region}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(r.region)}
            className={`flex min-h-24 flex-col justify-between rounded-lg border p-2.5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:p-3 ${
              isSelected ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface)]" : ""
            }`}
            style={{
              gridArea: AREA[r.region],
              background: `color-mix(in srgb, ${tint} 14%, var(--surface))`,
              borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
            }}
          >
            <span className="text-xs font-medium capitalize text-ink-2">{r.region}</span>
            <span className="text-2xl font-semibold leading-tight sm:text-3xl">{r.psi24h ?? "–"}</span>
            <StatusLabel band={band} className="text-xs text-ink-2" />
            <span className="mt-1 text-[0.6875rem] text-muted" title={pmBand ? `1-hr PM2.5 band: ${pmBand.label}` : undefined}>
              PM2.5 {r.pm25_1h ?? "–"} µg/m³
            </span>
          </button>
        );
      })}
    </div>
  );
}
