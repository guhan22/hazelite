import { fmtDateTime } from "@/lib/format";
import type { NewsItem } from "@/lib/news";

/** Recent haze headlines. Collapsed while the air is clean, when the news is least relevant. */
export function NewsCard({ items, open }: { items: NewsItem[] | null; open: boolean }) {
  if (!items?.length) return null;
  return (
    <details open={open} className="mt-6 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-5 py-3">
        <h2 className="inline text-base font-semibold">In the news</h2>
        <span className="ml-1.5 text-xs text-muted">· {items.length} haze stories this week</span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <li key={item.url} className="px-5 py-2.5">
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">
              {item.title}
            </a>
            <div className="text-xs text-muted">
              {item.source} · {fmtDateTime.format(new Date(item.publishedAt))}
            </div>
          </li>
        ))}
      </ul>
      <p className="px-5 pb-3 pt-1 text-xs text-muted">Headlines via Google News; links open the publisher&apos;s site.</p>
    </details>
  );
}
