import { fmtDateTime } from "@/lib/format";
import { AlertsButton } from "./alerts-button";
import { InstallButton } from "./install-button";
import { OfflineNotice } from "./offline-notice";
import { ThemeToggle } from "./theme-toggle";

/** Page chrome: header with the reading time, and the data-source footer. */
export function Shell({
  children,
  observedAt,
  refreshFailed,
}: {
  children: React.ReactNode;
  observedAt?: Date;
  refreshFailed?: boolean;
}) {
  return (
    // Padding clears the status bar, notch and home indicator (the viewport is edge to edge).
    <main className="safe-gutters mx-auto w-full max-w-6xl pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Hazelite</h1>
          <p className="text-sm text-ink-2">Singapore haze monitor</p>
          {observedAt && (
            <p className="mt-1 text-xs text-muted">
              Reading for {fmtDateTime.format(observedAt)} SGT
              {refreshFailed && <span className="block">Last refresh failed — showing stored data</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <InstallButton />
          {/* Public key, read at request time so alerts switch on with the env var, no rebuild needed. */}
          {process.env.VAPID_PUBLIC_KEY && <AlertsButton vapidKey={process.env.VAPID_PUBLIC_KEY} />}
          <ThemeToggle />
        </div>
      </header>
      <OfflineNotice />
      {children}
      <footer className="mt-10 text-xs text-muted">
        Data: National Environment Agency via{" "}
        <a className="underline" href="https://data.gov.sg" target="_blank" rel="noopener noreferrer">
          data.gov.sg
        </a>
        . Bands and advisories follow NEA&apos;s published PSI and PM2.5 descriptors. PM2.5 forecast:{" "}
        <a className="underline" href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0), containing modified Copernicus Atmosphere Monitoring Service information. Fire hotspots:{" "}
        <a className="underline" href="https://firms.modaps.eosdis.nasa.gov" target="_blank" rel="noopener noreferrer">
          NASA FIRMS
        </a>
        . Headlines: Google News.
      </footer>
    </main>
  );
}

/** A full-page notice inside the chrome (setup problems, waiting for first data). */
export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-ink-2">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-2">{children}</p>
      </div>
    </Shell>
  );
}
