import type { ArticleSummary, ReaderStatus } from '@/types/article';

export interface ActivityDay {
  /** Local date key, YYYY-MM-DD. */
  date: string;
  count: number;
}

export interface ReadingStats {
  ratedToday: number;
  ratedThisWeek: number;
  totalRated: number;
  bySource: Array<{ source: string; count: number }>;
  byStatus: Record<Exclude<ReaderStatus, 'unrated'>, number>;
  newToday: number;
  /** Daily rating activity, oldest first, ending today. Full weeks for the heatmap. */
  activity: ActivityDay[];
  currentStreak: number;
  longestStreak: number;
}

const DAY_MS = 86_400_000;
/** 17 heatmap columns × 7 days. */
const ACTIVITY_DAYS = 119;

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
  const byDay = new Map<string, number>();
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
      if (Number.isFinite(ratedAt)) {
        const key = localDateKey(new Date(ratedAt));
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
      }
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

  const activity = buildActivity(byDay, startOfDay);
  const { currentStreak, longestStreak } = computeStreaks(byDay, startOfDay);

  return { ratedToday, ratedThisWeek, totalRated, bySource, byStatus, newToday, activity, currentStreak, longestStreak };
}

function buildActivity(byDay: Map<string, number>, today: Date): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset -= 1) {
    // Construct via Y/M/D arithmetic so DST shifts cannot skip or double a day.
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = localDateKey(date);
    days.push({ date: key, count: byDay.get(key) ?? 0 });
  }
  return days;
}

/**
 * Current streak counts consecutive active days ending today — or yesterday,
 * so an unbroken streak is not reported as 0 before today's first rating.
 */
function computeStreaks(byDay: Map<string, number>, today: Date): { currentStreak: number; longestStreak: number } {
  const dayAt = (offset: number): string =>
    localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset));

  let currentStreak = 0;
  const startOffset = (byDay.get(dayAt(0)) ?? 0) > 0 ? 0 : 1;
  for (let offset = startOffset; (byDay.get(dayAt(offset)) ?? 0) > 0; offset += 1) {
    currentStreak += 1;
  }

  // Longest streak over all recorded activity (not limited to the heatmap window).
  const activeDays = Array.from(byDay.entries())
    .filter(([, count]) => count > 0)
    .map(([key]) => key)
    .sort();
  let longestStreak = 0;
  let run = 0;
  let previous: number | null = null;
  for (const key of activeDays) {
    const [year, month, day] = key.split('-').map(Number);
    const time = new Date(year, month - 1, day).getTime();
    run = previous !== null && Math.round((time - previous) / DAY_MS) === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    previous = time;
  }

  return { currentStreak, longestStreak };
}
