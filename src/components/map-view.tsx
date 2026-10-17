"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import type { FireMap } from "@/lib/fires";
import { SINGAPORE, valueAt, type Epicentre, type Field, type LonLat, type PathPoint } from "@/lib/flow";
import { GRID } from "@/lib/regional";
import { BORDER_PATH, LAND_PATH } from "@/lib/sea-map";
import { HOUR } from "@/lib/time";
import { chromeButton } from "./styles";

export type Layer = "wind" | "smoke" | "fires" | "paths";

/** What part of the map is on screen: the centre (lon, lat) and the width in degrees of longitude. */
interface View {
  cx: number;
  cy: number;
  span: number;
}

// The view stays inside the regional grid, so wind and smoke always cover it.
const EXTENT = { w: GRID.lon0, e: GRID.lon0 + (GRID.nx - 1) * GRID.step, s: GRID.lat0, n: GRID.lat0 + (GRID.ny - 1) * GRID.step };
const MIN_SPAN = 2.5;
const MAX_SPAN_X = 34;
const MAX_SPAN_Y = 26;
/** Singapore in the middle, zoomed out as far as the map allows. */
const HOME: View = { cx: SINGAPORE.lon, cy: SINGAPORE.lat, span: Infinity };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** `aspect` is height / width. */
function clampView(v: View, aspect: number): View {
  const span = clamp(v.span, MIN_SPAN, Math.min(MAX_SPAN_X, MAX_SPAN_Y / aspect));
  const spanY = span * aspect;
  return {
    cx: clamp(v.cx, EXTENT.w + span / 2, EXTENT.e - span / 2),
    cy: clamp(v.cy, EXTENT.s + spanY / 2, EXTENT.n - spanY / 2),
    span,
  };
}

/** Equirectangular: near the equator a degree of longitude and of latitude are nearly the same distance. */
function project(v: View, w: number, h: number) {
  const k = w / v.span; // pixels per degree
  const left = v.cx - v.span / 2;
  const top = v.cy + h / k / 2;
  return {
    k,
    left,
    top,
    x: (lon: number) => (lon - left) * k,
    y: (lat: number) => (top - lat) * k,
    lon: (x: number) => left + x / k,
    lat: (y: number) => top - y / k,
  };
}
type Projection = ReturnType<typeof project>;

/** Place labels; `minK` hides one until zoomed in to that many pixels per degree. */
const LABELS: { name: string; lon: number; lat: number; sea?: boolean; minK?: number }[] = [
  { name: "Sumatra", lon: 101.3, lat: -1.2 },
  { name: "Borneo", lon: 114.2, lat: 0.6 },
  { name: "Malaysia", lon: 102.1, lat: 4.4 },
  { name: "Java", lon: 110.2, lat: -7.3 },
  { name: "Sulawesi", lon: 120.4, lat: -2.4 },
  { name: "Thailand", lon: 101.3, lat: 14.6 },
  { name: "Cambodia", lon: 104.9, lat: 12.8 },
  { name: "Vietnam", lon: 107.2, lat: 12.2 },
  { name: "South China Sea", lon: 111.5, lat: 8, sea: true },
  { name: "Java Sea", lon: 110.5, lat: -4.8, sea: true },
  { name: "Gulf of Thailand", lon: 101.8, lat: 9.8, sea: true },
  { name: "Malacca Strait", lon: 99.6, lat: 3.6, sea: true, minK: 45 },
  { name: "Andaman Sea", lon: 96.4, lat: 10.5, sea: true },
  { name: "Indian Ocean", lon: 93.5, lat: -4.5, sea: true },
];
const RINGS_KM = [250, 500, 1000];

/** A CSS colour (e.g. a token resolved for the current theme) as "r g b". */
const rgbOf = (el: Element) => getComputedStyle(el).color.match(/[\d.]+/g)?.slice(0, 3).join(" ") ?? "128 128 128";

/** Bumps whenever the theme changes (toggle or OS setting), so canvases re-read their colours. */
function useThemeVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", bump);
    return () => {
      mo.disconnect();
      scheme.removeEventListener("change", bump);
    };
  }, []);
  return version;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const useReducedMotion = () => useSyncExternalStore(subscribeReduced, () => matchMedia(REDUCED).matches, () => false);

/** Sizes a canvas's backing store to its box at the device's pixel ratio (capped at 2) and clears it. */
function prepare(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** Smoke opacity for a PM2.5 level: invisible in clean air, thickening through "Elevated" and "High". */
const smokeAlpha = (pm: number) => (pm < 20 ? 0 : Math.min(0.72, 0.06 + ((pm - 20) / 260) * 0.66));

/** The grid's smoke as a tiny image, one pixel per grid point (north row first), for the browser to smooth when scaled up. */
function smokeImage(field: Field, rgb: string) {
  const [r, g, b] = rgb.split(" ").map(Number);
  const img = new ImageData(GRID.nx, GRID.ny);
  for (let y = 0; y < GRID.ny; y++)
    for (let x = 0; x < GRID.nx; x++) {
      const o = ((GRID.ny - 1 - y) * GRID.nx + x) * 4;
      img.data.set([r, g, b, Math.round(255 * smokeAlpha(field.pm[y * GRID.nx + x]))], o);
    }
  const c = document.createElement("canvas");
  [c.width, c.height] = [GRID.nx, GRID.ny];
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

const fireRadius = (count: number, k: number) => clamp(1.2 + Math.sqrt(count) * 0.6, 1.2, 5) * clamp(k / 22, 0.7, 2.5);

/**
 * The haze map: coastlines, model smoke, fire hotspots, the 2,500 ft wind as drifting streaks, and
 * air paths, with Singapore in the middle. Drag to pan, pinch or scroll to zoom, tap to probe a spot.
 */
export function MapView({
  field,
  fires,
  freshAfter,
  layers,
  backPath,
  probePath,
  probe,
  epicentres,
  onProbe,
  loading,
}: {
  field: Field | null;
  /** Cells to draw (already limited to the chosen time). */
  fires: FireMap["cells"];
  /** Detections after this are drawn bright, older ones faded. */
  freshAfter: number;
  layers: ReadonlySet<Layer>;
  /** Where Singapore's air came from, oldest point first. */
  backPath: PathPoint[];
  /** Where air at the probed spot goes next. */
  probePath: PathPoint[];
  probe: LonLat | null;
  epicentres: Epicentre[];
  onProbe: (p: LonLat | null) => void;
  loading: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const smokeCanvas = useRef<HTMLCanvasElement>(null);
  const windCanvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [rawView, setRawView] = useState<View>(HOME);
  const fireSwatch = useRef<HTMLSpanElement>(null);
  const theme = useThemeVersion();
  const reduced = useReducedMotion();
  const aspect = size.w ? size.h / size.w : 0.75;
  const view = clampView(rawView, aspect);
  const P = project(view, size.w || 1, size.h || 1);

  // Read by the wind animation each frame without restarting it.
  const live = useRef({ P, field, view });
  useEffect(() => {
    live.current = { P, field, view };
  });

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zooms by `factor` (< 1 zooms in), keeping the point under (px, py) in place. */
  const zoomAt = (factor: number, px = size.w / 2, py = size.h / 2) =>
    setRawView((raw) => {
      const v = clampView(raw, aspect);
      const p = project(v, size.w, size.h);
      const [lon, lat] = [p.lon(px), p.lat(py)];
      const span = clamp(v.span * factor, MIN_SPAN, MAX_SPAN_X);
      const k = size.w / span;
      return clampView({ cx: lon - px / k + span / 2, cy: lat + py / k - size.h / k / 2, span }, aspect);
    });
  const panBy = (dx: number, dy: number) =>
    setRawView((raw) => {
      const v = clampView(raw, aspect);
      const k = size.w / v.span;
      return clampView({ ...v, cx: v.cx - dx / k, cy: v.cy + dy / k }, aspect);
    });

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  const zoomRef = useRef(zoomAt);
  useEffect(() => {
    zoomRef.current = zoomAt;
  });
  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Smoke and fires: redrawn when the time, view, layers or theme change.
  const firesOn = layers.has("fires");
  const smokeOn = layers.has("smoke");
  useEffect(() => {
    const canvas = smokeCanvas.current;
    if (!canvas || !size.w) return;
    const ctx = prepare(canvas, size.w, size.h);
    if (smokeOn && field) {
      const img = smokeImage(field, rgbOf(canvas));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Each image pixel is centred on its grid point.
      const half = GRID.step / 2;
      ctx.drawImage(img, P.x(GRID.lon0 - half), P.y(EXTENT.n + half), GRID.nx * GRID.step * P.k, GRID.ny * GRID.step * P.k);
    }
    if (firesOn) {
      ctx.fillStyle = `rgb(${rgbOf(fireSwatch.current!)})`;
      // Older detections first, so fresh ones sit on top.
      for (const fresh of [false, true]) {
        ctx.globalAlpha = fresh ? 0.95 : 0.4;
        ctx.beginPath();
        for (const [lon, lat, count, , t] of fires) {
          if (t > freshAfter !== fresh) continue;
          const [x, y] = [P.x(lon), P.y(lat)];
          if (x < -8 || y < -8 || x > size.w + 8 || y > size.h + 8) continue;
          const r = fireRadius(count, P.k);
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // P is derived from view and size, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, fires, freshAfter, firesOn, smokeOn, size, view.cx, view.cy, view.span, theme]);

  // Wind: streaks drifting with the wind, leaving fading trails. Still arrows for reduced motion.
  const windOn = layers.has("wind");
  useEffect(() => {
    const canvas = windCanvas.current;
    if (!canvas || !size.w) return;
    const ctx = prepare(canvas, size.w, size.h);
    if (!windOn) return;
    const rgb = rgbOf(canvas);
    const { w, h } = size;

    if (reduced) {
      const { P, field } = live.current;
      if (!field) return;
      ctx.strokeStyle = `rgb(${rgb} / 0.7)`;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let y = 18; y < h; y += 36)
        for (let x = 18; x < w; x += 36) {
          const [u, v] = [valueAt(field.u, P.lon(x), P.lat(y)), valueAt(field.v, P.lon(x), P.lat(y))];
          if (u == null || v == null) continue;
          const speed = Math.hypot(u, v);
          if (speed < 1) continue;
          const len = clamp(4 + speed * 0.5, 5, 16);
          const [dx, dy] = [(u / speed) * len, (-v / speed) * len];
          ctx.moveTo(x - dx / 2, y - dy / 2);
          ctx.lineTo(x + dx / 2, y + dy / 2);
          // Arrowhead at the downwind end.
          const a = Math.atan2(dy, dx);
          ctx.lineTo(x + dx / 2 - 4 * Math.cos(a - 0.5), y + dy / 2 - 4 * Math.sin(a - 0.5));
          ctx.moveTo(x + dx / 2, y + dy / 2);
          ctx.lineTo(x + dx / 2 - 4 * Math.cos(a + 0.5), y + dy / 2 - 4 * Math.sin(a + 0.5));
        }
      ctx.stroke();
      return;
    }

    const n = Math.min(1800, Math.round((w * h) / 300));
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const ages = new Uint16Array(n);
    const spawn = (i: number) => {
      xs[i] = Math.random() * w;
      ys[i] = Math.random() * h;
      ages[i] = 40 + Math.floor(Math.random() * 60);
    };
    for (let i = 0; i < n; i++) spawn(i);
    // Speed bands: faster wind draws brighter.
    const BANDS = [10, 20, 35, Infinity];
    const ALPHA = [0.3, 0.5, 0.7, 0.92];
    const PX_PER_KMH = 0.05; // per frame: 20 km/h drifts ~1 px a frame
    let frame = 0;
    let visible = true;
    let lastView = live.current.view;

    const tick = () => {
      const { P, field, view } = live.current;
      // Panned or zoomed: the trails no longer line up, so start afresh.
      if (view.cx !== lastView.cx || view.cy !== lastView.cy || view.span !== lastView.span) {
        ctx.clearRect(0, 0, w, h);
        for (let i = 0; i < n; i++) spawn(i);
        lastView = view;
      }
      // Fade the trails: keep 92% of what's there each frame.
      ctx.globalCompositeOperation = "destination-in";
      ctx.fillStyle = "rgb(0 0 0 / 0.92)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      if (field) {
        const paths = BANDS.map(() => new Path2D());
        for (let i = 0; i < n; i++) {
          const [lon, lat] = [P.lon(xs[i]), P.lat(ys[i])];
          const u = valueAt(field.u, lon, lat);
          const v = valueAt(field.v, lon, lat);
          if (u == null || v == null || --ages[i] === 0) {
            spawn(i);
            continue;
          }
          const [x2, y2] = [xs[i] + u * PX_PER_KMH, ys[i] - v * PX_PER_KMH];
          const speed = Math.hypot(u, v);
          const path = paths[BANDS.findIndex((b) => speed < b)];
          path.moveTo(xs[i], ys[i]);
          path.lineTo(x2, y2);
          if (x2 < 0 || y2 < 0 || x2 > w || y2 > h) spawn(i);
          else [xs[i], ys[i]] = [x2, y2];
        }
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";
        paths.forEach((p, b) => {
          ctx.strokeStyle = `rgb(${rgb} / ${ALPHA[b]})`;
          ctx.stroke(p);
        });
      }
      frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
    };
    // Paused while off-screen (another tab of the dashboard) or in a background browser tab.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      wake();
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      document.removeEventListener("visibilitychange", wake);
    };
    // The animation reads the time and view live; only the still arrows redraw when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windOn, size, theme, reduced, reduced ? field : null, reduced ? `${view.cx},${view.cy},${view.span}` : null]);

  // Gestures: one finger (or the mouse) pans, two pinch-zoom, a quick tap probes.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const tap = useRef<{ x: number; y: number; at: number; moved: boolean } | null>(null);
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    tap.current = pointers.current.size === 1 ? { ...p, at: e.timeStamp, moved: false } : null;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    if (tap.current && Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > 6) tap.current.moved = true;
    if (pointers.current.size === 1) panBy(p.x - prev.x, p.y - prev.y);
    else if (pointers.current.size === 2) {
      const other = [...pointers.current].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      if (before > 0 && after > 0) zoomAt(before / after, (p.x + other.x) / 2, (p.y + other.y) / 2);
      panBy((p.x - prev.x) / 2, (p.y - prev.y) / 2);
    }
    pointers.current.set(e.pointerId, p);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const t = tap.current;
    if (e.type === "pointerup" && t && !t.moved && e.timeStamp - t.at < 500 && pointers.current.size === 0) probeAt(t.x, t.y);
    if (pointers.current.size === 0) tap.current = null;
  };

  /** Snaps a tap to Singapore (clears the probe), an epicentre, or the nearest hotspot, else the spot itself. */
  const probeAt = (x: number, y: number) => {
    const dist = (p: LonLat) => Math.hypot(P.x(p.lon) - x, P.y(p.lat) - y);
    if (dist(SINGAPORE) < 14) return onProbe(null);
    const epi = epicentres.find((e) => dist(e) < 16);
    if (epi) return onProbe({ lon: epi.lon, lat: epi.lat });
    if (firesOn) {
      let best: LonLat | null = null;
      let bestPx = 10;
      for (const [lon, lat] of fires) {
        const d = dist({ lon, lat });
        if (d < bestPx) [best, bestPx] = [{ lon, lat }, d];
      }
      if (best) return onProbe(best);
    }
    onProbe({ lon: P.lon(x), lat: P.lat(y) });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = size.w / 8;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      "+": () => zoomAt(0.7),
      "=": () => zoomAt(0.7),
      "-": () => zoomAt(1 / 0.7),
      "0": () => setRawView(HOME),
      Escape: () => onProbe(null),
    };
    if (keys[e.key]) {
      e.preventDefault();
      keys[e.key]();
    }
  };

  const viewBox = `${P.left} ${-P.top} ${view.span} ${size.h / P.k}`;
  const inView = (p: LonLat, pad = 0) => P.x(p.lon) > -pad && P.x(p.lon) < size.w + pad && P.y(p.lat) > -pad && P.y(p.lat) < size.h + pad;
  const sg = { x: P.x(SINGAPORE.lon), y: P.y(SINGAPORE.lat) };
  const pathsOn = layers.has("paths");

  return (
    <div
      ref={box}
      data-no-swipe
      tabIndex={0}
      role="application"
      aria-roledescription="map"
      aria-label="Haze map centred on Singapore. Drag to pan, pinch or scroll to zoom, tap a spot to see where its air goes. Arrow keys pan, plus and minus zoom, 0 recentres."
      className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-lg border border-border bg-[var(--sea)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:aspect-[16/10]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        const p = local(e);
        zoomAt(0.5, p.x, p.y);
      }}
      onKeyDown={onKeyDown}
    >
      {/* Drawn once the box is measured, so the map never flashes at a wrong scale. */}
      {size.w > 0 && (
        <svg className="absolute inset-0 h-full w-full" viewBox={viewBox} preserveAspectRatio="none" aria-hidden>
          <path d={LAND_PATH} fill="var(--land)" stroke="var(--coast)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <path d={BORDER_PATH} fill="none" stroke="var(--coast)" strokeWidth={0.8} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <canvas ref={smokeCanvas} className="absolute inset-0 h-full w-full text-[color:var(--haze)]" aria-hidden />
      <span ref={fireSwatch} className="hidden text-[color:var(--fire-dot)]" />
      <canvas ref={windCanvas} className="absolute inset-0 h-full w-full text-[color:var(--wind)]" aria-hidden />

      <svg className={`pointer-events-none absolute inset-0 h-full w-full ${size.w ? "" : "hidden"}`} aria-hidden>
        {/* Distance rings around Singapore, labelled to the northeast (over the sea). */}
        {RINGS_KM.map((km) => {
          const r = (km / 111.2) * P.k;
          return (
            <g key={km}>
              <circle cx={sg.x} cy={sg.y} r={r} fill="none" stroke="var(--ink-2)" strokeOpacity={0.35} strokeDasharray="2 4" />
              <text x={sg.x + r * 0.71 + 3} y={sg.y - r * 0.71 - 3} fontSize={10} fill="var(--muted)" stroke="var(--sea)" strokeWidth={3} paintOrder="stroke">
                {km.toLocaleString()} km
              </text>
            </g>
          );
        })}

        {LABELS.filter((l) => inView(l, 40) && P.k >= (l.minK ?? 0)).map((l) => (
          <text
            key={l.name}
            x={P.x(l.lon)}
            y={P.y(l.lat)}
            textAnchor="middle"
            fontSize={l.sea ? 10.5 : 12}
            fontStyle={l.sea ? "italic" : undefined}
            fontWeight={l.sea ? undefined : 500}
            fill={l.sea ? "var(--muted)" : "var(--ink-2)"}
            stroke={l.sea ? "var(--sea)" : "var(--land)"}
            strokeWidth={3}
            paintOrder="stroke"
            letterSpacing={l.sea ? 0.5 : 0.2}
          >
            {l.name}
          </text>
        ))}

        {pathsOn && backPath.length > 1 && <FlowPath points={backPath} anchor={backPath.at(-1)!.t} P={P} color="var(--path)" />}
        {probePath.length > 1 && <FlowPath points={probePath} anchor={probePath[0].t} P={P} color="var(--path-probe)" />}

        {firesOn &&
          epicentres.map((e, i) => (
            <g key={`${e.lon},${e.lat}`} transform={`translate(${P.x(e.lon)} ${P.y(e.lat)})`}>
              <circle r={15} fill="none" stroke="var(--fire-dot)" strokeWidth={2} className="origin-center [transform-box:fill-box] motion-safe:animate-[map-pulse_2.4s_ease-out_infinite]" />
              <circle r={9} fill="var(--surface)" stroke="var(--fire-dot)" strokeWidth={2} />
              <text textAnchor="middle" dy="0.35em" fontSize={10.5} fontWeight={700} fill="var(--ink)">
                {i + 1}
              </text>
            </g>
          ))}

        {probe && (
          <g transform={`translate(${P.x(probe.lon)} ${P.y(probe.lat)})`}>
            <circle r={6} fill="var(--path-probe)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}

        <g transform={`translate(${sg.x} ${sg.y})`}>
          <circle r={12} fill="var(--path)" fillOpacity={0.25} className="origin-center [transform-box:fill-box] motion-safe:animate-[map-pulse_2s_ease-out_infinite]" />
          <circle r={5} fill="var(--path)" stroke="var(--surface)" strokeWidth={2} />
          <text x={9} y={-8} fontSize={12} fontWeight={600} fill="var(--ink)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">
            Singapore
          </text>
        </g>
      </svg>

      {loading && (
        <div className="absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-2 shadow-sm">Loading wind and smoke…</span>
        </div>
      )}

      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        {[
          { label: "Zoom in", glyph: "M12 5v14M5 12h14", on: () => zoomAt(0.6) },
          { label: "Zoom out", glyph: "M5 12h14", on: () => zoomAt(1 / 0.6) },
          { label: "Centre on Singapore", glyph: "M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6", on: () => setRawView(HOME) },
        ].map((b) => (
          <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.on} className={`grid size-8 place-items-center shadow-sm ${chromeButton}`}>
            <svg width="1rem" height="1rem" viewBox="0 0 24 24" aria-hidden>
              <path d={b.glyph} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * An air path with flowing dashes in its direction of travel, hour marks every 12 hours (relative to
 * `anchor`: Singapore's end of a back path, the probed start of a forward one) and an arrowhead.
 */
function FlowPath({ points, anchor, P, color }: { points: PathPoint[]; anchor: number; P: Projection; color: string }) {
  const xy = points.map((p) => [P.x(p.lon), P.y(p.lat)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [x1, y1] = xy.at(-2)!;
  const [x2, y2] = xy.at(-1)!;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return (
    <g>
      <path d={d} fill="none" stroke="var(--surface)" strokeOpacity={0.75} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="7 5"
        className="motion-safe:animate-[path-flow_0.8s_linear_infinite]"
      />
      {points.map((p, i) => {
        const hours = Math.round((p.t - anchor) / HOUR);
        if (i === 0 || i === points.length - 1 || hours % 12) return null;
        return (
          <g key={p.t} transform={`translate(${xy[i][0]} ${xy[i][1]})`}>
            <circle r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
            <text x={6} y={-5} fontSize={10} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">
              {hours > 0 ? `+${hours}` : `−${-hours}`} h
            </text>
          </g>
        );
      })}
      <path d="M0,0 L-9,-5 L-9,5 Z" fill={color} transform={`translate(${x2} ${y2}) rotate(${angle})`} />
    </g>
  );
}
