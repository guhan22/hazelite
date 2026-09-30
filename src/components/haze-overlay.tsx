"use client";

import { useEffect, useRef } from "react";

interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
}

/** 0 at clean air (≤ 12 µg/m³), 1 at "Very high" PM2.5 and beyond. */
const intensityFor = (pm25: number | null) => (pm25 == null ? 0 : Math.min(1, Math.max(0, (pm25 - 12) / 240)));

/**
 * Drifting haze over its positioned parent, thicker as PM2.5 rises. Purely decorative: no pointer
 * events, hidden from assistive tech, drawn once without motion for reduced-motion users, and
 * paused while off-screen or in a background tab.
 */
export function HazeOverlay({ pm25 }: { pm25: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(0); // how many puffs
  const alphaRef = useRef(0); // how opaque each puff's core gets
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const intensity = intensityFor(pm25);
    // Capped so overlapping puffs never make the text underneath hard to read.
    targetRef.current = intensity > 0 ? Math.round(10 + 26 * intensity) : 0;
    alphaRef.current = 0.035 + 0.11 * intensity;
    refreshRef.current();
  }, [pm25]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const puffs: Puff[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    let visible = true;
    let color = "150 135 120";

    const spawn = (): Puff => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (0.12 + Math.random() * 0.22) * Math.max(w, h), // big, soft puffs read as haze, not dots
      vx: 0.1 + Math.random() * 0.25,
      vy: (Math.random() - 0.5) * 0.08,
      a: 0,
    });

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // The canvas's CSS colour is the --haze token, already resolved for light/dark by the browser.
      color = getComputedStyle(canvas).color.match(/[\d.]+/g)?.slice(0, 3).join(" ") || color;
    };

    const draw = () => {
      // Ease the puff count toward the target so the haze thickens and clears gradually.
      if (puffs.length < targetRef.current) puffs.push(spawn());
      ctx.clearRect(0, 0, w, h);
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        const leaving = i >= targetRef.current;
        // Fade toward the current opacity (or out, if no longer needed).
        const goal = leaving ? 0 : alphaRef.current;
        p.a += Math.sign(goal - p.a) * Math.min(Math.abs(goal - p.a), 0.002);
        if (leaving && p.a === 0) {
          puffs.splice(i, 1);
          continue;
        }
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x - p.r > w) p.x = -p.r;
          if (p.y < -p.r) p.y = h + p.r;
          if (p.y - p.r > h) p.y = -p.r;
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `rgb(${color} / ${p.a})`);
        g.addColorStop(1, `rgb(${color} / 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      draw();
      // Clean air with nothing left to fade out: stop until the target rises again.
      const idle = puffs.length === 0 && targetRef.current === 0;
      frame = visible && !document.hidden && !idle ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };

    // No motion: settle the haze at its target straight away and draw a single still frame.
    const settle = () => {
      puffs.length = Math.min(puffs.length, targetRef.current);
      while (puffs.length < targetRef.current) puffs.push(spawn());
      for (const p of puffs) p.a = alphaRef.current;
      draw();
    };
    refreshRef.current = reduced ? settle : wake;

    resize();
    refreshRef.current();

    const repaint = () => {
      resize();
      if (reduced) draw();
    };
    const ro = new ResizeObserver(repaint);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!reduced) wake();
    });
    io.observe(canvas);
    const onVisibility = () => !reduced && wake();
    document.addEventListener("visibilitychange", onVisibility);
    // Theme changes (toggle or OS setting) swap the haze colour.
    const mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", repaint);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      scheme.removeEventListener("change", repaint);
      refreshRef.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-10 h-full w-full text-[color:var(--haze)]" aria-hidden />;
}
