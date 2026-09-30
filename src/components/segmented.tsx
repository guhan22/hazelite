"use client";

import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { pill } from "./styles";

/**
 * A single-choice row of pills (Radix ToggleGroup: arrow keys move between options, and one option is
 * always selected).
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      // Radix reports "" when the selected pill is pressed again; keep the current choice instead.
      onValueChange={(v) => v && onChange(v as T)}
      className={`flex flex-wrap gap-1.5 ${className}`}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className={pill(o.value === value)}>
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
