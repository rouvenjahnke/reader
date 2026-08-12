'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { appendSyncLog } from '@/lib/syncLog';
import type { Article, ArticleSummary, PendingHighlight, PendingNote, PendingRating } from '@/types/article';

interface ArticleMeta {
  id: string;
  firstSeenAt: string;
}

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
  pending_notes: {
    key: string;
    value: PendingNote;
  };
  article_meta: {
    key: string;
    value: ArticleMeta;
  };
}

let dbPromise: Promise<IDBPDatabase<ReaderDb>> | null = null;

function getDb(): Promise<IDBPDatabase<ReaderDb>> {
  if (!dbPromise) {
    dbPromise = openDB<ReaderDb>('reader-db', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const articles = db.createObjectStore('articles', { keyPath: 'id' });
          articles.createIndex('by-path', 'path');
          db.createObjectStore('summaries', { keyPath: 'id' });
          db.createObjectStore('pending_ratings', { keyPath: 'id' });
          db.createObjectStore('pending_highlights', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('article_meta', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          db.createObjectStore('pending_notes', { keyPath: 'id' });
        }
      }
    });
  }

  return dbPromise;
}

/**
 * Persist the latest summary set. For every summary previously unseen on this
 * device, stamp `firstSeenAt = now`. For known summaries, reattach the prior
 * firstSeenAt so the "new since…" signal stays stable across syncs.
 */
export async function saveSummaries(articles: ArticleSummary[]): Promise<{ newIds: string[] }> {
  const db = await getDb();

  if (articles.length === 0) {
    const tx = db.transaction('summaries', 'readwrite');
    await tx.store.clear();
    await tx.done;
    return { newIds: [] };
  }

  const now = new Date().toISOString();
  const newIds: string[] = [];

  const metaTx = db.transaction('article_meta', 'readwrite');
  const existing = new Map<string, ArticleMeta>();
  for (const meta of await metaTx.store.getAll()) existing.set(meta.id, meta);

  const enriched: ArticleSummary[] = [];
  for (const summary of articles) {
    const prior = existing.get(summary.id);
    if (!prior) {
      const meta: ArticleMeta = { id: summary.id, firstSeenAt: now };
      await metaTx.store.put(meta);
      enriched.push({ ...summary, firstSeenAt: now });
      newIds.push(summary.id);
    } else {
      enriched.push({ ...summary, firstSeenAt: prior.firstSeenAt });
    }
  }
  await metaTx.done;

  const tx = db.transaction('summaries', 'readwrite');
  await tx.store.clear();
  for (const summary of enriched) await tx.store.put(summary);
  await tx.done;

  const currentIds = new Set(enriched.map((summary) => summary.id));
  const cachedArticleKeys = await db.getAllKeys('articles');
  const articleTx = db.transaction('articles', 'readwrite');
  for (const key of cachedArticleKeys) {
    if (!currentIds.has(String(key))) void articleTx.store.delete(key);
  }
  await articleTx.done;

  return { newIds };
}

export async function getCachedSummaries(): Promise<ArticleSummary[]> {
  const db = await getDb();
  const [summaries, metas] = await Promise.all([db.getAll('summaries'), db.getAll('article_meta')]);
  const metaById = new Map(metas.map((meta) => [meta.id, meta.firstSeenAt] as const));
  return summaries.map((summary) => ({ ...summary, firstSeenAt: summary.firstSeenAt ?? metaById.get(summary.id) }));
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

/** All locally cached article ids — used by prefetch to skip what's already there. */
export async function listCachedArticleIds(): Promise<Set<string>> {
  const db = await getDb();
  const keys = await db.getAllKeys('articles');
  return new Set(keys.map((key) => String(key)));
}

/** Cached etags so prefetch can decide whether a remote re-fetch is needed. */
export async function getCachedArticleEtags(): Promise<Map<string, string>> {
  const db = await getDb();
  const articles = await db.getAll('articles');
  const map = new Map<string, string>();
  for (const article of articles) {
    if (article.etag) map.set(article.id, article.etag);
  }
  return map;
}

/** Streaming body iterator for full-text search across the local cache. */
export async function getAllCachedBodies(): Promise<Array<{ id: string; body: string }>> {
  const db = await getDb();
  const articles = await db.getAll('articles');
  return articles.map((article) => ({ id: article.id, body: article.body }));
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

export async function queueNote(note: PendingNote): Promise<void> {
  const db = await getDb();
  await db.put('pending_notes', note);
}

export async function updateCachedNote(id: string, note: string, updatedAt: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['articles', 'summaries'], 'readwrite');
  const [article, summary] = await Promise.all([tx.objectStore('articles').get(id), tx.objectStore('summaries').get(id)]);
  const trimmed = note.trim();

  for (const record of [article, summary]) {
    if (!record) continue;
    if (trimmed) {
      record.frontmatter.reader_note = trimmed;
      record.frontmatter.reader_note_updated_at = updatedAt;
    } else {
      delete record.frontmatter.reader_note;
      delete record.frontmatter.reader_note_updated_at;
    }
  }

  if (article) await tx.objectStore('articles').put(article);
  if (summary) await tx.objectStore('summaries').put(summary);
  await tx.done;
}

export async function pendingQueueDepth(): Promise<{ ratings: number; highlights: number; notes: number }> {
  const db = await getDb();
  const [ratings, highlights, notes] = await Promise.all([
    db.count('pending_ratings'),
    db.count('pending_highlights'),
    db.count('pending_notes')
  ]);
  return { ratings, highlights, notes };
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
        appendSyncLog('info', `Rating synced: ${rating.path}`);
      } else {
        appendSyncLog('error', `Rating sync failed: ${rating.path} (${response.status})`);
      }
    } catch (error) {
      appendSyncLog('error', `Rating sync failed: ${rating.path} (${errorMessage(error)})`);
    }
  }

  const notes = await db.getAll('pending_notes');
  for (const note of notes) {
    try {
      const response = await fetch(`/api/articles/${note.id}/note`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: note.note })
      });
      if (response.ok) {
        await db.delete('pending_notes', note.id);
        appendSyncLog('info', `Note synced: ${note.path}`);
      } else {
        appendSyncLog('error', `Note sync failed: ${note.path} (${response.status})`);
      }
    } catch (error) {
      appendSyncLog('error', `Note sync failed: ${note.path} (${errorMessage(error)})`);
    }
  }

  for (const highlight of highlights) {
    const articleId = highlight.articleId || highlight.id;
    try {
      const response = await fetch(`/api/articles/${articleId}/highlight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: highlight.text,
          action: highlight.action ?? 'add',
          occurrenceIndex: highlight.occurrenceIndex ?? 0
        })
      });
      if (response.ok) {
        await db.delete('pending_highlights', highlight.id);
        appendSyncLog('info', `Highlight synced: ${highlight.path}`);
      } else {
        appendSyncLog('error', `Highlight sync failed: ${highlight.path} (${response.status})`);
      }
    } catch (error) {
      appendSyncLog('error', `Highlight sync failed: ${highlight.path} (${errorMessage(error)})`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function stripBody(article: Article): ArticleSummary {
  return {
    id: article.id,
    path: article.path,
    etag: article.etag,
    lastModified: article.lastModified,
    size: article.size,
    collection: article.collection,
    pipelineRelativePath: article.pipelineRelativePath,
    pipelineFolder: article.pipelineFolder,
    frontmatter: article.frontmatter,
    firstSeenAt: article.firstSeenAt
  };
}
