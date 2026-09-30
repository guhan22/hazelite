import { upwindArea } from "@/lib/fires";
import type { Wind } from "@/lib/wind";

/** Wind direction arrow (pointing downwind) with compass and speed. */
export function WindBadge({ wind, hazy }: { wind: Wind | null | undefined; hazy: boolean }) {
  if (!wind) return <span className="text-xs text-muted">Wind: no recent data</span>;
  const upwind = upwindArea(wind.fromDeg);
  return (
    <span className="flex flex-col gap-0.5 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <svg
          width="1.1em"
          height="1.1em"
          viewBox="0 0 24 24"
          aria-hidden
          style={{ transform: `rotate(${wind.fromDeg + 180}deg)` }}
          className="shrink-0 text-ink"
        >
          {/* Points north at 0°; rotated to the downwind bearing. */}
          <path d="M12 21V4M5 11l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Wind from the {wind.compass} · {wind.speedKmh} km/h
      </span>
      {hazy && upwind && <span className="text-muted">Winds from the {wind.compass} can carry smoke from fires in {upwind.name}.</span>}
    </span>
  );
}
