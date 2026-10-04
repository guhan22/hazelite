import { useCallback, useSyncExternalStore } from "react";
import { PROFILE_IDS, type Profile } from "./bands";
import { REGIONS, type Region } from "./schema";

const EVENT = "hazelite:stored-choice";

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode, sandboxed preview)
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * A per-viewer preference kept in localStorage. Stored values are untrusted, so anything outside
 * `allowed` reads as `fallback`. Renders `fallback` on the server and during hydration.
 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set] as const;
}

/** The viewer's area, shared by "Use my location", "Can I go out?" and the alert settings. */
export const useAreaChoice = () => useStoredChoice<Region>("hazelite:region", REGIONS, "central");

/** Whose advice to show, shared by "Can I go out?" and the alert settings. */
export const useProfileChoice = () => useStoredChoice<Profile>("hazelite:profile", PROFILE_IDS, "general");
