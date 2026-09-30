"use client";

import { useEffect, useState } from "react";
import type { Severity } from "@/lib/bands";
import { Mascot } from "./mascot";

/** The mascot as a toy: blinks now and then, and wiggles when tapped (the parent shows a tip). */
export function PlayfulMascot({ severity, label, onPoke }: { severity: Severity; label: string; onPoke: () => void }) {
  const [blink, setBlink] = useState(false);
  const [wiggles, setWiggles] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 160);
      }, 2500 + Math.random() * 4000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        setWiggles((n) => n + 1);
        onPoke();
      }}
      aria-label={label}
      className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
    >
      {/* Re-keying restarts the animation on every tap; the inner key re-pops on a mood change. */}
      <div key={wiggles} className={wiggles ? "animate-[dragon-wiggle_600ms_ease-in-out]" : undefined}>
        <Mascot key={severity} severity={severity} blink={blink} className="h-32 animate-[mascot-pop_300ms_ease-out] sm:h-36" />
      </div>
    </button>
  );
}
