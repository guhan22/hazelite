"use client";

import { useState } from "react";
import { nearestRegion } from "@/lib/geo";
import type { Region } from "@/lib/schema";
import { pill } from "./styles";

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
      <button type="button" onClick={locate} className={`text-xs ${pill(false)} ${className}`}>
        Use my location
      </button>
      {status && (
        <p className="basis-full text-right text-xs text-muted" role="status">
          {status}
        </p>
      )}
    </>
  );
}
