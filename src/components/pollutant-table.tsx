import { fmtDateTime } from "@/lib/format";
import type { LatestReading } from "@/lib/queries";
import type { MeasureKey } from "@/lib/schema";
import { drivingPollutant } from "@/lib/summary";
import { Card } from "./card";

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
    <th className={`py-2 align-bottom font-medium ${first ? "px-5 text-left" : "px-3"}`}>
      {label}
      {sub && <span className="block font-normal">{sub}</span>}
    </th>
  );
}

/** Latest pollutant concentrations per region, with the pollutant driving each PSI. */
export function PollutantTable({ readings, observedAt }: { readings: LatestReading[]; observedAt: Date }) {
  return (
    <Card
      title="Pollutant readings"
      subtitle={
        <>
          {fmtDateTime.format(observedAt)} · the pollutant with the highest sub-index sets the PSI
          <span className="sm:hidden"> · scroll sideways for more</span>
        </>
      }
    >
      <div className="-mx-5 -mb-5 overflow-x-auto">
        <table className="tabular w-full min-w-[40rem] text-right text-sm">
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
                <td className="whitespace-nowrap px-3 py-2 text-ink-2">{drivingPollutant(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
