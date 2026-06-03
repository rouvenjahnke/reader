'use client';

import { getCachedArticleEtags, saveArticle } from '@/lib/cache';
import type { Article, ArticleSummary } from '@/types/article';

export interface PrefetchProgress {
  done: number;
  total: number;
  cancelled: boolean;
  errors: number;
}

export interface PrefetchHandle {
  cancel: () => void;
  done: Promise<PrefetchProgress>;
}

interface PrefetchOptions {
  concurrency?: number;
  onProgress?: (progress: PrefetchProgress) => void;
  signal?: AbortSignal;
}

const DEFAULT_CONCURRENCY = 4;

/**
 * Prefetch the article bodies for every summary whose etag has changed (or that
 * is not yet cached). Runs in the background, can be cancelled, and reports
 * progress per completed item. Aborts cleanly when the device goes offline.
 */
export function prefetchArticleBodies(summaries: ArticleSummary[], options: PrefetchOptions = {}): PrefetchHandle {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;

  const done = (async (): Promise<PrefetchProgress> => {
    const etags = await getCachedArticleEtags();
    const queue: ArticleSummary[] = [];
    for (const summary of summaries) {
      if (signal.aborted) break;
      const cachedEtag = etags.get(summary.id);
      if (!summary.etag || !cachedEtag || cachedEtag !== summary.etag) {
        queue.push(summary);
      }
    }

    const progress: PrefetchProgress = { done: 0, total: queue.length, cancelled: false, errors: 0 };
    options.onProgress?.(progress);

    if (queue.length === 0) return progress;

    let cursor = 0;
    const worker = async () => {
      while (true) {
        if (signal.aborted || !navigator.onLine) return;
        const index = cursor;
        cursor += 1;
        if (index >= queue.length) return;
        const summary = queue[index];
        try {
          const response = await fetch(`/api/articles/${summary.id}`, { cache: 'no-store', signal });
          if (response.ok) {
            const article = (await response.json()) as Article;
            // Preserve firstSeenAt the summary already carries; the API doesn't know it.
            await saveArticle({ ...article, firstSeenAt: summary.firstSeenAt });
          } else {
            progress.errors += 1;
          }
        } catch (error) {
          if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
          progress.errors += 1;
        } finally {
          progress.done += 1;
          options.onProgress?.(progress);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    progress.cancelled = signal.aborted;
    options.onProgress?.(progress);
    return progress;
  })();

  return {
    cancel: () => controller.abort(),
    done
  };
}
