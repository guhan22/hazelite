import { getFeeds } from "@/lib/feeds";

export const dynamic = "force-dynamic";

/** The haze map's layers, fetched by the Map tab when it's first opened (kept out of the page itself). */
export async function GET() {
  const { regional, fireMap } = await getFeeds(["regional", "fireMap"]);
  // Feeds refresh every few hours, so a few minutes of caching costs nothing.
  return Response.json({ weather: regional, fires: fireMap }, { headers: { "Cache-Control": "public, max-age=300" } });
}
