"use client";

import AutoHeight from "embla-carousel-auto-height";
import useEmblaCarousel from "embla-carousel-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface Tab {
  id: string;
  label: string;
  /** Small count or marker next to the label. */
  badge?: ReactNode;
  content: ReactNode;
}

/**
 * Whether a touch starting at `el` belongs to a control that moves sideways itself (sliders, the
 * chart, tables that scroll horizontally), so it isn't taken as a swipe between tabs.
 */
function handlesSideways(el: Element | null) {
  for (; el; el = el.parentElement) {
    if (el.matches("[data-tabs-viewport]")) return false;
    if (el.matches("input, select, textarea, [data-no-swipe]")) return true;
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/**
 * The dashboard's sections as tabs: a centred bar that sticks to the top (Radix Tabs: ARIA and
 * keyboard), over a carousel of panels (Embla) that follows the finger on touch screens and snaps to
 * the nearest tab. The carousel takes the active panel's height. The active tab is mirrored into
 * `?tab=` (the first tab is the default and leaves no param) so it can be shared and survives reloads.
 */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial: string }) {
  const startIndex = Math.max(0, tabs.findIndex((t) => t.id === initial));
  const [active, setActive] = useState(tabs[startIndex].id);
  const bar = useRef<HTMLDivElement>(null);
  const [viewport, embla] = useEmblaCarousel(
    // Touch only: on desktop a mouse drag should still select text.
    { startIndex, watchDrag: (_, evt) => evt.type === "touchstart" && !handlesSideways(evt.target as Element) },
    [AutoHeight()],
  );

  // The server-rendered offset shows the requested tab before hydration, but Embla must measure without
  // it (a transformed container skews the slides' offsets). Drop it and stay hidden until Embla has
  // positioned the carousel itself, so the first tab never flashes.
  const container = useCallback((el: HTMLDivElement | null) => {
    if (el?.style.transform) {
      el.style.transform = "";
      el.style.visibility = "hidden";
    }
  }, []);

  useEffect(() => {
    if (!embla) return;
    embla.containerNode().style.visibility = "";
    const onSelect = () => {
      const i = embla.selectedScrollSnap();
      setActive(tabs[i].id);
      // Scrolled down into a long panel? Start the new one at its top, with the bar still pinned.
      const barTop = bar.current?.offsetTop ?? 0;
      if (window.scrollY > barTop) window.scrollTo({ top: barTop });
      const url = new URL(location.href);
      if (i === 0) url.searchParams.delete("tab");
      else url.searchParams.set("tab", tabs[i].id);
      history.replaceState(history.state, "", url);
    };
    embla.on("select", onSelect);
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla, tabs]);

  const onValueChange = (id: string) => {
    const i = tabs.findIndex((t) => t.id === id);
    setActive(id);
    // Glide to a neighbouring tab; jump straight to one further away.
    embla?.scrollTo(i, Math.abs(i - embla.selectedScrollSnap()) > 1);
  };

  return (
    <TabsPrimitive.Root value={active} onValueChange={onValueChange}>
      <TabsPrimitive.List
        ref={bar}
        aria-label="Sections"
        // Clears the status bar when the installed app draws under it (viewport-fit=cover).
        className="sticky top-0 z-30 mb-6 flex justify-center gap-1 border-b border-border bg-page pt-[env(safe-area-inset-top)]"
      >
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.id}
            value={t.id}
            className="-mb-px inline-flex min-h-11 min-w-18 items-center justify-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ink)] data-[state=active]:border-ink data-[state=active]:text-ink"
          >
            {t.label}
            {t.badge}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      <div ref={viewport} data-tabs-viewport className="touch-pan-y overflow-hidden">
        {/* Negative margin + slide padding: a gutter between panels while swiping. Before hydration,
            the transform shows the requested tab so there's no flash of the first one. */}
        <div
          ref={container}
          className="-ml-6 flex items-start transition-[height] duration-200"
          style={startIndex ? { transform: `translate3d(${-100 * startIndex}%, 0, 0)` } : undefined}
        >
          {tabs.map((t) => (
            <TabsPrimitive.Content
              key={t.id}
              value={t.id}
              forceMount
              // Off-screen panels stay rendered for swiping, but out of the tab order and accessibility tree.
              inert={t.id !== active}
              className="min-w-0 shrink-0 grow-0 basis-full pl-6 outline-none"
            >
              {t.content}
            </TabsPrimitive.Content>
          ))}
        </div>
      </div>
    </TabsPrimitive.Root>
  );
}
