"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Tells the viewer the page is the service worker's saved copy, not live data. */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <p role="status" className="mb-4 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-ink-2">
      You&apos;re offline. This is the last reading saved on this device; it updates when you reconnect.
    </p>
  );
}
