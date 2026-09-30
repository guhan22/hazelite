import { fmtDateTime } from "@/lib/format";
import type { NewsItem } from "@/lib/news";
import { Card } from "./card";

/** The week's haze headlines. */
export function NewsCard({ items }: { items: NewsItem[] | null }) {
  return (
    <Card title="In the news" subtitle="Haze headlines from the past week, via Google News">
      {items?.length ? (
        <ul className="-mx-5 divide-y divide-border border-t border-border">
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
      ) : (
        <p className="text-sm text-ink-2">No haze stories this week.</p>
      )}
      <p className="mt-2 text-xs text-muted">Links open the publisher&apos;s site.</p>
    </Card>
  );
}
