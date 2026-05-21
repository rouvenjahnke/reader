import Fuse from 'fuse.js';

import type { ArticleFilters, ArticleSummary, ReaderStatus } from '@/types/article';

const defaultStatuses: ReaderStatus[] = ['unrated'];

export const defaultFilters: ArticleFilters = {
  sortMode: 'newest',
  statuses: defaultStatuses,
  sources: [],
  query: '',
  priorityOnly: false
};

export function filterAndSortArticles(articles: ArticleSummary[], filters: ArticleFilters): ArticleSummary[] {
  const activeStatuses = filters.statuses.length > 0 ? filters.statuses : defaultStatuses;
  const activeSources = new Set(filters.sources);

  let result = articles.filter((article) => {
    const status = article.frontmatter.reader_status ?? 'unrated';
    if (!activeStatuses.includes(status)) return false;
    if (activeSources.size > 0 && !activeSources.has(article.frontmatter.source ?? '')) return false;
    if (filters.priorityOnly && priorityValue(article) <= 0) return false;
    return true;
  });

  const query = filters.query.trim();
  if (query) {
    const fuse = new Fuse(result, {
      threshold: 0.35,
      ignoreLocation: true,
      keys: ['frontmatter.title', 'frontmatter.author', 'frontmatter.tags']
    });
    result = fuse.search(query).map((entry) => entry.item);
  }

  return [...result].sort((a, b) => {
    const priorityDelta = priorityValue(b) - priorityValue(a);
    if (priorityDelta !== 0) return priorityDelta;

    if (filters.sortMode === 'score') {
      const scoreDelta = (b.frontmatter.score ?? 0) - (a.frontmatter.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
    }

    return dateValue(b.frontmatter.published ?? b.frontmatter.fetched ?? b.lastModified) - dateValue(a.frontmatter.published ?? a.frontmatter.fetched ?? a.lastModified);
  });
}

export function collectSources(articles: ArticleSummary[]): string[] {
  return Array.from(new Set(articles.map((article) => article.frontmatter.source).filter((source): source is string => Boolean(source)))).sort((a, b) =>
    a.localeCompare(b, 'de')
  );
}

export function nextUnratedAfter(articles: ArticleSummary[], currentId: string): ArticleSummary | undefined {
  const start = Math.max(0, articles.findIndex((article) => article.id === currentId));
  const rotated = [...articles.slice(start + 1), ...articles.slice(0, start + 1)];
  return rotated.find((article) => (article.frontmatter.reader_status ?? 'unrated') === 'unrated');
}

export function priorityValue(article: ArticleSummary): number {
  if (typeof article.frontmatter.reader_priority === 'number') return article.frontmatter.reader_priority;
  if (article.frontmatter.reader_pinned === true) return 100;
  return 0;
}

function dateValue(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
