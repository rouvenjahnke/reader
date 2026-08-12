import Fuse from 'fuse.js';

import type { ArticleFilters, ArticleSummary, PapersVisibility, ReaderStatus } from '@/types/article';

const defaultStatuses: ReaderStatus[] = ['unrated'];

/** Source name behind the "Galois" quick filter chip. */
export const PRIORITY_SOURCE = 'galois';

export const defaultFilters: ArticleFilters = {
  sortMode: 'newest',
  statuses: defaultStatuses,
  sources: [],
  tags: [],
  folders: [],
  query: '',
  galoisOnly: false,
  newTodayOnly: false,
  showDuplicates: false
};

export interface SortPreferences {
  pinPriorityOnTop?: boolean;
}

const DAY_MS = 86_400_000;
const PINNED_FILTER_OPTIONS = ['mathematics', 'machine learning'];

export function filterAndSortArticles(articles: ArticleSummary[], filters: ArticleFilters, prefs: SortPreferences = {}): ArticleSummary[] {
  const activeStatuses = filters.statuses.length > 0 ? filters.statuses : defaultStatuses;
  const activeSources = new Set(filters.sources);
  const activeTags = new Set(filters.tags ?? []);
  const activeFolders = new Set(filters.folders ?? []);
  const pinPriority = prefs.pinPriorityOnTop ?? true;
  const newCutoff = Date.now() - DAY_MS;

  let result = articles.filter((article) => {
    const status = article.frontmatter.reader_status ?? 'unrated';
    if (!activeStatuses.includes(status)) return false;
    if (activeSources.size > 0 && !activeSources.has(article.frontmatter.source ?? '')) return false;
    if (activeTags.size > 0 && !(article.frontmatter.tags ?? []).some((tag) => activeTags.has(tag))) return false;
    if (activeFolders.size > 0 && !activeFolders.has(article.pipelineFolder ?? '')) return false;
    if (filters.galoisOnly && !isGalois(article)) return false;
    if (filters.newTodayOnly && !isNewSince(article, newCutoff)) return false;
    return true;
  });

  const query = filters.query.trim();
  if (query) {
    const fuse = new Fuse(result, {
      threshold: 0.35,
      ignoreLocation: true,
      keys: ['frontmatter.title', 'frontmatter.author', 'frontmatter.source', 'frontmatter.tags', 'pipelineFolder', 'pipelineRelativePath', 'path']
    });
    result = fuse.search(query).map((entry) => entry.item);
  }

  return [...result].sort((a, b) => {
    if (pinPriority) {
      const priorityDelta = priorityValue(b) - priorityValue(a);
      if (priorityDelta !== 0) return priorityDelta;
    }

    if (filters.sortMode === 'score') {
      const scoreDelta = (b.frontmatter.score ?? 0) - (a.frontmatter.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
    }

    const addedDelta = addedDateValue(b) - addedDateValue(a);
    if (addedDelta !== 0) return addedDelta;

    return publishedDateValue(b) - publishedDateValue(a);
  });
}

/**
 * Restrict the article set according to the papers-folder preference. Applied
 * before dedup/filtering in every view so 'hidden' papers exist nowhere.
 */
export function applyPapersVisibility(articles: ArticleSummary[], visibility: PapersVisibility): ArticleSummary[] {
  if (visibility === 'only') return articles.filter((article) => article.collection === 'papers');
  if (visibility === 'hidden') return articles.filter((article) => article.collection !== 'papers');
  return articles;
}

export function collectSources(articles: ArticleSummary[]): string[] {
  return Array.from(new Set(articles.map((article) => article.frontmatter.source).filter((source): source is string => Boolean(source)))).sort(
    compareFilterOption
  );
}

export function collectTags(articles: ArticleSummary[]): string[] {
  return Array.from(new Set(articles.flatMap((article) => article.frontmatter.tags ?? []).filter((tag) => tag.trim().length > 0))).sort(
    compareFilterOption
  );
}

export function collectFolders(articles: ArticleSummary[]): string[] {
  return Array.from(new Set(articles.map((article) => article.pipelineFolder).filter((folder): folder is string => Boolean(folder)))).sort(
    compareFilterOption
  );
}

function compareFilterOption(a: string, b: string): number {
  const pinnedDelta = pinnedFilterRank(a) - pinnedFilterRank(b);
  if (pinnedDelta !== 0) return pinnedDelta;
  return a.localeCompare(b, 'de');
}

function pinnedFilterRank(value: string): number {
  const normalized = normalizeFilterOption(value);
  const index = PINNED_FILTER_OPTIONS.indexOf(normalized);
  return index === -1 ? PINNED_FILTER_OPTIONS.length : index;
}

function normalizeFilterOption(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

export function nextUnratedAfter(articles: ArticleSummary[], currentId: string): ArticleSummary | undefined {
  const start = Math.max(0, articles.findIndex((article) => article.id === currentId));
  const rotated = [...articles.slice(start + 1), ...articles.slice(0, start + 1)];
  return rotated.find((article) => (article.frontmatter.reader_status ?? 'unrated') === 'unrated');
}

/**
 * Priority applies to every source: the categorization workflow decides which
 * articles carry `reader_priority` / `reader_pinned`, not the app.
 */
export function priorityValue(article: ArticleSummary): number {
  if (typeof article.frontmatter.reader_priority === 'number') return article.frontmatter.reader_priority;
  if (article.frontmatter.reader_pinned === true) return 100;
  return 0;
}

export function isGalois(article: ArticleSummary): boolean {
  return normalizeSourceName(article.frontmatter.source) === PRIORITY_SOURCE;
}

function normalizeSourceName(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).toLowerCase();
  return '';
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

function addedDateValue(article: ArticleSummary): number {
  return dateValue(article.firstSeenAt ?? article.frontmatter.fetched ?? article.lastModified ?? article.frontmatter.published);
}

function publishedDateValue(article: ArticleSummary): number {
  return dateValue(article.frontmatter.published ?? article.frontmatter.fetched ?? article.lastModified);
}

// ─── Deduplication ────────────────────────────────────────────────────────────

interface DedupResult {
  visible: ArticleSummary[];
  duplicateCount: number;
}

interface DedupBucket {
  firstIndex: number;
  articles: ArticleSummary[];
}

interface DedupUnit {
  firstIndex: number;
  articles: ArticleSummary[];
  duplicateCount: number;
}

/**
 * Group articles whose identity (arxiv_id → URL → title+source) matches, pick the
 * "best" survivor, and attach the rest as `duplicates` to the survivor. When
 * `showDuplicates` is true, losers are also kept in the visible list so the user
 * can inspect them directly.
 */
export function dedupeArticles(articles: ArticleSummary[], options: { showDuplicates?: boolean } = {}): DedupResult {
  const groups = new Map<string, DedupBucket>();
  const units: DedupUnit[] = [];

  for (let index = 0; index < articles.length; index += 1) {
    const article = articles[index];
    const key = dedupKey(article);
    if (!key) {
      units.push({ firstIndex: index, articles: [article], duplicateCount: 0 });
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.articles.push(article);
    else groups.set(key, { firstIndex: index, articles: [article] });
  }

  for (const bucket of groups.values()) {
    if (bucket.articles.length === 1) {
      units.push({ firstIndex: bucket.firstIndex, articles: [bucket.articles[0]], duplicateCount: 0 });
      continue;
    }
    const sorted = [...bucket.articles].sort(compareForDedup);
    const winner = sorted[0];
    const losers = sorted.slice(1);
    units.push({
      firstIndex: bucket.firstIndex,
      articles: options.showDuplicates ? [{ ...winner, duplicates: losers }, ...losers] : [{ ...winner, duplicates: losers }],
      duplicateCount: losers.length
    });
  }

  units.sort((a, b) => a.firstIndex - b.firstIndex);
  return {
    visible: units.flatMap((unit) => unit.articles),
    duplicateCount: units.reduce((sum, unit) => sum + unit.duplicateCount, 0)
  };
}

function compareForDedup(a: ArticleSummary, b: ArticleSummary): number {
  const ratingDelta = ratingWeight(b.frontmatter.reader_status) - ratingWeight(a.frontmatter.reader_status);
  if (ratingDelta !== 0) return ratingDelta;

  const dateDelta =
    publishedDateValue(b) - publishedDateValue(a);
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
  const arxiv = asNonEmptyString(fm.arxiv_id);
  if (arxiv) return `arxiv:${normalizeArxiv(arxiv)}`;
  const url = asNonEmptyString(fm.url);
  if (url) return `url:${normalizeUrl(url)}`;
  const titleKey = normalizeTitle(asNonEmptyString(fm.title) ?? '');
  const sourceKey = normalizeSourceName(fm.source);
  if (titleKey.length >= 8) return `title:${sourceKey}|${titleKey}`;
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
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
