"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fitCanvas, rgbOf, useReducedMotion, useThemeVersion } from "@/lib/canvas";
import type { FireMap } from "@/lib/fires";
import { SINGAPORE, type Epicentre, type Field, type LonLat, type PathPoint } from "@/lib/flow";
import { BORDER_PATH, LAND_PATH } from "@/lib/sea-map";
import { HOUR } from "@/lib/time";
import { animateWind, clampView, drawFires, drawSmoke, drawWindArrows, HOME, project, zoomView, type Projection, type View } from "./map-layers";
import { chromeButton } from "./styles";

export type Layer = "wind" | "smoke" | "fires" | "paths";

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
  const live = useRef({ P, field });
  useEffect(() => {
    live.current = { P, field };
  });

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zooms by `factor` (< 1 zooms in), keeping the point under (px, py) in place. */
  const zoomAt = (factor: number, px = size.w / 2, py = size.h / 2) =>
    setRawView((raw) => zoomView(clampView(raw, aspect), factor, px, py, size.w, size.h));
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
    const ctx = fitCanvas(canvas, size.w, size.h);
    if (smokeOn && field) drawSmoke(ctx, P, field, rgbOf(canvas));
    if (firesOn) drawFires(ctx, P, fires, freshAfter, rgbOf(fireSwatch.current!));
    // P is derived from view and size, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, fires, freshAfter, firesOn, smokeOn, size, view.cx, view.cy, view.span, theme]);

  // Wind: streaks drifting with the wind, leaving fading trails. Still arrows for reduced motion.
  const windOn = layers.has("wind");
  useEffect(() => {
    const canvas = windCanvas.current;
    if (!canvas || !size.w) return;
    const ctx = fitCanvas(canvas, size.w, size.h);
    if (!windOn) return;
    const rgb = rgbOf(canvas);
    if (!reduced) return animateWind(canvas, ctx, rgb, () => live.current);
    if (live.current.field) drawWindArrows(ctx, live.current.P, live.current.field, rgb);
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
