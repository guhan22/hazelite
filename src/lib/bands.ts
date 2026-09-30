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

export function bandFor(bands: Band[], value: number | null | undefined): Band | null {
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
