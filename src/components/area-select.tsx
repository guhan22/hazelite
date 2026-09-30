import { titleCase } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/schema";
import { field } from "./styles";

/** "Area" picker for NEA's five regions (a native select: the best picker on phones). */
export function AreaSelect({ value, onChange, className = "" }: { value: Region; onChange: (r: Region) => void; className?: string }) {
  return (
    <label className={`flex items-center gap-2 text-ink-2 ${className}`}>
      Area
      <select value={value} onChange={(e) => onChange(e.target.value as Region)} className={field}>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {titleCase(r)}
          </option>
        ))}
      </select>
    </label>
  );
}
