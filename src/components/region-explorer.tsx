"use client";

import { useState } from "react";
import { bandFor, PSI_BANDS } from "@/lib/bands";
import { titleCase } from "@/lib/format";
import type { LatestReading } from "@/lib/queries";
import type { Region } from "@/lib/schema";
import { worstRegion } from "@/lib/summary";
import type { Wind } from "@/lib/wind";
import { Mascot, MOOD_LABEL } from "./mascot";
import { RegionMap } from "./region-map";
import { WindBadge } from "./wind-badge";

interface Props {
  readings: LatestReading[];
  wind: { islandwide: Wind | null; byRegion: Partial<Record<Region, Wind>> };
}

/** Region tiles plus a mascot whose expression tracks the selected region's 24-hr PSI band. */
export function RegionExplorer({ readings, wind }: Props) {
  const [selected, setSelected] = useState<Region | null>(null);

  // With no region picked, the mascot reflects the worst region islandwide.
  const focus = selected ? readings.find((r) => r.region === selected) : worstRegion(readings);
  const band = bandFor(PSI_BANDS, focus?.psi24h);
  const severity = band?.severity ?? "good";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <Mascot key={severity} severity={severity} className="h-32 shrink-0 animate-[mascot-pop_300ms_ease-out] sm:h-36" />
        <div className="mb-2 flex min-w-0 flex-1 flex-col gap-1.5 rounded-xl rounded-bl-sm border border-border px-3 py-2 text-sm" aria-live="polite">
          <div>
            <div className="text-xs text-muted">{selected ? titleCase(selected) : "Islandwide"}</div>
            <div className="font-medium">
              PSI {focus?.psi24h ?? "–"} · {band?.label ?? "No data"}
            </div>
            <div className="text-xs text-ink-2">The dragon is {MOOD_LABEL[severity]}</div>
          </div>
          {/* A region without a nearby station falls back to the islandwide wind. */}
          <WindBadge wind={(selected && wind.byRegion[selected]) || wind.islandwide} hazy={severity !== "good"} />
        </div>
      </div>

      <RegionMap readings={readings} selected={selected} onSelect={(r) => setSelected((cur) => (cur === r ? null : r))} />

      <p className="text-right text-xs text-muted">{selected ? "Tap the region again for islandwide" : "Tap a region"}</p>
    </div>
  );
}
