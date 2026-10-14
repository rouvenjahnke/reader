import type { ArticleSummary } from '@/types/article';

/** Publication time from article frontmatter. Fetch and file timestamps are intentionally ignored. */
export function publishedTimestamp(article: ArticleSummary): number | undefined {
  const value = article.frontmatter.published;
  if (!value) return undefined;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
