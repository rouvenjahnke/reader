'use client';

import { getCachedArticle, getCachedSummaries, saveArticle, saveSummaries } from '@/lib/cache';
import type { Article, ArticleSummary } from '@/types/article';

export async function loadCachedSummaries(): Promise<ArticleSummary[]> {
  try {
    return await getCachedSummaries();
  } catch {
    return [];
  }
}

export async function fetchArticleSummaries(signal?: AbortSignal): Promise<{ articles: ArticleSummary[]; offline: boolean; error?: string }> {
  try {
    const response = await fetch('/api/articles', { cache: 'no-store', signal });
    if (!response.ok) throw new Error(await response.text());
    const articles = (await response.json()) as ArticleSummary[];
    await saveSummaries(articles);
    return { articles, offline: false };
  } catch (error) {
    if (signal?.aborted) {
      return { articles: [], offline: true, error: 'aborted' };
    }
    const cached = await loadCachedSummaries();
    return {
      articles: cached,
      offline: true,
      error: error instanceof Error ? error.message : 'Sync failed'
    };
  }
}

export async function fetchArticle(id: string, signal?: AbortSignal): Promise<Article> {
  const response = await fetch(`/api/articles/${id}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(await response.text());
  const article = (await response.json()) as Article;
  await saveArticle(article);
  return article;
}

export async function loadArticleCacheFirst(id: string, signal?: AbortSignal): Promise<{ article: Article | undefined; offline: boolean; error?: string }> {
  const cached = await getCachedArticle(id).catch(() => undefined);
  if (cached) {
    return { article: cached, offline: false };
  }

  try {
    const fresh = await fetchArticle(id, signal);
    return { article: fresh, offline: false };
  } catch (error) {
    if (signal?.aborted) return { article: undefined, offline: true, error: 'aborted' };
    return { article: undefined, offline: true, error: error instanceof Error ? error.message : 'Article fetch failed' };
  }
}
