"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Theme = "light" | "dark";
const EVENT = "hazelite:theme";

const dark = () => matchMedia("(prefers-color-scheme: dark)");

function current(): Theme {
  const pinned = document.documentElement.dataset.theme;
  return pinned === "light" || pinned === "dark" ? pinned : dark().matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mq = dark();
  mq.addEventListener("change", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function ThemeToggle() {
  // null on the server: the icon renders after hydration, when the real theme is known.
  const theme = useSyncExternalStore(subscribe, current, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid size-9 place-items-center rounded-full border border-border bg-surface text-ink-2 transition-colors hover:bg-grid hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
    >
      {theme && (
        <svg width="1.125rem" height="1.125rem" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {theme === "dark" ? (
            // Sun: shown in dark mode, switches to light.
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          ) : (
            // Moon: shown in light mode, switches to dark.
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          )}
        </svg>
      )}
    </button>
  );
}
