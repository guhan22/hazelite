"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";

export interface Tab {
  id: string;
  label: string;
  /** Small count or marker next to the label. */
  badge?: ReactNode;
  content: ReactNode;
}

/** A swipe must travel this far sideways, and twice as far as it goes up or down, within this time. */
const SWIPE_PX = 60;
const SWIPE_MS = 800;

/**
 * Whether a touch starting at `el` belongs to a control that moves sideways itself (sliders, the
 * chart, tables that scroll horizontally), so it isn't taken as a swipe between tabs.
 */
function handlesSideways(el: Element | null, root: Element) {
  for (; el && el !== root; el = el.parentElement) {
    if (el.matches("input, select, textarea, [data-no-swipe]")) return true;
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/**
 * The dashboard's sections as tabs, in a centred bar that sticks to the top while scrolling.
 * Every panel is rendered up front and switching is instant; the active tab is mirrored into `?tab=`
 * (the first tab is the default and leaves no param) so it can be shared and survives reloads.
 * Follows the WAI-ARIA tabs pattern, with arrow-key navigation; on touch screens, swipe left or right.
 */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial: string }) {
  const [active, setActive] = useState(initial);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const activeIndex = tabs.findIndex((t) => t.id === active);

  const select = (i: number, { focus = true } = {}) => {
    const { id } = tabs[i];
    if (id === active) return;
    // Scrolled down into a long panel? Start the new one at its top, with the bar still pinned.
    const barTop = bar.current ? bar.current.offsetTop : 0;
    if (window.scrollY > barTop) window.scrollTo({ top: barTop });
    setActive(id);
    if (focus) buttons.current[i]?.focus({ preventScroll: true });
    // Slide the new panel in from the side it came from.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const from = i > activeIndex ? "1.5rem" : "-1.5rem";
      panels.current[i]?.animate([{ transform: `translateX(${from})`, opacity: 0.4 }, { transform: "none", opacity: 1 }], {
        duration: 180,
        easing: "ease-out",
      });
    }
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

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touch.current =
      e.touches.length === 1 && !handlesSideways(e.target as Element, e.currentTarget) ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || e.timeStamp - start.t > SWIPE_MS) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
    // Swipe left for the next tab, right for the previous; no wrapping at the ends.
    const next = activeIndex + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < tabs.length) select(next, { focus: false });
  };

  return (
    <>
      <div
        ref={bar}
        role="tablist"
        aria-label="Sections"
        // Clears the status bar when the installed app draws under it (viewport-fit=cover).
        className="sticky top-0 z-30 mb-6 flex justify-center gap-1 border-b border-border bg-page pt-[env(safe-area-inset-top)]"
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
            className={`-mb-px inline-flex min-h-11 min-w-18 items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)] ${
              t.id === active ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      {/* overflow-x-clip: the slide-in never makes the page scroll sideways. */}
      <div className="overflow-x-clip" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => (touch.current = null)}>
        {tabs.map((t, i) => (
          <div
            key={t.id}
            ref={(el) => {
              panels.current[i] = el;
            }}
            role="tabpanel"
            id={`panel-${t.id}`}
            aria-labelledby={`tab-${t.id}`}
            hidden={t.id !== active}
          >
            {t.content}
          </div>
        ))}
      </div>
    </>
  );
}
