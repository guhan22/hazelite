"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds (a caching worker in dev would serve stale code). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((err) => console.error("[hazelite] service worker registration failed:", err));
  }, []);
  return null;
}
