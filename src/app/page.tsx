'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';

import { ArticleListItem } from '@/components/ArticleListItem';
import { FilterBar } from '@/components/FilterBar';
import { flushPendingQueues } from '@/lib/cache';
import { filterAndSortArticles } from '@/lib/filters';
import { fetchArticleSummaries } from '@/lib/sync';
import { useArticleStore } from '@/stores/useArticleStore';
import type { ArticleSummary } from '@/types/article';

export default function HomePage(): React.ReactElement {
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const setArticles = useArticleStore((state) => state.setArticles);
  const lastArticleId = useArticleStore((state) => state.lastArticleId);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [height, setHeight] = useState(720);
  const filtered = useMemo(() => filterAndSortArticles(articles, filters), [articles, filters]);
  const lastArticle = useMemo(() => articles.find((article) => article.id === lastArticleId), [articles, lastArticleId]);

  const refresh = async () => {
    setSyncing(true);
    const result = await fetchArticleSummaries();
    setArticles(result.articles);
    setMessage(result.offline ? `Sync failed, loaded cache. ${new Date().toLocaleTimeString('en-US')}` : `Synced at ${new Date().toLocaleTimeString('en-US')}`);
    setSyncing(false);
  };

  useEffect(() => {
    void refresh();
    void flushPendingQueues();
    const interval = window.setInterval(refresh, 30 * 60 * 1000);
    const onOnline = () => void flushPendingQueues();
    const onResize = () => setHeight(Math.max(420, window.innerHeight - 172));
    onResize();
    window.addEventListener('online', onOnline);
    window.addEventListener('resize', onResize);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <main className="min-h-screen">
      <FilterBar articles={articles} onRefresh={refresh} syncing={syncing} />
      <section className="mx-auto max-w-[720px] py-3">
        {message ? <p className="px-4 pb-2 text-sm text-neutral-500">{message}</p> : null}
        {lastArticle ? (
          <div className="px-3 pb-2">
            <Link
              href={`/article/${lastArticle.id}`}
              className="flex min-h-11 items-center gap-3 rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm shadow-sm transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Continue reading: <span className="font-medium">{lastArticle.frontmatter.title}</span>
              </span>
            </Link>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <div className="px-4 py-24 text-center text-neutral-500">No articles. The pipeline runs daily at 07:00.</div>
        ) : (
          <FixedSizeList height={height} width="100%" itemCount={filtered.length} itemSize={176} itemData={filtered}>
            {Row}
          </FixedSizeList>
        )}
      </section>
    </main>
  );
}

function Row({ index, style, data }: ListChildComponentProps<ArticleSummary[]>): React.ReactElement {
  return <ArticleListItem article={data[index]} style={style} />;
}
