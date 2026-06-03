import Fuse from 'fuse.js';

import type { ArticleFilters, ArticleSummary, ReaderStatus } from '@/types/article';

const defaultStatuses: ReaderStatus[] = ['unrated'];

/** The single source whose reader_priority/reader_pinned still bubbles to the top. */
export const PRIORITY_SOURCE = 'galois';

export const defaultFilters: ArticleFilters = {
  sortMode: 'newest',
  statuses: defaultStatuses,
  sources: [],
  tags: [],
  query: '',
  galoisOnly: false,
  newTodayOnly: false,
  showDuplicates: false
};

export interface SortPreferences {
  pinGaloisOnTop?: boolean;
}

const DAY_MS = 86_400_000;

export function filterAndSortArticles(articles: ArticleSummary[], filters: ArticleFilters, prefs: SortPreferences = {}): ArticleSummary[] {
  const activeStatuses = filters.statuses.length > 0 ? filters.statuses : defaultStatuses;
  const activeSources = new Set(filters.sources);
  const activeTags = new Set(filters.tags ?? []);
  const pinGalois = prefs.pinGaloisOnTop ?? true;
  const newCutoff = Date.now() - DAY_MS;

  let result = articles.filter((article) => {
    const status = article.frontmatter.reader_status ?? 'unrated';
    if (!activeStatuses.includes(status)) return false;
    if (activeSources.size > 0 && !activeSources.has(article.frontmatter.source ?? '')) return false;
    if (activeTags.size > 0 && !(article.frontmatter.tags ?? []).some((tag) => activeTags.has(tag))) return false;
    if (filters.galoisOnly && !isGalois(article)) return false;
    if (filters.newTodayOnly && !isNewSince(article, newCutoff)) return false;
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
    if (pinGalois) {
      const priorityDelta = priorityValue(b) - priorityValue(a);
      if (priorityDelta !== 0) return priorityDelta;
    }

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

export function collectTags(articles: ArticleSummary[]): string[] {
  return Array.from(new Set(articles.flatMap((article) => article.frontmatter.tags ?? []).filter((tag) => tag.trim().length > 0))).sort((a, b) =>
    a.localeCompare(b, 'de')
  );
}

export function nextUnratedAfter(articles: ArticleSummary[], currentId: string): ArticleSummary | undefined {
  const start = Math.max(0, articles.findIndex((article) => article.id === currentId));
  const rotated = [...articles.slice(start + 1), ...articles.slice(0, start + 1)];
  return rotated.find((article) => (article.frontmatter.reader_status ?? 'unrated') === 'unrated');
}

/**
 * Priority only applies to the configured `galois` source. Other sources always
 * return 0, regardless of any `reader_priority` / `reader_pinned` they may carry.
 */
export function priorityValue(article: ArticleSummary): number {
  if (!isGalois(article)) return 0;
  if (typeof article.frontmatter.reader_priority === 'number') return article.frontmatter.reader_priority;
  if (article.frontmatter.reader_pinned === true) return 100;
  return 0;
}

export function isGalois(article: ArticleSummary): boolean {
  return normalizeSourceName(article.frontmatter.source) === PRIORITY_SOURCE;
}

function normalizeSourceName(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function isNewSince(article: ArticleSummary, cutoffMs: number): boolean {
  const ts = article.firstSeenAt ? Date.parse(article.firstSeenAt) : NaN;
  if (Number.isFinite(ts)) return ts >= cutoffMs;
  const fallback = dateValue(article.frontmatter.fetched ?? article.frontmatter.published ?? article.lastModified);
  return fallback > 0 && fallback >= cutoffMs;
}

function dateValue(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

interface DedupResult {
  visible: ArticleSummary[];
  duplicateCount: number;
}

/**
 * Group articles whose identity (arxiv_id → URL → title+source) matches, pick the
 * "best" survivor, and attach the rest as `duplicates` to the survivor. When
 * `showDuplicates` is true, losers are also kept in the visible list so the user
 * can inspect them directly.
 */
export function dedupeArticles(articles: ArticleSummary[], options: { showDuplicates?: boolean } = {}): DedupResult {
  const groups = new Map<string, ArticleSummary[]>();
  const ungrouped: ArticleSummary[] = [];

  for (const article of articles) {
    const key = dedupKey(article);
    if (!key) {
      ungrouped.push(article);
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(article);
    else groups.set(key, [article]);
  }

  const winners: ArticleSummary[] = [];
  let duplicateCount = 0;

  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      winners.push(bucket[0]);
      continue;
    }
    const sorted = [...bucket].sort(compareForDedup);
    const winner = sorted[0];
    const losers = sorted.slice(1);
    duplicateCount += losers.length;
    winners.push({ ...winner, duplicates: losers });
  }

  if (options.showDuplicates) {
    const expanded: ArticleSummary[] = [];
    for (const winner of winners) {
      expanded.push(winner);
      for (const dup of winner.duplicates ?? []) expanded.push(dup);
    }
    return { visible: [...ungrouped, ...expanded], duplicateCount };
  }

  return { visible: [...ungrouped, ...winners], duplicateCount };
}

function compareForDedup(a: ArticleSummary, b: ArticleSummary): number {
  const ratingDelta = ratingWeight(b.frontmatter.reader_status) - ratingWeight(a.frontmatter.reader_status);
  if (ratingDelta !== 0) return ratingDelta;

  const dateDelta =
    dateValue(b.frontmatter.published ?? b.frontmatter.fetched ?? b.lastModified) -
    dateValue(a.frontmatter.published ?? a.frontmatter.fetched ?? a.lastModified);
  if (dateDelta !== 0) return dateDelta;

  const scoreDelta = (b.frontmatter.score ?? 0) - (a.frontmatter.score ?? 0);
  if (scoreDelta !== 0) return scoreDelta;

  return (a.path?.length ?? 0) - (b.path?.length ?? 0);
}

function ratingWeight(status: ReaderStatus | undefined): number {
  switch (status) {
    case 'high_relevant':
      return 3;
    case 'relevant':
      return 2;
    case 'unrated':
    case undefined:
      return 1;
    case 'irrelevant':
      return 0;
    default:
      return 0;
  }
}

function dedupKey(article: ArticleSummary): string | null {
  const fm = article.frontmatter;
  if (fm.arxiv_id && fm.arxiv_id.trim()) return `arxiv:${normalizeArxiv(fm.arxiv_id)}`;
  if (fm.url && fm.url.trim()) return `url:${normalizeUrl(fm.url)}`;
  const titleKey = normalizeTitle(fm.title);
  const sourceKey = normalizeSourceName(fm.source);
  if (titleKey.length >= 8) return `title:${sourceKey}|${titleKey}`;
  return null;
}

function normalizeArxiv(value: string): string {
  return value.trim().toLowerCase().replace(/^arxiv:/, '').replace(/v\d+$/i, '');
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = '';
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'ref'];
    for (const key of drop) url.searchParams.delete(key);
    let path = url.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    return `${url.host.toLowerCase()}${path}${url.search ? `?${url.searchParams.toString()}` : ''}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9äöüß\s-]/gi, '');
}

// ─── Reading time ─────────────────────────────────────────────────────────────

const WORDS_PER_MINUTE = 220;

export function estimateReadingMinutes(body: string): number {
  if (!body) return 0;
  const words = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
