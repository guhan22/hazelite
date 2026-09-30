import type { Band, Severity } from "@/lib/bands";

export const statusVar = (s: Severity) => `var(--status-${s})`;

/** Severity glyph (shape varies with severity, so state never relies on colour alone). Sized in em to match its text. */
export function StatusIcon({ severity, size = "1.1em" }: { severity: Severity; size?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 16 16", "aria-hidden": true } as const;
  const fill = statusVar(severity);
  switch (severity) {
    case "good":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill={fill} />
          <path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="#0b0b0b" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "moderate":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill={fill} />
          <path d="M4.5 8h7" stroke="#0b0b0b" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "unhealthy":
    case "very-unhealthy":
      return (
        <svg {...common}>
          <path d="M8 1.2l7 13H1z" fill={fill} strokeLinejoin="round" />
          <path d="M8 5.8v3.8" stroke={severity === "unhealthy" ? "#0b0b0b" : "#fff"} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.8" r="1" fill={severity === "unhealthy" ? "#0b0b0b" : "#fff"} />
        </svg>
      );
    case "hazardous":
      return (
        <svg {...common}>
          <path d="M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1z" fill={fill} />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function StatusLabel({ band, className = "" }: { band: Band | null; className?: string }) {
  if (!band) return <span className={`text-muted ${className}`}>No data</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <StatusIcon severity={band.severity} />
      <span>{band.label}</span>
    </span>
  );
}
