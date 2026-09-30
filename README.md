# Hazelite

A Singapore haze monitor. It pulls hourly 24-hr PSI, 1-hr PM2.5, and pollutant readings for NEA's five regions from [data.gov.sg](https://data.gov.sg), stores them in Postgres, and shows them on a Next.js dashboard.

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
- `GET` or `POST /api/ingest`: triggers a refresh right away. It requires `Authorization: Bearer <CRON_SECRET or INGEST_TOKEN>`. With neither set, the endpoint rejects every request.

## Deploying (free: Vercel Hobby + Neon)

Production runs on Vercel's free Hobby plan with a Neon free Postgres. Vercel functions run in `pdx1` (Portland), next to the Neon database in AWS us-west-2 (Oregon).

A serverless host has no always-on process, so instead of the background poller used locally:
- **Page visits** refresh the data after the response is sent (`after()`), at most once every 30 minutes (`src/lib/refresh.ts`).
- **A daily Vercel Cron** (`vercel.json`) calls `/api/ingest` as a backstop for days with no visitors. Hobby cron jobs can run at most once a day.
- **Migrations** run during the build (`npm run vercel-build`). Preview builds without `DATABASE_URL` skip them.

Setup:
1. **Neon.** Create a project in *AWS US West 2 (Oregon)* and set compute to 0.25 CU. Copy the **direct** connection string (pooling off: the migration lock needs a session) and use `sslmode=verify-full`.
2. **Vercel.** Import the GitHub repo. Set `DATABASE_URL` and `CRON_SECRET` (for example `openssl rand -hex 32`) for Production. `DATA_GOV_SG_API_KEY` is optional.
3. **Push to `main`.** Vercel builds, migrates and deploys. Pushes to other branches become previews.

To copy local history into an empty Neon database instead of re-fetching it:

```bash
docker exec hazelite-db pg_dump -U hazelite --no-owner --no-privileges hazelite |
  docker exec -i hazelite-db psql "<neon DATABASE_URL>&sslrootcert=system"
```

`sslrootcert=system` lets `psql` verify Neon's certificate against the system CA store.

Free-tier limits: Neon gives 100 CU-hours and 0.5 GB a month and suspends after 5 idle minutes. Vercel Hobby is for personal, non-commercial use.

## Layout

```
db/migrations/          SQL schema (readings, ingest_runs, wind_stations, wind_readings)
scripts/cli.ts          migrate / ingest / backfill CLI
vercel.json             function region and the daily cron
src/instrumentation.ts  starts the background poller on long-running servers (not on Vercel)
src/lib/refresh.ts      refresh-on-visit for serverless hosts
src/lib/schema.ts       regions and the table of measures: API key ↔ DB column ↔ field
src/lib/nea.ts          data.gov.sg client (PSI + PM2.5 endpoints)
src/lib/ingest.ts       upserts into Postgres (one run at a time)
src/lib/queries.ts      dashboard queries
src/lib/summary.ts      derived figures (ranges, worst region, driving pollutant)
src/lib/wind.ts         station wind → islandwide and per-region averages
src/lib/geo.ts          region locations, nearest region to a point
src/lib/bands.ts        NEA PSI / PM2.5 bands, chart thresholds, health advisories
src/app/page.tsx        dashboard
src/components/         chart, region map, mascot, pollutant table, page shell
src/assets/mascots/     mascot artwork
```

## Features

- **Region explorer.** Tiles for NEA's five regions. Selecting one updates the mascot and shows that area's wind: direction, speed, and a note when south-westerly winds can bring smoke from Sumatra. Wind comes from NEA's 17 weather stations, averaged for each region.
- **Can I go out?** NEA's official 1-hr PM2.5 guide for the next hour, for the general public or vulnerable people. It uses your area, which you can pick or detect with "Use my location". Your choices are saved in the browser.
- **How today compares.** Where today's PSI ranks among the past year's hours, when it was last this high, and the reading a year ago. It shows how complete the stored history is. Load the full year with `npm run backfill -- 365`.
- **Trend chart** for 24 hours, 3, 7 or 30 days (hourly), and 3 months (daily maximum). It follows the **Now / 24-hr PSI** toggle (1-hr PM2.5 by default), which is shared with the region explorer. Lines break where data is missing.
- **Installable app (PWA).** It can be added to the Home Screen with its own icon and opens full-screen. On iPhone, use Safari's Share → **Add to Home Screen**; the header's **Install** button shows these steps. On Android and desktop Chrome/Edge, the **Install** button opens the browser's prompt. When installed, it opens offline with the last reading it saved and says it's offline. The service worker is `public/sw.js`, the manifest is `src/app/manifest.ts`, and the icons are in `public/icons/` and `src/app/`.
- **Light/dark theme toggle.** It follows the OS setting until you choose, and remembers your choice.

Click a region tile and the dragon-playground mascot's expression changes to match that region's 24-hr PSI band: happy, then calm, worried, masked, and finally masked and struggling. Click the same tile again to go back to the islandwide (worst-region) view.

Unauthenticated data.gov.sg requests are rate-limited. For large backfills, set `DATA_GOV_SG_API_KEY`.
