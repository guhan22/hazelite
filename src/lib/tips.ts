import type { Severity } from "./bands";

// Things the dragon says when tapped. Mood-specific tips first, then general facts.
// Keep these to well-established guidance; nothing here should need a citation to be trusted.

const BY_SEVERITY: Record<Severity, string[]> = {
  good: [
    "Clear skies! A great time for a run or a picnic.",
    "Fresh air today. Open the windows and let it in!",
  ],
  moderate: [
    "Air's okay for normal activities today.",
    "Sensitive to haze? Keep an eye on the readings this afternoon.",
  ],
  unhealthy: [
    "Maybe swap today's outdoor run for the gym.",
    "Keep windows closed and run an air purifier if you have one.",
    "Check on elderly neighbours and anyone with asthma.",
  ],
  "very-unhealthy": [
    "Stay indoors where you can, and keep windows shut.",
    "Heading out? A well-fitted N95 mask helps.",
    "Kids and older folks should skip outdoor activity for now.",
  ],
  hazardous: [
    "Please stay indoors, and keep doors and windows closed.",
    "Feeling unwell? Seek medical attention, don't wait it out.",
    "Only go out if you must, and wear a well-fitted N95 mask.",
  ],
};

const FACTS = [
  "PM2.5 particles are so small that about 30 of them fit across the width of a human hair.",
  "Most haze here is smoke from land and forest fires in the region, blown over by the wind.",
  "A well-fitted N95 mask filters at least 95% of fine particles. Fit matters!",
  "1-hr PM2.5 tells you about right now; 24-hr PSI is better for planning tomorrow.",
  "1-hr AQI turns PM2.5 into the 0–500 score used around the world. Under 50 is Good!",
  "Air purifiers with HEPA filters trap fine particles; close the windows for them to work well.",
  "Haze from Sumatra usually reaches Singapore on south-westerly winds, typically from June to October.",
];

/** Tips for the current mood, then general facts, as one rotation. */
export const tipsFor = (severity: Severity) => [...BY_SEVERITY[severity], ...FACTS];
