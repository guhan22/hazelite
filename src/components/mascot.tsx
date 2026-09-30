import Image from "next/image";
import { useId } from "react";
import art from "@/assets/mascots/playground.png";
import type { Severity } from "@/lib/bands";

// The artwork is raster with a happy face baked in. Other moods are drawn over it as SVG in
// image-pixel coordinates: the eye is redrawn in place, the smile is tiled over and redrawn,
// and the snout gets a face mask once the air is very unhealthy.

const INK = "#0a1437";
const EYE = { cx: 266, cy: 184, rx: 41, ry: 46, pupil: 22 };
const SMILE_PATCH = { x: 176, y: 229, width: 62, height: 34 };

interface Mood {
  eye: "open" | "droopy" | "shut";
  /** How far the brow's inner end is raised; omitted = no brow. */
  brow?: number;
  mouth: "flat" | "frown" | "mask";
}

const MOODS: Record<Severity, Mood | null> = {
  good: null, // the artwork's own happy face
  moderate: { eye: "open", mouth: "flat" },
  unhealthy: { eye: "droopy", brow: 10, mouth: "frown" },
  "very-unhealthy": { eye: "droopy", brow: 18, mouth: "mask" },
  hazardous: { eye: "shut", brow: 18, mouth: "mask" },
};

export const MOOD_LABEL: Record<Severity, string> = {
  good: "happy",
  moderate: "calm",
  unhealthy: "worried",
  "very-unhealthy": "wearing a mask",
  hazardous: "masked and struggling",
};

const line = { stroke: INK, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

function octagon({ cx, cy, rx, ry }: typeof EYE) {
  const kx = rx * 0.42;
  const ky = ry * 0.42;
  return `M${cx - kx} ${cy - ry}H${cx + kx}L${cx + rx} ${cy - ky}V${cy + ky}L${cx + kx} ${cy + ry}H${cx - kx}L${cx - rx} ${cy + ky}V${cy - ky}Z`;
}

function Face({ mood, blink, uid }: { mood: Mood | null; blink: boolean; uid: string }) {
  const { cx, cy, pupil } = EYE;
  const eye = octagon(EYE);
  const tiles = `url(#${uid}t)`;
  // A blink closes whatever eye the mood has; a squeezed-shut eye is already closed.
  const eyeStyle = blink && mood?.eye !== "shut" ? "blink" : mood?.eye;
  if (!eyeStyle) return null; // happy and not blinking: the artwork's own face
  const closed = eyeStyle === "shut" || eyeStyle === "blink";
  return (
    <>
      <defs>
        {/* Orange mosaic used for patches, so they blend with the tiled skin. */}
        <pattern id={`${uid}t`} width="11" height="11" patternUnits="userSpaceOnUse">
          <rect width="11" height="11" fill="#fa7410" />
          <path d="M11 0V11H0" stroke="#e0600a" strokeWidth="1.5" fill="none" />
        </pattern>
        <clipPath id={`${uid}e`}>
          <path d={eye} />
        </clipPath>
      </defs>

      <path d={eye} fill={closed ? tiles : "#fff"} />
      {eyeStyle === "shut" && (
        // Squeezed shut, pointing toward the snout.
        <path d={`M${cx + 18} ${cy - 16}L${cx - 14} ${cy}L${cx + 18} ${cy + 16}`} strokeWidth={9} {...line} />
      )}
      {eyeStyle === "blink" && <path d={`M${cx - 28} ${cy + 2}Q${cx} ${cy + 16} ${cx + 28} ${cy + 2}`} strokeWidth={8} {...line} />}
      {!closed && (
        <g clipPath={`url(#${uid}e)`}>
          <circle cx={cx} cy={cy + 4} r={pupil} fill={INK} />
          <circle cx={cx - 8} cy={cy - 6} r={7} fill="#fff" />
          {eyeStyle === "droopy" && (
            // Heavy lid, drooping toward the outer corner.
            <path d={`M${cx - 50} ${cy - 22}L${cx + 50} ${cy - 4}V${cy - 60}H${cx - 50}Z`} fill={tiles} stroke={INK} strokeWidth={7} />
          )}
        </g>
      )}
      <path d={eye} fill="none" stroke={INK} strokeWidth={7} />
      {mood?.brow != null && (
        <path d={`M${cx + 32} ${cy - 58}Q${cx} ${cy - 62 - mood.brow / 2} ${cx - 32} ${cy - 60 - mood.brow}`} strokeWidth={9} {...line} />
      )}

      {mood && <rect {...SMILE_PATCH} rx={8} fill={tiles} />}
      {mood?.mouth === "mask" && (
        <>
          <path d="M226 236L206 244M222 296L204 282" strokeWidth={5} {...line} />
          <g transform="rotate(-6 128 258)">
            <rect x={43} y={214} width={170} height={88} rx={32} fill="#f3f6f9" stroke={INK} strokeWidth={6} />
            <path d="M70 244Q128 250 186 244M70 270Q128 276 186 270" stroke="#b8c3cf" strokeWidth={4} strokeLinecap="round" fill="none" />
          </g>
        </>
      )}
      {(mood?.mouth === "frown" || mood?.mouth === "flat") && (
        <path d={mood.mouth === "frown" ? "M180 258Q205 236 230 254" : "M180 254L230 248"} strokeWidth={8} {...line} />
      )}

      {mood?.eye === "shut" && (
        <path d="M205 128C219 146 217 160 205 160C193 160 191 146 205 128Z" fill="#8fd3ff" stroke={INK} strokeWidth={4} />
      )}
    </>
  );
}

/** The dragon-playground mascot, drawn with the mood for an air-quality band. */
export function Mascot({ severity, blink = false, className = "" }: { severity: Severity; blink?: boolean; className?: string }) {
  const uid = useId().replace(/[^\w-]/g, "");
  const mood = MOODS[severity];
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: `${art.width} / ${art.height}` }}>
      <Image src={art} alt="" fill sizes="10rem" className="object-contain" priority />
      {(mood || blink) && (
        <svg viewBox={`0 0 ${art.width} ${art.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <Face mood={mood} blink={blink} uid={uid} />
        </svg>
      )}
    </div>
  );
}
