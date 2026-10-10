'use client';

import { CardCarousel } from '@/components/ui/card-carousel';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  formattedDate: string;
}

export function CompanyNewsCarouselInner({
  news,
  delayMs,
}: {
  news: NewsItem[];
  delayMs: number;
}) {
  const cardItems = news.map((item, i) => (
    <div
      key={item.id}
      style={{ animationDelay: `${delayMs + 120 + i * 60}ms` }}
      className="animate-fade-in-up flex flex-col gap-1 px-1"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{item.title}</span>
        <span className="shrink-0 text-xs text-au-muted">
          {item.formattedDate}
        </span>
      </div>
      <p className="line-clamp-4 text-sm whitespace-pre-wrap text-au-muted [overflow-wrap:anywhere]">{item.content}</p>
    </div>
  ));

  return <CardCarousel>{cardItems}</CardCarousel>;
}
