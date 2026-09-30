"use client";

import { useCallback, useState } from "react";
import { bandFor, pm25GuideFor } from "@/lib/bands";
import { sgtFormat, titleCase } from "@/lib/format";
import { METRICS, type TileReading } from "@/lib/metrics";
import type { SeriesPoint } from "@/lib/queries";
import { REGIONS, type Region } from "@/lib/schema";
import { worstBy } from "@/lib/summary";
import { tipsFor } from "@/lib/tips";
import type { Wind } from "@/lib/wind";
import { HazeOverlay } from "./haze-overlay";
import { MOOD_LABEL } from "./mascot";
import { MetricToggle, useMetric } from "./metric-toggle";
import { PlayfulMascot } from "./playful-mascot";
import { RegionMap } from "./region-map";
import { ShareButton } from "./share-button";
import { TimeMachine } from "./time-machine";
import { WindBadge } from "./wind-badge";

const fmtFrame = sgtFormat({ weekday: "short", day: "numeric", month: "short", hour: "numeric" });

interface Props {
  readings: TileReading[];
  /** Hourly points for the replay, oldest first. */
  replay: SeriesPoint[];
  wind: { islandwide: Wind | null; byRegion: Partial<Record<Region, Wind>> };
}

const frameReadings = (p: SeriesPoint): TileReading[] =>
  REGIONS.map((region) => ({ region, psi24h: p.values[region]?.psi ?? null, pm25_1h: p.values[region]?.pm25 ?? null }));

/**
 * The interactive heart of the dashboard: region tiles, a metric toggle, a 72-hour replay, and a
 * mascot whose mood follows the area in focus (the selected region, or the worst one).
 */
export function RegionExplorer({ readings, replay, wind }: Props) {
  const [selected, setSelected] = useState<Region | null>(null);
  const [metricId] = useMetric();
  const [frame, setFrame] = useState<number | null>(null);
  const [tip, setTip] = useState<number | null>(null);
  const onFrame = useCallback((i: number | null) => setFrame(i), []);

  const metric = METRICS[metricId];
  const shown = frame == null ? readings : frameReadings(replay[frame]);
  const focusIn = (rs: TileReading[]) => (selected ? rs.find((r) => r.region === selected) : worstBy(rs, metric.value));
  const focus = focusIn(shown);
  const value = focus ? metric.value(focus) : null;
  const band = bandFor(metric.bands, value);
  const severity = band?.severity ?? "good";
  const where = selected ? titleCase(selected) : "Islandwide";
  const tips = tipsFor(severity);

  // Sharing always describes the live reading, even mid-replay.
  const live = focusIn(readings);
  const pmBand = bandFor(METRICS.pm25.bands, live?.pm25_1h);
  const psiBand = bandFor(METRICS.psi.bands, live?.psi24h);
  const shareText = live
    ? `Haze check, ${selected ? titleCase(selected) : "Singapore"}: 1-hr PM2.5 ${live.pm25_1h ?? "–"} µg/m³ (${pmBand?.label ?? "no data"}), ` +
      `24-hr PSI ${live.psi24h ?? "–"} (${psiBand?.label ?? "no data"}). ` +
      (pmBand ? `${pm25GuideFor(pmBand.severity, "general")}.` : "")
    : "Singapore haze monitor";

  return (
    <div className="flex flex-col gap-4">
      <HazeOverlay pm25={focus?.pm25_1h ?? null} />

      <MetricToggle />

      <div className="flex items-end gap-3">
        <PlayfulMascot
          severity={severity}
          label={`The dragon is ${MOOD_LABEL[severity]}. Tap for a tip`}
          onPoke={() => setTip((t) => (t == null ? 0 : t + 1))}
        />
        <div className="mb-2 flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl rounded-bl-sm border border-border bg-surface px-3 py-2 text-sm" aria-live="polite">
          <div>
            <div className="text-xs text-muted">
              {where}
              {frame != null && ` · ${fmtFrame.format(replay[frame].t)}`}
            </div>
            <div className="font-medium">
              {metric.name} {value ?? "–"}
              {metric.unit && ` ${metric.unit}`} · {band?.label ?? "No data"}
            </div>
            <div className="text-xs text-ink-2">
              {tip == null ? `The dragon is ${MOOD_LABEL[severity]}. Tap it for a tip!` : tips[tip % tips.length]}
            </div>
          </div>
          {/* Wind is live-only; a region without a nearby station falls back to the islandwide wind. */}
          {frame == null && <WindBadge wind={(selected && wind.byRegion[selected]) || wind.islandwide} hazy={severity !== "good"} />}
        </div>
      </div>

      <RegionMap readings={shown} metric={metric} selected={selected} onSelect={(r) => setSelected((cur) => (cur === r ? null : r))} />

      <TimeMachine times={replay.map((p) => p.t)} index={frame} onChange={onFrame} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{selected ? "Tap the region again for islandwide" : "Tap a region"}</p>
        <ShareButton title="Hazelite" text={shareText} />
      </div>
    </div>
  );
}
