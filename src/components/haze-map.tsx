"use client";

import { ToggleGroup } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { bandFor, PM25_BANDS } from "@/lib/bands";
import { FIRE_AREAS, inside, type FireMap } from "@/lib/fires";
import {
  bearing,
  compassWord,
  fieldAt,
  findEpicentres,
  firesAlong,
  firesNear,
  kmBetween,
  placeNear,
  SINGAPORE,
  timeSpan,
  tracePath,
  valueAt,
  type LonLat,
  type PathPoint,
} from "@/lib/flow";
import { sgtFormat } from "@/lib/format";
import type { RegionalWeather } from "@/lib/regional";
import { HOUR } from "@/lib/time";
import { Card } from "./card";
import { MapView, type Layer } from "./map-view";
import { StatusLabel } from "./status";
import { pill } from "./styles";

interface MapData {
  weather: RegionalWeather | null;
  fires: FireMap | null;
  /** When it was loaded: "now" on the time slider. */
  loadedAt: number;
}

const LAYERS: { value: Layer; label: string }[] = [
  { value: "wind", label: "Wind" },
  { value: "smoke", label: "Smoke" },
  { value: "fires", label: "Fires" },
  { value: "paths", label: "Air path" },
];
const PATH_HOURS = 48;
/** Playback speed: six hours of weather per second. */
const PLAY_HOURS_PER_TICK = 0.3;
const PLAY_TICK_MS = 50;
const RELOAD_MS = 30 * 60_000;

const fmtTime = sgtFormat({ weekday: "short", hour: "numeric" });
const fmtDetected = sgtFormat({ weekday: "short", hour: "numeric", minute: "2-digit" });
const hoursLabel = (h: number) => `${h} ${h === 1 ? "hr" : "hrs"}`;
const latLon = ({ lon, lat }: LonLat) => `${Math.abs(lat).toFixed(1)}°${lat < 0 ? "S" : "N"}, ${lon.toFixed(1)}°E`;

/** Loads the map's layers the first time it scrolls into view (its tab is opened), then every half hour. */
function useMapData() {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const load = () =>
      fetch("/api/haze-map")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Omit<MapData, "loadedAt">) => {
          if (cancelled) return;
          setData({ ...d, loadedAt: Date.now() });
          setFailed(false);
        })
        .catch(() => !cancelled && setFailed(true));
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      load();
      timer = setInterval(load, RELOAD_MS);
    });
    io.observe(ref.current!);
    return () => {
      cancelled = true;
      io.disconnect();
      clearInterval(timer);
    };
  }, []);
  return { ref, data, failed };
}

/** The closest an air path comes to Singapore, and how many hours along it. */
function approach(path: PathPoint[]) {
  let best = { km: Infinity, hours: 0 };
  for (const p of path) {
    const km = kmBetween(p, SINGAPORE);
    if (km < best.km) best = { km, hours: Math.round(Math.abs(p.t - path[0].t) / HOUR) };
  }
  return best;
}

/** "reaches Singapore in about 20 hrs", "comes within 340 km of Singapore, in about 30 hrs", and so on. */
function approachText(path: PathPoint[]) {
  if (path.length < 2) return null;
  const { km, hours } = approach(path);
  if (km < 80) return hours === 0 ? "is over Singapore now" : `reaches Singapore in about ${hoursLabel(hours)}`;
  const total = Math.round((path.at(-1)!.t - path[0].t) / HOUR);
  if (hours === 0) return `heads away from Singapore over the next ${hoursLabel(total)}`;
  // Closest at the very end: the forecast runs out while it's still on its way.
  if (hours === total) return `is still drifting toward Singapore after ${hoursLabel(hours)}, about ${Math.round(km / 10) * 10} km away`;
  return `comes within ${Math.round(km / 10) * 10} km of Singapore, in about ${hoursLabel(hours)}`;
}

/** Island or province names along a path, in order, without repeats. */
function placesAlong(path: LonLat[]) {
  const names: string[] = [];
  for (const p of path) {
    const island = FIRE_AREAS.find((a) => inside([p.lon, p.lat], a.outline))?.name;
    const place = province(placeNear(p));
    for (const n of [island, place]) if (n && n !== "Singapore" && !names.includes(n)) names.push(n);
  }
  return names;
}

/** "Ketapang, West Kalimantan" → "West Kalimantan". */
const province = (place: string | null) => place?.split(", ").at(-1) ?? null;

const listJoin = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * The Map tab: where the region's fires are, where their smoke is, and which way the wind carries it,
 * with Singapore at the centre. Inspired by the hotspot map on haze.gov.sg, with moving wind and air paths.
 */
export function HazeMap() {
  const { ref, data, failed } = useMapData();
  const [layers, setLayers] = useState<Layer[]>(["wind", "smoke", "fires", "paths"]);
  const [chosen, setChosen] = useState<number | null>(null); // null: now
  const [playing, setPlaying] = useState(false);
  const [probe, setProbe] = useState<LonLat | null>(null);

  const weather = data?.weather ?? null;
  const now = data?.loadedAt ?? 0;
  const [first, last] = weather ? timeSpan(weather) : [now, now];
  const time = Math.min(last, Math.max(first, chosen ?? now));

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setChosen((t) => {
      const next = (t ?? now) + PLAY_HOURS_PER_TICK * HOUR;
      return next > last ? first : next; // loops, like a weather radar
    }), PLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, now, first, last]);

  const field = useMemo(() => (weather ? fieldAt(weather, time) : null), [weather, time]);
  const cells = useMemo(() => data?.fires?.cells ?? [], [data]);
  // Scrubbed into the past: only the fires detected by then. The future shows the latest.
  const shownCells = useMemo(() => (time >= now ? cells : cells.filter((c) => c[4] <= time)), [cells, time, now]);
  const freshAfter = Math.min(time, now) - 12 * HOUR;
  const epicentres = useMemo(() => findEpicentres(cells.filter((c) => c[4] > now - 24 * HOUR)), [cells, now]);
  const backPath = useMemo(() => (weather ? tracePath(weather, SINGAPORE, time, PATH_HOURS, -1).reverse() : []), [weather, time]);
  const probePath = useMemo(() => (weather && probe ? tracePath(weather, probe, time, PATH_HOURS) : []), [weather, probe, time]);
  const epicentrePaths = useMemo(
    () => (weather ? epicentres.map((e) => ({ ...e, path: tracePath(weather, e, time, PATH_HOURS) })) : []),
    [weather, epicentres, time],
  );

  const layerSet = useMemo(() => new Set(layers), [layers]);
  const hasFires = !!data?.fires;
  const recentFires = cells.filter((c) => c[4] > now - 24 * HOUR).reduce((n, c) => n + c[2], 0);

  return (
    <div ref={ref} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Haze map" className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Haze around the region</h2>
            <p className="text-xs text-muted">Fires, smoke and the 2,500 ft wind, with Singapore at the centre</p>
          </div>
          <ToggleGroup.Root
            type="multiple"
            aria-label="Map layers"
            value={layers}
            onValueChange={(v) => setLayers(v as Layer[])}
            className="flex flex-wrap gap-1.5 text-xs"
          >
            {LAYERS.filter((l) => l.value !== "fires" || hasFires).map((l) => (
              <ToggleGroup.Item key={l.value} value={l.value} className={pill(layers.includes(l.value))}>
                {l.label}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>

        <MapView
          field={field}
          fires={shownCells}
          freshAfter={freshAfter}
          layers={layerSet}
          backPath={backPath}
          probePath={probePath}
          probe={probe}
          epicentres={layerSet.has("fires") ? epicentres : []}
          onProbe={setProbe}
          loading={!data && !failed}
        />

        {weather && (
          <TimeScrubber
            first={first}
            last={last}
            now={now}
            time={time}
            playing={playing}
            onPlay={() => setPlaying((p) => !p)}
            onChange={(t) => {
              setPlaying(false);
              // Snapping back to now keeps "now" moving with each reload.
              setChosen(Math.abs(t - now) < HOUR / 2 ? null : t);
            }}
          />
        )}

        <Legend fires={hasFires} />
        <p className="text-xs text-muted">
          {failed
            ? "Couldn't load the map's layers. They'll be retried shortly."
            : data && !weather
              ? "Wind and smoke arrive with the next refresh (every 3 hours). Check back soon."
              : "Tap anywhere to trace where its air goes. Drag to pan, pinch or scroll to zoom."}
        </p>
      </section>

      <div className="flex flex-col gap-6">
        {weather && field && <SingaporeAir time={time} now={now} field={field} backPath={backPath} cells={shownCells} recentFires={hasFires ? recentFires : null} />}
        {probe && weather && field && (
          <ProbeCard probe={probe} field={field} path={probePath} cells={shownCells} hasFires={hasFires} onClose={() => setProbe(null)} />
        )}
        {hasFires && weather && (
          <EpicentreList
            epicentres={epicentrePaths}
            onPick={(e) => {
              setProbe(e);
              setLayers((l) => (l.includes("fires") ? l : [...l, "fires"]));
            }}
          />
        )}
        <p className="text-xs text-muted">
          Wind at 925 hPa (about 2,500 ft) and model smoke (CAMS surface PM2.5) from Open-Meteo; hotspots from NASA FIRMS
          (VIIRS, NOAA-20), last 48 hours. Air paths follow the 2,500 ft wind only, so treat them as a rough guide: real
          smoke also rises, sinks and rains out.
        </p>
      </div>
    </div>
  );
}

function TimeScrubber({
  first,
  last,
  now,
  time,
  playing,
  onPlay,
  onChange,
}: {
  first: number;
  last: number;
  now: number;
  time: number;
  playing: boolean;
  onPlay: () => void;
  onChange: (t: number) => void;
}) {
  const offset = Math.round((time - now) / HOUR);
  const relative = offset === 0 ? "Now" : offset < 0 ? `${hoursLabel(-offset)} ago` : `In ${hoursLabel(offset)} · forecast`;
  const nowAt = ((now - first) / (last - first)) * 100;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
      <button
        type="button"
        onClick={onPlay}
        aria-label={playing ? "Pause" : "Play the wind and smoke from two days ago to two days ahead"}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-page transition-transform active:scale-90"
      >
        <svg width="0.875rem" height="0.875rem" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          {playing ? <path d="M6 4h4v16H6zM14 4h4v16h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
        </svg>
      </button>
      <div className="relative min-w-0 flex-1">
        {/* Where "now" sits on the track. */}
        <span aria-hidden className="pointer-events-none absolute -top-1.5 h-1.5 w-0.5 -translate-x-1/2 rounded bg-[var(--status-good)]" style={{ left: `${nowAt}%` }} />
        <input
          type="range"
          min={first}
          max={last}
          step={HOUR}
          value={Math.round(time / HOUR) * HOUR}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Time"
          aria-valuetext={`${fmtTime.format(time)}, ${relative}`}
          className="w-full accent-[var(--ink)]"
        />
      </div>
      <div className="w-28 shrink-0 text-right text-xs leading-tight">
        <div className="tabular font-medium">{fmtTime.format(time)}</div>
        <div className={offset > 0 ? "text-[color:var(--path-probe)]" : "text-muted"}>{relative}</div>
      </div>
    </div>
  );
}

function Legend({ fires }: { fires: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-8 rounded-sm bg-[linear-gradient(90deg,transparent,var(--haze))]" />
        Smoke, light to dense
      </li>
      {fires && (
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-[var(--fire-dot)]" />
          Hotspot (faded: over 12 hrs old)
        </li>
      )}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-6 rounded bg-[var(--wind)] opacity-70" />
        Wind (brighter is faster)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-6 border-t-[2.5px] border-dashed border-[var(--path)]" />
        Where Singapore&apos;s air came from
      </li>
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function windText(field: ReturnType<typeof fieldAt>, p: LonLat) {
  const [u, v] = [valueAt(field.u, p.lon, p.lat) ?? 0, valueAt(field.v, p.lon, p.lat) ?? 0];
  const speed = Math.round(Math.hypot(u, v));
  if (speed < 2) return "Calm";
  // The wind blows from the opposite of where it's heading.
  const from = (Math.atan2(-u, -v) * 180) / Math.PI + 360;
  return `From the ${compassWord(from % 360)}, ${speed} km/h`;
}

function Smoke({ pm }: { pm: number }) {
  const band = bandFor(PM25_BANDS, Math.round(pm));
  return (
    <>
      {Math.round(pm)} <span className="text-xs text-muted">µg/m³</span>
      <StatusLabel band={band} className="text-xs text-ink-2" />
    </>
  );
}

function SingaporeAir({
  time,
  now,
  field,
  backPath,
  cells,
  recentFires,
}: {
  time: number;
  now: number;
  field: ReturnType<typeof fieldAt>;
  backPath: PathPoint[];
  cells: FireMap["cells"];
  recentFires: number | null;
}) {
  const origin = backPath[0];
  const hours = origin ? Math.round((time - origin.t) / HOUR) : 0;
  const km = origin ? kmBetween(origin, SINGAPORE) : 0;
  const places = placesAlong(backPath.filter((_, i) => i % 3 === 0));
  const along = firesAlong(cells, backPath);
  const when = Math.abs(time - now) < HOUR / 2 ? "now" : `at ${fmtTime.format(time)}`;
  return (
    <Card title="Singapore's air" subtitle={`Where the air arriving ${when} came from`}>
      {hours > 0 && km > 30 ? (
        <p className="text-sm">
          {hoursLabel(hours)} earlier, it was about <strong>{Math.round(km / 10) * 10} km to the {compassWord(bearing(SINGAPORE, origin))}</strong>
          {places.length > 0 && <>, passing over {listJoin(places.slice(0, 4))}</>}.
        </p>
      ) : (
        <p className="text-sm">The air has been lingering around Singapore: light, shifting winds.</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Fact label="Wind over Singapore">{windText(field, SINGAPORE)}</Fact>
        <Fact label="Model smoke (PM2.5)">
          <Smoke pm={valueAt(field.pm, SINGAPORE.lon, SINGAPORE.lat) ?? 0} />
        </Fact>
        {recentFires != null && (
          <>
            <Fact label="Hotspots, last 24 hrs">{recentFires.toLocaleString()}</Fact>
            <Fact label="Along the air's path">
              {along.toLocaleString()}
              <div className="text-xs text-ink-2">{along > 0 ? "within 40 km of it" : "No fires upwind"}</div>
            </Fact>
          </>
        )}
      </dl>
    </Card>
  );
}

function ProbeCard({
  probe,
  field,
  path,
  cells,
  hasFires,
  onClose,
}: {
  probe: LonLat;
  field: ReturnType<typeof fieldAt>;
  path: PathPoint[];
  cells: FireMap["cells"];
  hasFires: boolean;
  onClose: () => void;
}) {
  const place = placeNear(probe);
  const [name, region] = place?.split(", ") ?? [];
  const fires = firesNear(cells, probe, 15);
  const pm = valueAt(field.pm, probe.lon, probe.lat);
  const goes = approachText(path);
  const places = placesAlong(path.filter((_, i) => i % 3 === 0)).filter((n) => n !== province(place));
  return (
    <Card
      title={name ? `Around ${name}` : "Open sea"}
      subtitle={[region, latLon(probe), `${Math.round(kmBetween(probe, SINGAPORE)).toLocaleString()} km from Singapore`].filter(Boolean).join(" · ")}
      // The close button sits in the corner rather than wrapping under a long subtitle.
      className="relative"
    >
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-ink-2 hover:bg-grid">
        <svg width="1rem" height="1rem" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      {goes && (
        <p className="text-sm">
          <span className="mr-1 inline-block size-2 rounded-full bg-[var(--path-probe)] align-middle" aria-hidden />
          Air here {goes}
          {places.length > 0 && <>, by way of {listJoin(places.slice(0, 3))}</>}.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Fact label="Wind, 2,500 ft">{windText(field, probe)}</Fact>
        <Fact label="Model smoke (PM2.5)">{pm == null ? "–" : <Smoke pm={pm} />}</Fact>
        {hasFires && (
          <div className="col-span-2">
            <Fact label="Hotspots within 15 km">
              {fires.count === 0 ? (
                "None detected"
              ) : (
                <>
                  {fires.count.toLocaleString()}
                  <div className="text-xs text-ink-2">
                    Latest {fmtDetected.format(fires.t)} · strongest {fires.frp.toLocaleString()} MW
                  </div>
                </>
              )}
            </Fact>
          </div>
        )}
      </dl>
    </Card>
  );
}

function EpicentreList({
  epicentres,
  onPick,
}: {
  epicentres: (ReturnType<typeof findEpicentres>[number] & { path: PathPoint[] })[];
  onPick: (e: LonLat) => void;
}) {
  return (
    <Card title="Fire epicentres" subtitle="The busiest clusters of the last 24 hours">
      {epicentres.length === 0 ? (
        <p className="text-sm text-ink-2">No large clusters of fires right now. 🎉</p>
      ) : (
        <ol className="-mx-2 flex flex-col">
          {epicentres.map((e, i) => (
            <li key={`${e.lon},${e.lat}`}>
              <button type="button" onClick={() => onPick(e)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-grid">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-[var(--fire-dot)] text-[0.625rem] font-bold">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {e.place ?? latLon(e)} <span className="font-normal text-muted">· {e.count.toLocaleString()} hotspots</span>
                  </span>
                  <span className="block text-xs text-ink-2">Its smoke {approachText(e.path) ?? "has no wind data"}.</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
