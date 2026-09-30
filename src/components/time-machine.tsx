"use client";

import { useEffect, useState } from "react";
import { sgtFormat } from "@/lib/format";

const fmtFrame = sgtFormat({ weekday: "short", hour: "numeric" });
/** One hour per step: a full 72-hour replay takes about 15 seconds. */
const STEP_MS = 200;

/**
 * Replays hourly frames: drag the slider or press play to watch the last few days unfold.
 * `index` null means live (the latest reading); playback ends by returning to live.
 */
export function TimeMachine({
  times,
  index,
  onChange,
}: {
  times: number[];
  index: number | null;
  onChange: (index: number | null) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const last = times.length - 1;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const next = (index ?? -1) + 1;
      if (next >= last) {
        setPlaying(false);
        onChange(null);
      } else onChange(next);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [playing, index, last, onChange]);

  if (times.length < 2) return null;

  const togglePlay = () => {
    // Starting from live rewinds to the first frame; starting mid-way continues from there.
    if (!playing && index == null) onChange(0);
    setPlaying((p) => !p);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause replay" : "Replay the last 72 hours"}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-page transition-transform active:scale-90"
      >
        <svg width="0.875rem" height="0.875rem" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={index ?? last}
        onChange={(e) => {
          setPlaying(false);
          const i = Number(e.target.value);
          onChange(i === last ? null : i);
        }}
        aria-label="Time"
        aria-valuetext={index == null ? "Live" : fmtFrame.format(times[index])}
        className="min-w-0 flex-1 accent-[var(--ink)]"
      />
      {index == null ? (
        <span className="w-[4.5rem] shrink-0 text-right text-xs font-medium text-ink-2">
          <span className="mr-1 inline-block size-1.5 rounded-full bg-[var(--status-good)] align-middle" aria-hidden />
          Live
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            onChange(null);
          }}
          className="w-[4.5rem] shrink-0 text-right text-xs tabular text-ink-2 underline decoration-dotted underline-offset-2"
          title="Back to live"
        >
          {fmtFrame.format(times[index])}
        </button>
      )}
    </div>
  );
}
