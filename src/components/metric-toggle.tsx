"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { METRICS, type MetricId } from "@/lib/metrics";
import { Segmented } from "./segmented";

const MetricContext = createContext<readonly [MetricId, (id: MetricId) => void]>(["pm25", () => {}]);

/** Shares the 1-hr PM2.5 / 24-hr PSI choice across the page. Starts on 1-hr PM2.5, NEA's "right now" measure. */
export function MetricProvider({ children }: { children: ReactNode }) {
  const state = useState<MetricId>("pm25");
  return <MetricContext value={state}>{children}</MetricContext>;
}

export const useMetric = () => use(MetricContext);

const METRIC_OPTIONS = Object.values(METRICS).map((m) => ({ value: m.id, label: m.name }));

export function MetricToggle() {
  const [metricId, setMetricId] = useMetric();
  return <Segmented label="Show" value={metricId} options={METRIC_OPTIONS} onChange={setMetricId} className="text-xs" />;
}

/** Shows whichever pre-rendered view matches the selected metric. */
export function ByMetric({ views }: { views: Record<MetricId, ReactNode> }) {
  return views[useMetric()[0]];
}
