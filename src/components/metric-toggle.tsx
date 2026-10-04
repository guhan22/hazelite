"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { METRICS, type MetricId } from "@/lib/metrics";
import { Segmented } from "./segmented";

const MetricContext = createContext<readonly [MetricId, (id: MetricId) => void]>(["aqi", () => {}]);

/** Shares the 1-hr AQI / 1-hr PM2.5 / 24-hr PSI choice across the page. Starts on 1-hr AQI. */
export function MetricProvider({ children }: { children: ReactNode }) {
  const state = useState<MetricId>("aqi");
  return <MetricContext value={state}>{children}</MetricContext>;
}

export const useMetric = () => use(MetricContext);

const METRIC_OPTIONS = Object.values(METRICS).map((m) => ({ value: m.id, label: m.name }));

export function MetricToggle({ className = "" }: { className?: string }) {
  const [metricId, setMetricId] = useMetric();
  return <Segmented label="Show" value={metricId} options={METRIC_OPTIONS} onChange={setMetricId} className={`text-xs ${className}`} />;
}

/** Shows whichever pre-rendered view matches the selected metric. */
export function ByMetric({ views }: { views: Record<MetricId, ReactNode> }) {
  return views[useMetric()[0]];
}
