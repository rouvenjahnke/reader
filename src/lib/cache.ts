'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { appendSyncLog } from '@/lib/syncLog';
import type { Article, ArticleSummary, PendingHighlight, PendingRating } from '@/types/article';

interface ReaderDb extends DBSchema {
  articles: {
    key: string;
    value: Article;
    indexes: { 'by-path': string };
  };
  summaries: {
    key: string;
    value: ArticleSummary;
  };
  pending_ratings: {
    key: string;
    value: PendingRating;
  };
  pending_highlights: {
    key: string;
    value: PendingHighlight;
  };
}

let dbPromise: Promise<IDBPDatabase<ReaderDb>> | null = null;

function getDb(): Promise<IDBPDatabase<ReaderDb>> {
  if (!dbPromise) {
    dbPromise = openDB<ReaderDb>('reader-db', 1, {
      upgrade(db) {
        const articles = db.createObjectStore('articles', { keyPath: 'id' });
        articles.createIndex('by-path', 'path');
        db.createObjectStore('summaries', { keyPath: 'id' });
        db.createObjectStore('pending_ratings', { keyPath: 'id' });
        db.createObjectStore('pending_highlights', { keyPath: 'id' });
      }
    });
  }

  return dbPromise;
}

export async function saveSummaries(articles: ArticleSummary[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('summaries', 'readwrite');
  await Promise.all(articles.map((article) => tx.store.put(article)));
  await tx.done;
}

export async function getCachedSummaries(): Promise<ArticleSummary[]> {
  const db = await getDb();
  return db.getAll('summaries');
}

export async function saveArticle(article: Article): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['articles', 'summaries'], 'readwrite');
  await Promise.all([tx.objectStore('articles').put(article), tx.objectStore('summaries').put(stripBody(article))]);
  await tx.done;
}

export async function getCachedArticle(id: string): Promise<Article | undefined> {
  const db = await getDb();
  return db.get('articles', id);
}

export async function updateCachedRating(id: string, status: PendingRating['status'], ratedAt: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['articles', 'summaries'], 'readwrite');
  const [article, summary] = await Promise.all([tx.objectStore('articles').get(id), tx.objectStore('summaries').get(id)]);

  if (article) {
    article.frontmatter.reader_status = status;
    article.frontmatter.reader_rated_at = ratedAt;
    await tx.objectStore('articles').put(article);
  }

  if (summary) {
    summary.frontmatter.reader_status = status;
    summary.frontmatter.reader_rated_at = ratedAt;
    await tx.objectStore('summaries').put(summary);
  }

  await tx.done;
}

export async function updateCachedBody(id: string, body: string): Promise<void> {
  const db = await getDb();
  const article = await db.get('articles', id);
  if (!article) return;
  article.body = body;
  await db.put('articles', article);
}

export async function queueRating(rating: PendingRating): Promise<void> {
  const db = await getDb();
  await db.put('pending_ratings', rating);
}

export async function queueHighlight(highlight: PendingHighlight): Promise<void> {
  const db = await getDb();
  await db.put('pending_highlights', highlight);
}

export async function flushPendingQueues(): Promise<void> {
  if (!navigator.onLine) return;
  const db = await getDb();
  const ratings = await db.getAll('pending_ratings');
  const highlights = await db.getAll('pending_highlights');

  for (const rating of ratings) {
    try {
      const response = await fetch(`/api/articles/${rating.id}/rate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: rating.status })
      });
      if (response.ok) {
        await db.delete('pending_ratings', rating.id);
        appendSyncLog('info', `Rating synchronisiert: ${rating.path}`);
      } else {
        appendSyncLog('error', `Rating-Sync fehlgeschlagen: ${rating.path} (${response.status})`);
      }
    } catch (error) {
      appendSyncLog('error', `Rating-Sync fehlgeschlagen: ${rating.path} (${errorMessage(error)})`);
    }
  }

  for (const highlight of highlights) {
    const articleId = highlight.articleId || highlight.id;
    try {
      const response = await fetch(`/api/articles/${articleId}/highlight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: highlight.text })
      });
      if (response.ok) {
        await db.delete('pending_highlights', highlight.id);
        appendSyncLog('info', `Markierung synchronisiert: ${highlight.path}`);
      } else {
        appendSyncLog('error', `Markierungs-Sync fehlgeschlagen: ${highlight.path} (${response.status})`);
      }
    } catch (error) {
      appendSyncLog('error', `Markierungs-Sync fehlgeschlagen: ${highlight.path} (${errorMessage(error)})`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unbekannter Fehler';
}

function stripBody(article: Article): ArticleSummary {
  return {
    id: article.id,
    path: article.path,
    etag: article.etag,
    lastModified: article.lastModified,
    size: article.size,
    frontmatter: article.frontmatter
  };
}
