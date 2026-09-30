"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  /** Small count or marker next to the label. */
  badge?: ReactNode;
  content: ReactNode;
}

/**
 * The dashboard's sections as tabs, in a bar fixed to the bottom of the screen (thumb reach on phones).
 * Every panel is rendered up front and switching is instant; the active tab is mirrored into `?tab=`
 * (the first tab is the default and leaves no param) so it can be shared and survives reloads.
 * Follows the WAI-ARIA tabs pattern, with arrow-key navigation; the tab list stays first in the DOM.
 */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial: string }) {
  const [active, setActive] = useState(initial);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (i: number) => {
    const { id } = tabs[i];
    if (id !== active) window.scrollTo({ top: 0 });
    setActive(id);
    buttons.current[i]?.focus();
    const url = new URL(location.href);
    if (i === 0) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    history.replaceState(history.state, "", url);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
    if (next == null) return;
    e.preventDefault();
    select(next);
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-center gap-1 border-t border-border bg-page px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mt-px inline-flex min-w-18 items-center justify-center gap-1.5 border-t-2 px-3 py-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)] ${
              t.id === active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </>
  );
}
