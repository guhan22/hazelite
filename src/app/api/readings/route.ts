import { getLatest, getSeries, parseRange, RANGES } from "@/lib/queries";
import { publicJson } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  const [latest, series] = await Promise.all([getLatest(), getSeries(RANGES[range].hours, RANGES[range].bucket)]);
  return publicJson({ range, latest, series });
}
