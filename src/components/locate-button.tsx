"use client";

import { useState } from "react";
import { nearestRegion } from "@/lib/geo";
import type { Region } from "@/lib/schema";

// Rough bounding box for mainland Singapore and its nearby islands.
const inSingapore = (lat: number, lon: number) => lat > 1.15 && lat < 1.48 && lon > 103.6 && lon < 104.1;

/** "Use my location": finds the viewer's nearest NEA region. Its status line takes a full row of the parent flex-wrap. */
export function LocateButton({ onLocate, className = "" }: { onLocate: (region: Region) => void; className?: string }) {
  const [status, setStatus] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) return setStatus("Location isn't available in this browser.");
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!inSingapore(coords.latitude, coords.longitude)) return setStatus("You seem to be outside Singapore.");
        onLocate(nearestRegion(coords.latitude, coords.longitude));
        setStatus(null);
      },
      () => setStatus("Couldn't get your location. Tap your area instead."),
      { maximumAge: 10 * 60_000, timeout: 10_000 },
    );
  };

  return (
    <>
      {/* A pin fits beside the metric toggle on phones; the words show where the row has room. */}
      <button
        type="button"
        onClick={locate}
        aria-label="Use my location"
        title="Use my location"
        className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border px-[6px] text-xs text-ink-2 transition-colors hover:bg-grid sm:max-lg:px-3 ${className}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="hidden sm:max-lg:inline">Use my location</span>
      </button>
      {status && (
        <p className="basis-full text-right text-xs text-muted" role="status">
          {status}
        </p>
      )}
    </>
  );
}
