export async function register() {
  // On Vercel there's no long-lived server: migrations run at build time (vercel-build), and
  // page visits plus a daily cron refresh the data (see lib/refresh.ts).
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VERCEL) return;
  const { startPoller } = await import("./lib/poller");
  startPoller();
}
