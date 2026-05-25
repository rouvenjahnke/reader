'use client';

import { ArrowLeft, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ArticleReader } from '@/components/ArticleReader';
import { Button } from '@/components/ui/button';
import { fetchArticle, loadArticleCacheFirst } from '@/lib/sync';
import type { Article } from '@/types/article';

interface Props {
  id: string;
  path: string;
}

export function ArticleReaderShell({ id, path }: Props): React.ReactElement {
  const [article, setArticle] = useState<Article | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    (async () => {
      const result = await loadArticleCacheFirst(id, controller.signal);
      if (cancelled) return;
      if (result.article) {
        setArticle(result.article);
        setLoading(false);
      } else {
        setLoading(false);
        setError(result.error ?? 'Could not load article. Open it once while online to cache it.');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[760px] items-center justify-center px-4 text-sm text-neutral-700 dark:text-neutral-400">
        Loading article…
      </main>
    );
  }

  if (!article) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[760px] flex-col items-center justify-center gap-4 px-4 text-center">
        <WifiOff className="h-6 w-6 text-neutral-700 dark:text-neutral-400" />
        <div className="text-sm text-neutral-800 dark:text-neutral-200">{error ?? 'Article unavailable.'}</div>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 break-all">{path}</p>
        <div className="flex gap-2">
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-100 px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <Button
            type="button"
            variant="default"
            onClick={() => {
              setError(null);
              setLoading(true);
              void (async () => {
                try {
                  const fresh = await fetchArticle(id);
                  setArticle(fresh);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Retry failed');
                } finally {
                  setLoading(false);
                }
              })();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </main>
    );
  }

  return <ArticleReader article={article} />;
}
