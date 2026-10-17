// The haze map's geometry (what's on screen and where each place lands) and its canvas layers:
// smoke, fire hotspots, and the wind as drifting streaks or still arrows.

import { animateWhileVisible } from "@/lib/canvas";
import type { FireMap } from "@/lib/fires";
import { SINGAPORE, valueAt, type Field } from "@/lib/flow";
import { clamp } from "@/lib/geo";
import { GRID } from "@/lib/regional";

/** What part of the map is on screen: the centre (lon, lat) and the width in degrees of longitude. */
export interface View {
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
export const HOME: View = { cx: SINGAPORE.lon, cy: SINGAPORE.lat, span: Infinity };

/** Keeps a view inside the map and its zoom limits. `aspect` is height / width. */
export function clampView(v: View, aspect: number): View {
  const span = clamp(v.span, MIN_SPAN, Math.min(MAX_SPAN_X, MAX_SPAN_Y / aspect));
  const spanY = span * aspect;
  return {
    cx: clamp(v.cx, EXTENT.w + span / 2, EXTENT.e - span / 2),
    cy: clamp(v.cy, EXTENT.s + spanY / 2, EXTENT.n - spanY / 2),
    span,
  };
}

/** Equirectangular: near the equator a degree of longitude and of latitude are nearly the same distance. */
export function project(v: View, w: number, h: number) {
  const k = w / v.span; // pixels per degree
  const left = v.cx - v.span / 2;
  const top = v.cy + h / k / 2;
  return {
    k,
    left,
    top,
    w,
    h,
    x: (lon: number) => (lon - left) * k,
    y: (lat: number) => (top - lat) * k,
    lon: (x: number) => left + x / k,
    lat: (y: number) => top - y / k,
  };
}
export type Projection = ReturnType<typeof project>;

/** Zooms by `factor` (< 1 zooms in), keeping the point under (px, py) in place. */
export function zoomView(v: View, factor: number, px: number, py: number, w: number, h: number): View {
  const p = project(v, w, h);
  const span = clampView({ ...v, span: v.span * factor }, h / w).span;
  const k = w / span;
  return clampView({ cx: p.lon(px) - px / k + span / 2, cy: p.lat(py) + py / k - h / k / 2, span }, h / w);
}

/** Smoke opacity for a PM2.5 level: invisible in clean air, thickening through "Elevated" and "High". */
const smokeAlpha = (pm: number) => (pm < 20 ? 0 : Math.min(0.72, 0.06 + ((pm - 20) / 260) * 0.66));

/** Model smoke: one pixel per grid point (north row first), scaled up and smoothed by the browser. */
export function drawSmoke(ctx: CanvasRenderingContext2D, P: Projection, field: Field, rgb: string) {
  const [r, g, b] = rgb.split(" ").map(Number);
  const img = new ImageData(GRID.nx, GRID.ny);
  for (let y = 0; y < GRID.ny; y++)
    for (let x = 0; x < GRID.nx; x++)
      img.data.set([r, g, b, Math.round(255 * smokeAlpha(field.pm[y * GRID.nx + x]))], ((GRID.ny - 1 - y) * GRID.nx + x) * 4);
  const tiny = document.createElement("canvas");
  [tiny.width, tiny.height] = [GRID.nx, GRID.ny];
  tiny.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Each image pixel is centred on its grid point.
  const half = GRID.step / 2;
  ctx.drawImage(tiny, P.x(GRID.lon0 - half), P.y(EXTENT.n + half), GRID.nx * GRID.step * P.k, GRID.ny * GRID.step * P.k);
}

const fireRadius = (count: number, k: number) => clamp(1.2 + Math.sqrt(count) * 0.6, 1.2, 5) * clamp(k / 22, 0.7, 2.5);

/** Hotspot cells, sized by detections; bright if detected after `freshAfter`, faded if older. */
export function drawFires(ctx: CanvasRenderingContext2D, P: Projection, cells: FireMap["cells"], freshAfter: number, rgb: string) {
  ctx.fillStyle = `rgb(${rgb})`;
  // Older detections first, so fresh ones sit on top.
  for (const fresh of [false, true]) {
    ctx.globalAlpha = fresh ? 0.95 : 0.4;
    ctx.beginPath();
    for (const [lon, lat, count, , t] of cells) {
      if (t > freshAfter !== fresh) continue;
      const [x, y] = [P.x(lon), P.y(lat)];
      if (x < -8 || y < -8 || x > P.w + 8 || y > P.h + 8) continue;
      const r = fireRadius(count, P.k);
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const windAt = (field: Field, P: Projection, x: number, y: number) => {
  const [u, v] = [valueAt(field.u, P.lon(x), P.lat(y)), valueAt(field.v, P.lon(x), P.lat(y))];
  return u == null || v == null ? null : { u, v, speed: Math.hypot(u, v) };
};

/** The wind as still arrows on a 36 px grid, for reduced motion. */
export function drawWindArrows(ctx: CanvasRenderingContext2D, P: Projection, field: Field, rgb: string) {
  ctx.strokeStyle = `rgb(${rgb} / 0.7)`;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let y = 18; y < P.h; y += 36)
    for (let x = 18; x < P.w; x += 36) {
      const wind = windAt(field, P, x, y);
      if (!wind || wind.speed < 1) continue;
      const len = clamp(4 + wind.speed * 0.5, 5, 16);
      const [dx, dy] = [(wind.u / wind.speed) * len, (-wind.v / wind.speed) * len];
      const [tx, ty] = [x + dx / 2, y + dy / 2];
      const a = Math.atan2(dy, dx);
      ctx.moveTo(x - dx / 2, y - dy / 2);
      ctx.lineTo(tx, ty);
      // Arrowhead at the downwind end.
      for (const side of [-0.5, 0.5]) {
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 4 * Math.cos(a + side), ty - 4 * Math.sin(a + side));
      }
    }
  ctx.stroke();
}

// Speed bands: faster wind draws brighter.
const BANDS = [10, 20, 35, Infinity];
const ALPHA = [0.3, 0.5, 0.7, 0.92];
const PX_PER_KMH = 0.05; // per frame: 20 km/h drifts ~1 px a frame

/**
 * Particles drifting with the wind and leaving fading trails, reading the current projection and
 * field each frame (so time and view changes need no restart). Returns a stop function.
 */
export function animateWind(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, rgb: string, read: () => { P: Projection; field: Field | null }) {
  let P = read().P;
  const { w, h } = P;
  const n = Math.min(1800, Math.round((w * h) / 300));
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const ages = new Uint16Array(n);
  const spawn = (i: number) => {
    xs[i] = Math.random() * w;
    ys[i] = Math.random() * h;
    ages[i] = 40 + Math.floor(Math.random() * 60);
  };
  const spawnAll = () => {
    for (let i = 0; i < n; i++) spawn(i);
  };
  spawnAll();

  return animateWhileVisible(canvas, () => {
    const now = read();
    // Panned or zoomed: the trails no longer line up, so start afresh.
    if (now.P.left !== P.left || now.P.top !== P.top || now.P.k !== P.k) {
      ctx.clearRect(0, 0, w, h);
      spawnAll();
      P = now.P;
    }
    // Fade the trails: keep 92% of what's there each frame.
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgb(0 0 0 / 0.92)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    if (!now.field) return;
    const paths = BANDS.map(() => new Path2D());
    for (let i = 0; i < n; i++) {
      const wind = windAt(now.field, P, xs[i], ys[i]);
      if (!wind || --ages[i] === 0) {
        spawn(i);
        continue;
      }
      const [x2, y2] = [xs[i] + wind.u * PX_PER_KMH, ys[i] - wind.v * PX_PER_KMH];
      const path = paths[BANDS.findIndex((b) => wind.speed < b)];
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
  }).stop;
}
