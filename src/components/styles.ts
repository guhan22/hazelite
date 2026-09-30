// Shared class strings for the dashboard's recurring controls.

/** Pill-shaped toggle buttons and links. */
export const pill = (active: boolean) =>
  `rounded-full border px-3 py-1 transition-colors ${active ? "border-ink bg-ink text-page" : "border-border text-ink-2 hover:bg-grid"}`;

/** Round, bordered buttons in the header and on cards (install, alerts, theme, share). */
export const chromeButton =
  "rounded-full border border-border bg-surface text-ink-2 transition-colors hover:bg-grid hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--ink)]";

/** Pill-shaped select. */
export const field = "rounded-full border border-border bg-surface px-3 py-1 text-ink";
