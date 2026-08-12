'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';

import { ArticleListItem } from '@/components/ArticleListItem';
import { FilterBar, type FilterBarMeta } from '@/components/FilterBar';
import { flushPendingQueues, getAllCachedBodies, pendingQueueDepth } from '@/lib/cache';
import { applyPapersVisibility, dedupeArticles, filterAndSortArticles } from '@/lib/filters';
import { prefetchArticleBodies, type PrefetchProgress } from '@/lib/prefetch';
import { fetchArticleSummaries, loadCachedSummaries } from '@/lib/sync';
import { useArticleStore } from '@/stores/useArticleStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import type { ArticleSummary } from '@/types/article';

const LIST_ITEM_SIZE = 122;

export default function HomePage(): React.ReactElement {
  const router = useRouter();
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const hydrated = useArticleStore((state) => state.hydrated);
  const sessionNewIds = useArticleStore((state) => state.sessionNewIds);
  const setArticles = useArticleStore((state) => state.setArticles);
  const hydrateArticles = useArticleStore((state) => state.hydrateArticles);
  const noteSessionNew = useArticleStore((state) => state.noteSessionNew);
  const lastArticleId = useArticleStore((state) => state.lastArticleId);
  const pinPriorityOnTop = usePreferencesStore((state) => state.pinPriorityOnTop);
  const papersVisibility = usePreferencesStore((state) => state.papersVisibility);
  const autoSyncOnOpen = usePreferencesStore((state) => state.autoSyncOnOpen);
  const bodyPrefetch = usePreferencesStore((state) => state.bodyPrefetch);
  const syncIntervalMinutes = usePreferencesStore((state) => state.syncIntervalMinutes);
  const showContinueReading = usePreferencesStore((state) => state.showContinueReading);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined);
  const [prefetch, setPrefetch] = useState<{ done: number; total: number } | undefined>(undefined);
  const [pendingCount, setPendingCount] = useState(0);
  const [bodyMatches, setBodyMatches] = useState<Set<string>>(new Set());
  const [height, setHeight] = useState(520);
  const listHostRef = useRef<HTMLDivElement>(null);
  const prefetchRef = useRef<{ cancel: () => void } | null>(null);
  const lastRefreshRef = useRef<number>(0);

  const sessionNewSet = useMemo(() => new Set(sessionNewIds), [sessionNewIds]);

  const visibleArticles = useMemo(() => applyPapersVisibility(articles, papersVisibility), [articles, papersVisibility]);

  const scopedFilters = useMemo(() => ({ ...filters, query: '' }), [filters]);

  const scopedArticles = useMemo(
    () => filterAndSortArticles(visibleArticles, scopedFilters, { pinPriorityOnTop }),
    [visibleArticles, scopedFilters, pinPriorityOnTop]
  );

  const dedup = useMemo(
    () => dedupeArticles(scopedArticles, { showDuplicates: filters.showDuplicates }),
    [scopedArticles, filters.showDuplicates]
  );

  const filteredSummaries = useMemo(
    () => filterAndSortArticles(dedup.visible, filters, { pinPriorityOnTop }),
    [dedup.visible, filters, pinPriorityOnTop]
  );

  // If the query matches body content but no frontmatter hit, inject those entries.
  const filtered = useMemo<ArticleSummary[]>(() => {
    const query = filters.query.trim();
    if (!query || bodyMatches.size === 0) return filteredSummaries;
    const present = new Set(filteredSummaries.map((article) => article.id));
    const extras = dedup.visible.filter((article) => bodyMatches.has(article.id) && !present.has(article.id));
    if (extras.length === 0) return filteredSummaries;
    return [...filteredSummaries, ...extras];
  }, [filteredSummaries, dedup.visible, bodyMatches, filters.query]);

  const lastArticle = useMemo(() => articles.find((article) => article.id === lastArticleId), [articles, lastArticleId]);

  const unratedCount = useMemo(
    () => visibleArticles.filter((article) => (article.frontmatter.reader_status ?? 'unrated') === 'unrated').length,
    [visibleArticles]
  );

  const refreshPending = async () => {
    const depth = await pendingQueueDepth().catch(() => ({ ratings: 0, highlights: 0, notes: 0 }));
    setPendingCount(depth.ratings + depth.highlights + depth.notes);
  };

  const startPrefetch = (summaries: ArticleSummary[]) => {
    if (!bodyPrefetch || !navigator.onLine || summaries.length === 0) return;
    prefetchRef.current?.cancel();
    const handle = prefetchArticleBodies(summaries, {
      concurrency: 4,
      onProgress: (progress: PrefetchProgress) => setPrefetch({ done: progress.done, total: progress.total })
    });
    prefetchRef.current = handle;
    void handle.done.then(() => {
      setPrefetch(undefined);
    });
  };

  const refresh = async (silent = false) => {
    if (!silent) setSyncing(true);
    const result = await fetchArticleSummaries();
    setArticles(result.articles);
    setOffline(result.offline);
    if (!result.offline) setLastSyncAt(new Date().toISOString());
    if (result.newIds.length > 0) noteSessionNew(result.newIds);
    lastRefreshRef.current = Date.now();
    if (!result.offline) startPrefetch(result.articles);
    if (!silent) setSyncing(false);
    void refreshPending();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadCachedSummaries();
      if (cancelled) return;
      if (cached.length > 0) hydrateArticles(cached);

      if (autoSyncOnOpen) {
        void refresh(cached.length > 0);
      }
      void refreshPending();
    })();

    void flushPendingQueues();

    const intervalMs = Math.max(5, syncIntervalMinutes) * 60 * 1000;
    const interval = window.setInterval(() => void refresh(true), intervalMs);
    const onOnline = () => {
      void flushPendingQueues();
      void refresh(true);
    };
    const onOffline = () => setOffline(true);
    const onPaletteSync = () => void refresh(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('reader:sync', onPaletteSync);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      prefetchRef.current?.cancel();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('reader:sync', onPaletteSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncOnOpen, syncIntervalMinutes, bodyPrefetch]);

  useEffect(() => {
    const updateListHeight = () => {
      const top = listHostRef.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(320, window.innerHeight - top - 12));
    };
    const frame = window.requestAnimationFrame(updateListHeight);
    window.addEventListener('resize', updateListHeight);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateListHeight);
    };
  }, [filtered.length, hydrated, lastArticle?.id, showContinueReading]);

  // View shortcuts: t = triage, b = library, / = focus search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(event.target.tagName))) return;
      if (event.key === 't') router.push('/triage');
      if (event.key === 'b') router.push('/library');
      if (event.key === '/') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  // Body content search runs against the local cache when the query is non-empty.
  useEffect(() => {
    const query = filters.query.trim().toLowerCase();
    if (query.length < 3) {
      setBodyMatches(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const bodies = await getAllCachedBodies().catch(() => []);
      if (cancelled) return;
      const hits = new Set<string>();
      for (const entry of bodies) {
        if (entry.body.toLowerCase().includes(query)) hits.add(entry.id);
      }
      setBodyMatches(hits);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.query]);

  // Keep last-sync indicator alive (re-render once a minute).
  useEffect(() => {
    if (!lastSyncAt) return;
    const interval = window.setInterval(() => setLastSyncAt((value) => (value ? value : value)), 30_000);
    return () => window.clearInterval(interval);
  }, [lastSyncAt]);

  const sessionNewCount = useMemo(
    () => filtered.filter((article) => sessionNewSet.has(article.id)).length,
    [filtered, sessionNewSet]
  );

  const meta: FilterBarMeta = {
    syncing,
    offline,
    lastSyncAt,
    duplicateCount: dedup.duplicateCount,
    prefetch,
    sessionNewCount,
    pendingCount,
    unratedCount,
    resultCount: filtered.length,
    totalCount: visibleArticles.length
  };

  return (
    <main className="min-h-screen">
      <FilterBar articles={visibleArticles} onRefresh={() => void refresh(false)} meta={meta} />
      <section className="mx-auto max-w-[880px] py-3">
        {!hydrated ? <p className="px-4 pb-2 font-meta text-xs text-mutedink">Loading…</p> : null}
        {showContinueReading && lastArticle ? (
          <div className="px-4 pb-2">
            <Link
              href={`/article/${lastArticle.id}`}
              className="flex min-h-11 items-center gap-3 border-b border-hairline px-1 py-3 text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <BookOpen className="h-4 w-4 shrink-0 text-mutedink" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-meta text-[11px] uppercase tracking-[0.08em] text-mutedink">Continue · </span>
                <span className="font-heading font-bold">{lastArticle.frontmatter.title}</span>
              </span>
            </Link>
          </div>
        ) : null}
        {hydrated && filtered.length === 0 ? (
          <div className="px-4 py-24 text-center text-mutedink">No articles match the current filters.</div>
        ) : null}
        <div ref={listHostRef}>
          {filtered.length > 0 ? (
            <FixedSizeList
              height={height}
              width="100%"
              itemCount={filtered.length}
              itemSize={LIST_ITEM_SIZE}
              itemData={{ articles: filtered, sessionNewIds: sessionNewSet }}
            >
              {Row}
            </FixedSizeList>
          ) : null}
        </div>
      </section>
    </main>
  );
}

interface RowData {
  articles: ArticleSummary[];
  sessionNewIds: Set<string>;
}

function Row({ index, style, data }: ListChildComponentProps<RowData>): React.ReactElement {
  const article = data.articles[index];
  return <ArticleListItem article={article} style={style} isNew={data.sessionNewIds.has(article.id)} />;
}
