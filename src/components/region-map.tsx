import { bandFor } from "@/lib/bands";
import { METRICS, type Metric, type TileReading } from "@/lib/metrics";
import type { Region } from "@/lib/schema";
import { StatusLabel, statusVar } from "./status";

const AREA: Record<Region, string> = {
  north: "1 / 2",
  west: "2 / 1",
  central: "2 / 2",
  east: "2 / 3",
  south: "3 / 2",
};

/** Schematic tile map of NEA's five reporting regions, coloured by the chosen metric. */
export function RegionMap({
  readings,
  metric,
  selected,
  onSelect,
  hazeSoon = [],
}: {
  readings: TileReading[];
  metric: Metric;
  selected: Region | null;
  onSelect: (region: Region) => void;
  /** Regions where NEA's 2-hour forecast has haze in at least one area. */
  hazeSoon?: Region[];
}) {
  const other = metric.id === "psi" ? METRICS.aqi : METRICS.psi;
  return (
    <div className="grid grid-cols-3 grid-rows-3 gap-2" role="group" aria-label={`${metric.name} by region`}>
      {readings.map((r) => {
        const value = metric.value(r);
        const band = bandFor(metric.bands, value);
        const tint = band ? statusVar(band.severity) : "var(--grid)";
        const isSelected = selected === r.region;
        return (
          <button
            key={r.region}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(r.region)}
            className={`flex min-h-24 flex-col justify-between rounded-lg border p-2.5 text-left transition-[transform,background-color] duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:p-3 ${
              isSelected ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface)]" : ""
            }`}
            style={{
              gridArea: AREA[r.region],
              background: `color-mix(in srgb, ${tint} 14%, var(--surface))`,
              borderColor: `color-mix(in srgb, ${tint} 45%, transparent)`,
            }}
          >
            <span className="flex items-start justify-between gap-1 text-xs font-medium capitalize text-ink-2">
              {r.region}
              {hazeSoon.includes(r.region) && (
                <span className="rounded-full bg-surface px-1.5 text-[0.625rem] font-normal normal-case text-muted" title="NEA forecasts haze here in the next 2 hours">
                  Hazy next 2 hrs
                </span>
              )}
            </span>
            <span className="text-2xl font-semibold leading-tight sm:text-3xl">
              {value ?? "–"}
              {metric.unit && <span className="ml-0.5 text-[0.625rem] font-normal text-muted">{metric.unit}</span>}
            </span>
            <StatusLabel band={band} className="text-xs text-ink-2" />
            <span className="mt-1 text-[0.6875rem] text-muted">
              {other.name} {other.value(r) ?? "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
