import type { ArticleSummary, ReaderStatus } from '@/types/article';

export interface ReadingStats {
  ratedToday: number;
  ratedThisWeek: number;
  totalRated: number;
  bySource: Array<{ source: string; count: number }>;
  byStatus: Record<Exclude<ReaderStatus, 'unrated'>, number>;
  newToday: number;
}

const DAY_MS = 86_400_000;

export function computeReadingStats(articles: ArticleSummary[]): ReadingStats {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();
  const weekAgoMs = now - 7 * DAY_MS;

  let ratedToday = 0;
  let ratedThisWeek = 0;
  let totalRated = 0;
  let newToday = 0;
  const sources = new Map<string, number>();
  const byStatus: Record<Exclude<ReaderStatus, 'unrated'>, number> = {
    irrelevant: 0,
    relevant: 0,
    high_relevant: 0
  };

  for (const article of articles) {
    const status = article.frontmatter.reader_status;
    const ratedAt = article.frontmatter.reader_rated_at ? Date.parse(article.frontmatter.reader_rated_at) : NaN;

    if (status === 'relevant' || status === 'irrelevant' || status === 'high_relevant') {
      totalRated += 1;
      byStatus[status] += 1;
      if (Number.isFinite(ratedAt) && ratedAt >= startOfDayMs) ratedToday += 1;
      if (Number.isFinite(ratedAt) && ratedAt >= weekAgoMs) ratedThisWeek += 1;
      const sourceName = (article.frontmatter.source ?? 'unknown').trim() || 'unknown';
      sources.set(sourceName, (sources.get(sourceName) ?? 0) + 1);
    }

    const firstSeen = article.firstSeenAt ? Date.parse(article.firstSeenAt) : NaN;
    if (Number.isFinite(firstSeen) && firstSeen >= now - DAY_MS) newToday += 1;
  }

  const bySource = Array.from(sources.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return { ratedToday, ratedThisWeek, totalRated, bySource, byStatus, newToday };
}
