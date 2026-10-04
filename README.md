# Hazelite

A Singapore haze monitor. It pulls hourly 24-hr PSI, 1-hr PM2.5, and pollutant readings for NEA's five regions from [data.gov.sg](https://data.gov.sg), stores them in Postgres, and shows them on a Next.js dashboard. Alongside them it shows NEA's weather forecasts, a model PM2.5 forecast ([Open-Meteo](https://open-meteo.com), CAMS), satellite fire hotspots in Sumatra and Borneo ([NASA FIRMS](https://firms.modaps.eosdis.nasa.gov)), and recent haze headlines (Google News).

## Quick start

```bash
cp .env.example .env   # then set POSTGRES_PASSWORD and the matching password in DATABASE_URL
npm install
npm run db:up     # Postgres 17 in Docker, listening on 127.0.0.1:5432 only
npm run dev       # http://localhost:3000
```

When the server starts, it runs the migrations. If the database is empty, it backfills `BACKFILL_DAYS_ON_EMPTY` days (7 by default). After that it polls NEA every `INGEST_INTERVAL_MINUTES` (15 by default).

## Scripts

| Command | What it does |
|---|---|
| `npm run db:up` / `db:down` | Start / stop the Postgres container (data persists in the `hazelite-pgdata` volume) |
| `npm run db:migrate` | Apply `db/migrations/*.sql` |
| `npm run ingest` | Fetch today and yesterday from NEA |
| `npm run backfill -- 30` | Fetch the last N days |

## API

- `GET /api/readings?range=24h|3d|7d|30d|3m`: the latest reading for each region plus the series
- `POST /api/push` (same-origin JSON: a PushSubscription plus `region`, `level`, `profile`) subscribes to alerts; `DELETE /api/push` with `{ endpoint }` unsubscribes. Endpoints must belong to a known push service.
- `POST /api/release` (bearer `CRON_SECRET` or `INGEST_TOKEN`) with `{ version, summary }`: announces a new version to update subscribers, once per version.
- `GET` or `POST /api/ingest`: triggers a refresh right away. It requires `Authorization: Bearer <CRON_SECRET or INGEST_TOKEN>`. With neither set, the endpoint rejects every request.

## Deploying (free: Vercel Hobby + Neon)

Production runs on Vercel's free Hobby plan with a Neon free Postgres. Vercel functions run in `pdx1` (Portland), next to the Neon database in AWS us-west-2 (Oregon).

A serverless host has no always-on process, so instead of the background poller used locally:
- **Page visits** refresh the data after the response is sent (`after()`), at most once every 30 minutes (`src/lib/refresh.ts`).
- **An hourly GitHub Actions workflow** (`.github/workflows/refresh.yml`) POSTs to `/api/ingest` with `INGEST_TOKEN`, so data stays current without visitors.
- **A daily Vercel Cron** (`vercel.json`) calls `/api/ingest` as a backstop. Hobby cron jobs can run at most once a day.
- **Supplementary feeds** (forecasts, hotspots, news) each refresh on their own schedule, from 30 minutes to 3 hours (`src/lib/feeds.ts`). A database claim makes sure only one instance fetches each feed.
- **Migrations** run during the build (`npm run vercel-build`). Preview builds without `DATABASE_URL` skip them.

Setup:
1. **Neon.** Create a project in *AWS US West 2 (Oregon)* and set compute to 0.25 CU. Copy the **direct** connection string (pooling off: the migration lock needs a session) and use `sslmode=verify-full`.
2. **Vercel.** Import the GitHub repo. Set `DATABASE_URL`, `CRON_SECRET` and `INGEST_TOKEN` (for example `openssl rand -hex 32`) for Production. `FIRMS_MAP_KEY` turns on the fire-hotspot card, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (`npx web-push generate-vapid-keys`) turn on alerts, and `DATA_GOV_SG_API_KEY` is optional.
3. **GitHub.** Add the same `INGEST_TOKEN` as an Actions secret for the hourly refresh. GitHub pauses scheduled workflows in public repos after 60 days without commits; re-enable it from the Actions tab.
4. **Push to `main`.** Vercel builds, migrates and deploys. Pushes to other branches become previews.

To copy local history into an empty Neon database instead of re-fetching it:

```bash
docker exec hazelite-db pg_dump -U hazelite --no-owner --no-privileges hazelite |
  docker exec -i hazelite-db psql "<neon DATABASE_URL>&sslrootcert=system"
```

`sslrootcert=system` lets `psql` verify Neon's certificate against the system CA store.

Free-tier limits: Neon gives 100 CU-hours and 0.5 GB a month and suspends after 5 idle minutes. Vercel Hobby is for personal, non-commercial use.

## Layout

```
db/migrations/          SQL schema (readings, ingest_runs, wind, feeds, push_subscriptions)
scripts/cli.ts          migrate / ingest / backfill CLI
vercel.json             function region and the daily cron
src/instrumentation.ts  starts the background poller on long-running servers (not on Vercel)
src/lib/refresh.ts      refresh-on-visit for serverless hosts
src/lib/schema.ts       regions and the table of measures: API key ↔ DB column ↔ field
src/lib/nea.ts          data.gov.sg client (PSI, PM2.5, wind, weather forecasts)
src/lib/feeds.ts        supplementary sources, each stored as a snapshot and refreshed on its own schedule
src/lib/forecast.ts     Open-Meteo PM2.5 forecast
src/lib/fires.ts        NASA FIRMS hotspots, counted per fire region
src/lib/news.ts         Google News RSS headlines
src/lib/dashboard.ts    loads everything the dashboard shows
src/lib/push.ts         Web Push: subscription validation, storage and sending
src/lib/alerts.ts       when to alert, clear or stay quiet, per subscriber
src/lib/ingest.ts       upserts into Postgres (one run at a time)
src/lib/queries.ts      dashboard queries
src/lib/summary.ts      derived figures (ranges, worst region, driving pollutant)
src/lib/wind.ts         station wind → islandwide and per-region averages
src/lib/geo.ts          region locations, nearest region to a point
src/lib/bands.ts        NEA PSI / PM2.5 and US EPA AQI bands, chart thresholds, health advisories
src/app/page.tsx        dashboard
src/components/         chart, region map, mascot, cards, pollutant table, page shell; tabs, dialogs,
                        popovers and toggles use Radix UI primitives, tab swiping uses Embla Carousel
.github/workflows/      hourly production refresh; release announcements
src/assets/mascots/     mascot artwork
```

## Features

- **Region explorer.** Tiles for NEA's five regions. Selecting one updates the mascot and shows that area's wind: direction, speed, and a note when south-westerly winds can bring smoke from Sumatra. Wind comes from NEA's 17 weather stations, averaged for each region.
- **Can I go out?** NEA's official 1-hr PM2.5 guide for the next hour, for the general public or vulnerable people. It uses your area, which you can pick, or detect with "Use my location" (the pin beside the metric toggle on the region map). Your choices are saved in the browser.
- **Outlook.** NEA's forecast for the next 2 hours (flagging areas with haze, which also shows on the region tiles), the next 24 hours and the next 4 days. Each is paired with the model's PM2.5 forecast. "Can I go out?" also gives tomorrow's daytime guidance from it.
- **Where the smoke comes from.** Daily fire hotspots in Sumatra and Borneo from NASA's VIIRS satellite (NOAA-20), compared with the previous days, and whether the current wind blows from either region.
- **In the news.** The week's headlines about Singapore's haze situation: they must be about air quality and name Singapore (or its PSI), or come from NEA.
- **Haze alerts.** The bell in the header subscribes this browser to push notifications for an area: one when its 1-hr AQI reaches the level you pick (Unhealthy 151+, Very unhealthy 201+ or Hazardous 301+), with US EPA advice, again if it gets worse, and one when it clears. Alerts are checked after every refresh (hourly), with a 2-hour cooldown so a reading hovering on a boundary doesn't spam. Subscribers can also opt in to a notification when a new version goes live: `.github/workflows/announce.yml` runs when Vercel reports a successful production deployment and calls `POST /api/release` (bearer `INGEST_TOKEN`), which announces each version once. Notices are meant to be fun: a playful title, and the commit's `Release-Note:` trailer as the message (or a cheerful default). Write that trailer for people, not developers, for example `Release-Note: The dragon now does a happy hop while your air check loads! 🐉`. On iPhone and iPad, alerts work only in the installed app (iOS 16.4+). The server stores only the push address and the three choices (`src/lib/push.ts`, `src/lib/alerts.ts`).
- **Tabs.** Now, Forecast, Trends and News in a centred bar that sticks to the top while you scroll, so everything is a tap away instead of a long scroll. On touch screens, swipe left or right: the panels follow your finger and snap to the nearest tab (Embla Carousel), except when the swipe starts on the chart, a slider or a table that scrolls sideways. The active tab is kept in `?tab=`.
- **Trend chart** for 24 hours, 3, 7 or 30 days (hourly), and 3 months (daily maximum). It follows the **1-hr AQI / 1-hr PM2.5 / 24-hr PSI** toggle (1-hr AQI by default), which is shared with the region explorer. 1-hr AQI is the US EPA index (2024 breakpoints) computed from NEA's 1-hr PM2.5, since NEA publishes no AQI. The hourly AQI and PM2.5 charts continue with a dashed model forecast. Lines break where data is missing.
- **Installable app (PWA).** It can be added to the Home Screen with its own icon and opens full-screen. On iPhone, use Safari's Share → **Add to Home Screen**; the header's **Install** button shows these steps. On Android and desktop Chrome/Edge, the **Install** button opens the browser's prompt. When installed, it opens offline with the last reading it saved and says it's offline. The service worker is `public/sw.js`, the manifest is `src/app/manifest.ts`, and the icons are in `public/icons/` and `src/app/`.
- **Light/dark theme toggle.** It follows the OS setting until you choose, and remembers your choice.

Click a region tile and the dragon mascot's expression changes to match that region's band for the metric shown (1-hr AQI, 1-hr PM2.5 or 24-hr PSI): happy, then calm, worried, masked, and finally masked and struggling. Click the same tile again to go back to the islandwide (worst-region) view. Tap the dragon for tips, or press play to replay the last 72 hours.

Unauthenticated data.gov.sg requests are rate-limited. For large backfills, set `DATA_GOV_SG_API_KEY`.
