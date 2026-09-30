import { fmtDateTime, fmtPoint, titleCase } from "@/lib/format";
import type { Bucket, LatestReading, SeriesPoint } from "@/lib/queries";
import type { MeasureKey, Region } from "@/lib/schema";
import { drivingPollutant } from "@/lib/summary";

const POLLUTANT_COLUMNS: { key: MeasureKey; label: string; unit: string }[] = [
  { key: "pm25_24h", label: "PM2.5 24h", unit: "µg/m³" },
  { key: "pm10_24h", label: "PM10 24h", unit: "µg/m³" },
  { key: "o3_8hMax", label: "O₃ 8h max", unit: "µg/m³" },
  { key: "no2_1hMax", label: "NO₂ 1h max", unit: "µg/m³" },
  { key: "so2_24h", label: "SO₂ 24h", unit: "µg/m³" },
  { key: "co_8hMax", label: "CO 8h max", unit: "mg/m³" },
];

function Th({ label, sub, first }: { label: string; sub?: string; first?: boolean }) {
  return (
    <th className={`py-2 font-medium ${first ? "px-5 text-left" : "px-3"}`}>
      {label}
      {sub && <span className="block font-normal">{sub}</span>}
    </th>
  );
}

/** PSI · PM2.5 per region (hourly, or daily maximum), newest first: the table view of the charts. */
export function ReadingsTable({ series, regions, bucket }: { series: SeriesPoint[]; regions: Region[]; bucket: Bucket }) {
  return (
    <details className="mt-6 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium">View readings as a table</summary>
      <div className="max-h-96 overflow-auto border-t border-border">
        <table className="tabular w-full text-right text-sm">
          <thead className="sticky top-0 bg-surface text-xs text-muted">
            <tr>
              <Th label={bucket === "day" ? "Date (daily max)" : "Time (SGT)"} first />
              {regions.map((r) => (
                <Th key={r} label={titleCase(r)} sub="PSI · PM2.5" />
              ))}
            </tr>
          </thead>
          <tbody>
            {series.toReversed().map((p) => (
              <tr key={p.t} className="border-t border-border">
                <td className="px-5 py-1.5 text-left text-ink-2">{fmtPoint(p.t, bucket)}</td>
                {regions.map((r) => (
                  <td key={r} className="px-3 py-1.5">
                    {p.values[r]?.psi ?? "–"} · {p.values[r]?.pm25 ?? "–"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Latest pollutant concentrations per region, with the pollutant driving each PSI. */
export function PollutantTable({ readings, observedAt }: { readings: LatestReading[]; observedAt: Date }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-surface">
      <h2 className="px-5 pt-4 text-sm font-medium">Pollutant readings · {fmtDateTime.format(observedAt)}</h2>
      <div className="overflow-x-auto">
        <table className="tabular mt-2 w-full min-w-[40rem] text-right text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <Th label="Region" first />
              {POLLUTANT_COLUMNS.map((c) => (
                <Th key={c.key} label={c.label} sub={c.unit} />
              ))}
              <Th label="Driving pollutant" />
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => (
              <tr key={r.region} className="border-t border-border">
                <td className="px-5 py-2 text-left capitalize">{r.region}</td>
                {POLLUTANT_COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    {r[c.key] ?? "–"}
                  </td>
                ))}
                <td className="px-3 py-2 text-ink-2">{drivingPollutant(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
