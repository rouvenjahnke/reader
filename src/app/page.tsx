'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';

import { ArticleListItem } from '@/components/ArticleListItem';
import { FilterBar } from '@/components/FilterBar';
import { flushPendingQueues } from '@/lib/cache';
import { filterAndSortArticles } from '@/lib/filters';
import { fetchArticleSummaries, loadCachedSummaries } from '@/lib/sync';
import { useArticleStore } from '@/stores/useArticleStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import type { ArticleSummary } from '@/types/article';

export default function HomePage(): React.ReactElement {
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const hydrated = useArticleStore((state) => state.hydrated);
  const setArticles = useArticleStore((state) => state.setArticles);
  const hydrateArticles = useArticleStore((state) => state.hydrateArticles);
  const lastArticleId = useArticleStore((state) => state.lastArticleId);
  const pinPriorityOnTop = usePreferencesStore((state) => state.pinPriorityOnTop);
  const autoSyncOnOpen = usePreferencesStore((state) => state.autoSyncOnOpen);
  const syncIntervalMinutes = usePreferencesStore((state) => state.syncIntervalMinutes);
  const showContinueReading = usePreferencesStore((state) => state.showContinueReading);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [height, setHeight] = useState(720);
  const lastRefreshRef = useRef<number>(0);

  const filtered = useMemo(
    () => filterAndSortArticles(articles, filters, { pinPriorityOnTop }),
    [articles, filters, pinPriorityOnTop]
  );
  const lastArticle = useMemo(() => articles.find((article) => article.id === lastArticleId), [articles, lastArticleId]);

  const refresh = async (silent = false) => {
    if (!silent) setSyncing(true);
    const result = await fetchArticleSummaries();
    setArticles(result.articles);
    lastRefreshRef.current = Date.now();
    if (!silent) {
      setMessage(
        result.offline
          ? `Offline – showing cached articles. ${new Date().toLocaleTimeString('en-US')}`
          : `Synced at ${new Date().toLocaleTimeString('en-US')}`
      );
    } else if (result.offline) {
      setMessage(`Background sync failed – showing cached articles.`);
    }
    if (!silent) setSyncing(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadCachedSummaries();
      if (cancelled) return;
      if (cached.length > 0) hydrateArticles(cached);

      if (autoSyncOnOpen) {
        // Background refresh: don't block UI, don't show spinner if we already had cache.
        void refresh(cached.length > 0);
      }
    })();

    void flushPendingQueues();

    const intervalMs = Math.max(5, syncIntervalMinutes) * 60 * 1000;
    const interval = window.setInterval(() => void refresh(true), intervalMs);
    const onOnline = () => {
      void flushPendingQueues();
      void refresh(true);
    };
    const onResize = () => setHeight(Math.max(420, window.innerHeight - 172));
    onResize();
    window.addEventListener('online', onOnline);
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncOnOpen, syncIntervalMinutes]);

  return (
    <main className="min-h-screen">
      <FilterBar articles={articles} onRefresh={() => void refresh(false)} syncing={syncing} />
      <section className="mx-auto max-w-[720px] py-3">
        {!hydrated ? (
          <p className="px-4 pb-2 text-sm text-neutral-700 dark:text-neutral-400">Loading…</p>
        ) : message ? (
          <p className="px-4 pb-2 text-sm text-neutral-700 dark:text-neutral-400">{message}</p>
        ) : null}
        {showContinueReading && lastArticle ? (
          <div className="px-3 pb-2">
            <Link
              href={`/article/${lastArticle.id}`}
              className="flex min-h-11 items-center gap-3 rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-950 shadow-sm transition hover:border-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 dark:hover:border-neutral-600"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Continue reading: <span className="font-medium">{lastArticle.frontmatter.title}</span>
              </span>
            </Link>
          </div>
        ) : null}
        {hydrated && filtered.length === 0 ? (
          <div className="px-4 py-24 text-center text-neutral-700 dark:text-neutral-400">No articles. The pipeline runs daily at 07:00.</div>
        ) : null}
        {filtered.length > 0 ? (
          <FixedSizeList height={height} width="100%" itemCount={filtered.length} itemSize={176} itemData={filtered}>
            {Row}
          </FixedSizeList>
        ) : null}
      </section>
    </main>
  );
}

function Row({ index, style, data }: ListChildComponentProps<ArticleSummary[]>): React.ReactElement {
  return <ArticleListItem article={data[index]} style={style} />;
}
