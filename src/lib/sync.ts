'use client';

import { getCachedSummaries, saveArticle, saveSummaries } from '@/lib/cache';
import type { Article, ArticleSummary } from '@/types/article';

export async function fetchArticleSummaries(): Promise<{ articles: ArticleSummary[]; offline: boolean; error?: string }> {
  try {
    const response = await fetch('/api/articles', { cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    const articles = (await response.json()) as ArticleSummary[];
    await saveSummaries(articles);
    return { articles, offline: false };
  } catch (error) {
    const cached = await getCachedSummaries();
    return {
      articles: cached,
      offline: true,
      error: error instanceof Error ? error.message : 'Sync failed'
    };
  }
}

export async function fetchArticle(id: string): Promise<Article> {
  const response = await fetch(`/api/articles/${id}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await response.text());
  const article = (await response.json()) as Article;
  await saveArticle(article);
  return article;
}
