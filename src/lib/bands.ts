// NEA air-quality descriptors. https://www.haze.gov.sg

export type Severity = "good" | "moderate" | "unhealthy" | "very-unhealthy" | "hazardous";

export interface Band {
  severity: Severity;
  label: string;
  min: number;
  /** Inclusive upper bound; Infinity for the top band. */
  max: number;
}

export const PSI_BANDS: Band[] = [
  { severity: "good", label: "Good", min: 0, max: 50 },
  { severity: "moderate", label: "Moderate", min: 51, max: 100 },
  { severity: "unhealthy", label: "Unhealthy", min: 101, max: 200 },
  { severity: "very-unhealthy", label: "Very unhealthy", min: 201, max: 300 },
  { severity: "hazardous", label: "Hazardous", min: 301, max: Infinity },
];

// 1-hr PM2.5 concentration bands (µg/m³), used by NEA for short-term activity planning.
export const PM25_BANDS: Band[] = [
  { severity: "good", label: "Normal", min: 0, max: 55 },
  { severity: "unhealthy", label: "Elevated", min: 56, max: 150 },
  { severity: "very-unhealthy", label: "High", min: 151, max: 250 },
  { severity: "hazardous", label: "Very high", min: 251, max: Infinity },
];

/** AQI categories. Two share the "unhealthy" severity (colour, icon, mood), so alerts rank by level instead. */
export type AqiLevel = Severity | "unhealthy-sensitive";

// US EPA Air Quality Index (2024 PM2.5 breakpoints). NEA publishes no AQI, so the app derives it from 1-hr PM2.5.
export const AQI_BANDS: (Band & { level: AqiLevel })[] = [
  { level: "good", severity: "good", label: "Good", min: 0, max: 50 },
  { level: "moderate", severity: "moderate", label: "Moderate", min: 51, max: 100 },
  { level: "unhealthy-sensitive", severity: "unhealthy", label: "Unhealthy (sensitive)", min: 101, max: 150 },
  { level: "unhealthy", severity: "unhealthy", label: "Unhealthy", min: 151, max: 200 },
  { level: "very-unhealthy", severity: "very-unhealthy", label: "Very unhealthy", min: 201, max: 300 },
  { level: "hazardous", severity: "hazardous", label: "Hazardous", min: 301, max: Infinity },
];

/** PM2.5 concentration (µg/m³) to AQI: [lowest concentration, highest concentration, lowest AQI, highest AQI]. */
const PM25_AQI_BREAKPOINTS = [
  [0, 9, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
] as const;

/** US EPA AQI for a PM2.5 concentration (truncated to 0.1 µg/m³, as the EPA does), capped at 500. */
export function aqiFromPm25(pm25: number | null | undefined): number | null {
  if (pm25 == null) return null;
  const c = Math.floor(Math.max(0, pm25) * 10) / 10;
  const bp = PM25_AQI_BREAKPOINTS.find(([, hi]) => c <= hi);
  if (!bp) return 500;
  const [cLo, cHi, iLo, iHi] = bp;
  return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
}

export function bandFor<B extends Band>(bands: B[], value: number | null | undefined): B | null {
  if (value == null) return null;
  return bands.find((b) => value <= b.max) ?? bands[bands.length - 1];
}

/** Chart reference lines: each band's lower boundary, labelled with the band above it. */
export const thresholdsFor = (bands: Band[]) => bands.slice(1).map((b) => ({ value: b.min - 1, label: b.label }));

export type Profile = "general" | "vulnerable";

/** Whose advice to show. Vulnerable = the elderly, pregnant women, children, and people with chronic lung or heart disease. */
export const PROFILES: readonly { value: Profile; label: string }[] = [
  { value: "general", label: "Generally healthy" },
  { value: "vulnerable", label: "Vulnerable" },
];
export const PROFILE_IDS = PROFILES.map((p) => p.value);

/**
 * NEA's personal guide for activities in the next hour, keyed on the 1-hr PM2.5 band.
 * Vulnerable = the elderly, pregnant women, children, and people with chronic lung or heart disease.
 * Source: NEA, "How to plan your outdoor activities during haze" (haze.gov.sg).
 */
export function pm25GuideFor(severity: Severity, profile: Profile, when = "for the next hour"): string {
  const guide: Partial<Record<Severity, Record<Profile, string>>> = {
    unhealthy: { general: "Reduce strenuous outdoor activity", vulnerable: "Avoid strenuous outdoor activity" },
    "very-unhealthy": { general: "Avoid strenuous outdoor activity", vulnerable: "Avoid all outdoor activity" },
    hazardous: { general: "Minimise all outdoor activity", vulnerable: "Avoid all outdoor activity" },
  };
  const advice = guide[severity]?.[profile];
  return advice ? [advice, when].filter(Boolean).join(" ") : "Continue with normal activities";
}

/**
 * US EPA advice for an AQI category, for the alert notifications.
 * Source: AirNow, "Air Quality Guide for Particle Pollution" (airnow.gov).
 */
export function aqiGuideFor(level: AqiLevel, profile: Profile): string {
  const guide: Partial<Record<AqiLevel, Record<Profile, string>>> = {
    "unhealthy-sensitive": { general: "It's fine to be active outdoors", vulnerable: "Reduce long or intense outdoor activity" },
    unhealthy: { general: "Reduce long or intense outdoor activity", vulnerable: "Avoid long or intense outdoor activity" },
    "very-unhealthy": { general: "Avoid long or intense outdoor activity", vulnerable: "Avoid all physical activity outdoors" },
    hazardous: { general: "Avoid all physical activity outdoors", vulnerable: "Stay indoors and keep activity levels low" },
  };
  return guide[level]?.[profile] ?? "Continue with normal activities";
}

interface Advisory {
  group: string;
  advice: string;
}

/** NEA health advisory keyed on the 24-hr PSI forecast/reading. */
export function advisoryFor(severity: Severity): Advisory[] {
  const groups = ["Healthy persons", "Elderly, pregnant women, children", "Chronic lung or heart disease"];
  const advice: Record<Severity, [string, string, string]> = {
    good: ["Normal activities", "Normal activities", "Normal activities"],
    moderate: ["Normal activities", "Normal activities", "Normal activities"],
    unhealthy: [
      "Reduce prolonged or strenuous outdoor exertion",
      "Minimise prolonged or strenuous outdoor exertion",
      "Avoid prolonged or strenuous outdoor exertion",
    ],
    "very-unhealthy": [
      "Avoid prolonged or strenuous outdoor exertion",
      "Minimise outdoor activity",
      "Avoid outdoor activity",
    ],
    hazardous: ["Minimise outdoor activity", "Avoid outdoor activity", "Avoid outdoor activity"],
  };
  return groups.map((group, i) => ({ group, advice: advice[severity][i] }));
}
