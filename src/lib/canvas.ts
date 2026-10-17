// Shared plumbing for the animated canvases (the haze overlay and the map's wind): sizing, theme
// colours, the reduced-motion preference, and pausing while unseen. Client-only.

import { useEffect, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () => matchMedia(REDUCED_MOTION).matches;

const subscribeReducedMotion = (onChange: () => void) => {
  const mq = matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
export const useReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);

/** Calls `onChange` whenever the theme changes (the toggle or the OS setting). Returns an unsubscribe. */
export function onThemeChange(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onChange);
  return () => {
    mo.disconnect();
    scheme.removeEventListener("change", onChange);
  };
}

/** Bumps on every theme change, so effects that read theme colours re-run. */
export function useThemeVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => onThemeChange(() => setVersion((v) => v + 1)), []);
  return version;
}

/** An element's resolved CSS `color` (e.g. a theme token, already light or dark) as "r g b". */
export const rgbOf = (el: Element, fallback = "128 128 128") => getComputedStyle(el).color.match(/[\d.]+/g)?.slice(0, 3).join(" ") || fallback;

/** Sizes a canvas's backing store to w×h CSS pixels at the device's pixel ratio (capped at 2), clears it and returns its context. */
export function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const [bw, bh] = [Math.round(w * dpr), Math.round(h * dpr)];
  if (canvas.width !== bw || canvas.height !== bh) [canvas.width, canvas.height] = [bw, bh];
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/**
 * Runs `frame` every animation frame while `el` is on screen (not in another dashboard tab) and the
 * browser tab is visible. `frame` returning false idles the loop until `wake()` is called.
 */
export function animateWhileVisible(el: Element, frame: () => boolean | void) {
  let id = 0;
  let visible = true;
  const loop = () => {
    id = frame() !== false && visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const wake = () => {
    if (!id && visible && !document.hidden) id = requestAnimationFrame(loop);
  };
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    wake();
  });
  io.observe(el);
  document.addEventListener("visibilitychange", wake);
  wake();
  return {
    wake,
    stop: () => {
      cancelAnimationFrame(id);
      io.disconnect();
      document.removeEventListener("visibilitychange", wake);
    },
  };
}
