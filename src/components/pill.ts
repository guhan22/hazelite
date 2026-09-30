/** Classes for the pill-shaped toggle buttons and links used across the dashboard. */
export const pill = (active: boolean) =>
  `rounded-full border px-3 py-1 transition-colors ${active ? "border-ink bg-ink text-page" : "border-border text-ink-2 hover:bg-grid"}`;
