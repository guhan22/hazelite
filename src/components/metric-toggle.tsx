"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { METRICS, type MetricId } from "@/lib/metrics";
import { pill } from "./styles";

const MetricContext = createContext<readonly [MetricId, (id: MetricId) => void]>(["pm25", () => {}]);

/** Shares the 1-hr PM2.5 / 24-hr PSI choice across the page. Starts on 1-hr PM2.5, NEA's "right now" measure. */
export function MetricProvider({ children }: { children: ReactNode }) {
  const state = useState<MetricId>("pm25");
  return <MetricContext value={state}>{children}</MetricContext>;
}

export const useMetric = () => use(MetricContext);

export function MetricToggle() {
  const [metricId, setMetricId] = useMetric();
  return (
    <div className="flex gap-1.5 text-xs" role="group" aria-label="Show">
      {Object.values(METRICS).map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={m.id === metricId}
          onClick={() => setMetricId(m.id)}
          className={pill(m.id === metricId)}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
}

/** Shows whichever pre-rendered view matches the selected metric. */
export function ByMetric({ views }: { views: Record<MetricId, ReactNode> }) {
  return views[useMetric()[0]];
}
