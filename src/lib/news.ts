import { fetchOk, httpsUrl } from "./http";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

const FEED = "https://news.google.com/rss/search?q=haze+singapore+when:7d&hl=en-SG&gl=SG&ceid=SG:en";
const MAX_ITEMS = 8;
// Google matches "haze" anywhere in the article, so headlines must themselves be about air quality...
const AIR = /\b(haze|hazy|smog|smoke|psi|pm2\.?5|air quality|hotspots?|(wild|forest )?fires?)\b/i;
// ...and about Singapore: named in the headline, or its PSI (Malaysia reports an API instead), or from NEA.
const SINGAPORE = /\b(singapore(ans?)?|s[’']pore(ans?)?|psi)\b/i;
const SINGAPORE_SOURCES = /national environment agency|\bnea\b/i;

/** Whether a headline is about Singapore's haze situation (not the region's in general). */
export const aboutSingaporeHaze = ({ title, source }: Pick<NewsItem, "title" | "source">) =>
  AIR.test(title) && (SINGAPORE.test(title) || SINGAPORE_SOURCES.test(source));

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string) {
  return s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .trim();
}

/**
 * Pulls title, link, source and date out of a Google News RSS feed. The feed's shape is simple and
 * fixed, so a tag match is enough; everything is length-capped and links must be https.
 */
export function parseRss(xml: string): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const tag = (name: string) => decode(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? "");
    const source = tag("source").slice(0, 80);
    // Google appends " - Source" to every headline.
    const full = tag("title");
    const title = (source && full.endsWith(` - ${source}`) ? full.slice(0, -source.length - 3) : full).slice(0, 200);
    const url = httpsUrl(tag("link"));
    const published = Date.parse(tag("pubDate"));
    const key = title.toLowerCase();
    if (!aboutSingaporeHaze({ title, source }) || !url || Number.isNaN(published) || seen.has(key)) return [];
    seen.add(key);
    return [{ title, url, source: source || new URL(url).hostname, publishedAt: new Date(published).toISOString() }];
  });
}

/** The newest haze headlines from the past week. */
export async function fetchNews(): Promise<NewsItem[]> {
  const items = parseRss(await (await fetchOk(FEED)).text());
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_ITEMS);
}
