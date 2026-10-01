import Image from "next/image";
import art from "@/assets/mascots/playground.png";

// Staggered haze puffs drifting behind the dragon: [top, size, delay].
const PUFFS = [
  ["18%", "4.5rem", "0s"],
  ["48%", "6rem", "-1.6s"],
  ["70%", "3.5rem", "-3.1s"],
] as const;

/**
 * Shown the moment the app opens, while the server gathers the latest readings (the free-tier
 * database may need a second or two to wake). Pure CSS, so it animates before any JavaScript loads.
 */
export default function Loading() {
  return (
    <main className="safe-gutters grid min-h-dvh place-items-center" role="status" aria-label="Loading Hazelite">
      <div className="flex flex-col items-center text-center">
        <div className="relative size-44" aria-hidden>
          {PUFFS.map(([top, size, delay]) => (
            <span
              key={top}
              className="absolute left-0 rounded-full bg-[var(--haze)] opacity-0 blur-md animate-[puff-drift_4.8s_linear_infinite]"
              style={{ top, width: size, height: size, animationDelay: delay }}
            />
          ))}
          <span className="absolute bottom-3 left-1/2 h-3 w-24 -translate-x-1/2 rounded-[50%] bg-ink/15 animate-[dragon-shadow_1.1s_ease-in-out_infinite]" />
          <div className="absolute inset-x-4 bottom-5 top-2 animate-[dragon-hop_1.1s_ease-in-out_infinite]">
            <Image src={art} alt="" fill sizes="9rem" className="object-contain" priority />
          </div>
        </div>
        <p className="mt-2 text-xl font-semibold tracking-tight">Hazelite</p>
        <p className="mt-1 text-sm text-ink-2">
          Sniffing the air
          <span className="inline-flex w-5 justify-start" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="inline-block animate-[dot-bounce_1.1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.15}s` }}>
                .
              </span>
            ))}
          </span>
        </p>
      </div>
    </main>
  );
}
