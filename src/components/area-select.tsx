import { titleCase } from "@/lib/format";
import { REGIONS, type Region } from "@/lib/schema";
import { field } from "./styles";

/**
 * "Area" picker for NEA's five regions (a native select: the best picker on phones). `compact` hides
 * the word "Area" on phones (screen readers still hear it), to keep a crowded row on one line.
 */
export function AreaSelect({
  value,
  onChange,
  compact = false,
  className = "",
}: {
  value: Region;
  onChange: (r: Region) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex items-center gap-2 text-ink-2 ${className}`}>
      <span className={compact ? "max-sm:sr-only" : undefined}>Area</span>
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
