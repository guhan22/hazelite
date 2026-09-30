import { fmtDateTime } from "@/lib/format";
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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hazelite</h1>
          <p className="text-sm text-ink-2">Singapore haze monitor</p>
        </div>
        <div className="flex items-center gap-3">
          {observedAt && (
            <p className="text-right text-xs text-muted">
              Reading for {fmtDateTime.format(observedAt)} SGT
              {refreshFailed && <span className="block">Last refresh failed — showing stored data</span>}
            </p>
          )}
          <ThemeToggle />
        </div>
      </header>
      {children}
      <footer className="mt-10 text-xs text-muted">
        Data: National Environment Agency via{" "}
        <a className="underline" href="https://data.gov.sg" target="_blank" rel="noopener noreferrer">
          data.gov.sg
        </a>
        . Bands and advisories follow NEA&apos;s published PSI and PM2.5 descriptors.
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
