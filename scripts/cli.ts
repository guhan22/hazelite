// Usage: tsx scripts/cli.ts migrate | ingest | backfill [days]
import { migrate, pool } from "../src/lib/db";
import { backfill, ingestRecent } from "../src/lib/ingest";

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case "migrate": {
      // Preview builds may have no database configured; don't fail their build over it.
      if (arg === "--if-configured" && !process.env.DATABASE_URL) {
        console.log("DATABASE_URL not set; skipping migrations.");
        break;
      }
      const applied = await migrate();
      console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Up to date.");
      break;
    }
    case "ingest":
      await migrate();
      console.log(`Upserted ${await ingestRecent()} rows.`);
      break;
    case "backfill": {
      const days = Number(arg ?? 30);
      if (!Number.isInteger(days) || days < 1) throw new Error("days must be a positive integer");
      await migrate();
      console.log(`Upserted ${await backfill(days)} rows over ${days} days.`);
      break;
    }
    default:
      console.error("Usage: tsx scripts/cli.ts migrate | ingest | backfill [days]");
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
