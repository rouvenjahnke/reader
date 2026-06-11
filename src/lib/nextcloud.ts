import 'server-only';

import { createClient, type FileStat, type WebDAVClient } from 'webdav';

import { parseArticle } from '@/lib/frontmatter';
import { encodeArticleId } from '@/lib/ids';
import type { Article, ArticleCollection, ArticleSummary } from '@/types/article';

let client: WebDAVClient | null = null;

export function getBasePath(): string {
  return process.env.NEXTCLOUD_BASE_PATH || '/Workstation/Projects/maths/00_inbox/reader-pipeline/';
}

/** Optional second folder for starred arXiv papers; null when not configured. */
export function getPapersPath(): string | null {
  const value = process.env.NEXTCLOUD_PAPERS_PATH?.trim();
  return value ? value : null;
}

export function getNextcloudClient(): WebDAVClient {
  if (client) return client;

  const url = process.env.NEXTCLOUD_URL;
  const username = process.env.NEXTCLOUD_USERNAME;
  const password = process.env.NEXTCLOUD_APP_PASSWORD;

  if (!url || !username || !password) {
    throw new Error('Nextcloud ist nicht konfiguriert. Bitte .env prüfen.');
  }

  client = createClient(url, { username, password });
  return client;
}

export async function listMarkdownFiles(basePath = getBasePath()): Promise<FileStat[]> {
  const c = getNextcloudClient();
  const files = (await c.getDirectoryContents(basePath, { deep: true })) as FileStat[];
  return files.filter((item) => item.type === 'file' && item.basename.endsWith('.md'));
}

interface CacheEntry {
  etag: string;
  lastmod: string;
  size: number;
  summary: ArticleSummary;
  article?: Article;
}

const summaryCache: Map<string, CacheEntry> = new Map();
const CONCURRENCY = 6;

function freshFromCache(file: FileStat): ArticleSummary | undefined {
  const entry = summaryCache.get(file.filename);
  if (!entry) return undefined;
  if (entry.etag === (file.etag ?? '') && entry.lastmod === (file.lastmod ?? '') && entry.size === (file.size ?? 0)) {
    return entry.summary;
  }
  return undefined;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Array<Promise<void>> = [];

  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]);
    }
  };

  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

interface ListedFile {
  file: FileStat;
  collection?: ArticleCollection;
}

export async function listArticleSummaries(): Promise<ArticleSummary[]> {
  const entries: ListedFile[] = (await listMarkdownFiles(getBasePath())).map((file) => ({ file }));

  // The papers folder is optional and must never break the main listing.
  const papersPath = getPapersPath();
  if (papersPath) {
    try {
      const papers = await listMarkdownFiles(papersPath);
      for (const file of papers) entries.push({ file, collection: 'papers' });
    } catch (error) {
      console.warn(`Skipping papers folder ${papersPath}: ${errorMessage(error)}`);
    }
  }

  const present = new Set(entries.map((entry) => entry.file.filename));
  for (const key of summaryCache.keys()) {
    if (!present.has(key)) summaryCache.delete(key);
  }

  const summaries = await mapWithConcurrency<ListedFile, ArticleSummary | null>(entries, CONCURRENCY, async ({ file, collection }) => {
    const cached = freshFromCache(file);
    if (cached) return collection && cached.collection !== collection ? { ...cached, collection } : cached;

    try {
      const raw = await getArticleRaw(file.filename);
      const parsed = parseArticle(raw);
      const summary: ArticleSummary = {
        id: encodeArticleId(file.filename),
        path: file.filename,
        etag: file.etag ?? undefined,
        lastModified: file.lastmod,
        size: file.size,
        collection,
        frontmatter: parsed.frontmatter
      };
      summaryCache.set(file.filename, {
        etag: file.etag ?? '',
        lastmod: file.lastmod ?? '',
        size: file.size ?? 0,
        summary,
        article: {
          id: summary.id,
          path: file.filename,
          etag: summary.etag,
          lastModified: summary.lastModified,
          size: summary.size,
          collection,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
          raw
        }
      });
      return summary;
    } catch (error) {
      console.warn(`Skipping unreadable article ${file.filename}: ${errorMessage(error)}`);
      return null;
    }
  });

  return uniqueSummaries(summaries.filter((summary): summary is ArticleSummary => summary !== null));
}

export async function getArticle(path: string): Promise<Article> {
  const cached = summaryCache.get(path);
  if (cached?.article) return cached.article;

  const raw = await getArticleRaw(path);
  const parsed = parseArticle(raw);

  const article: Article = {
    id: encodeArticleId(path),
    path,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    raw
  };

  if (cached) {
    cached.article = article;
    cached.summary = {
      id: article.id,
      path,
      etag: cached.etag,
      lastModified: cached.lastmod,
      size: cached.size,
      collection: cached.summary.collection,
      frontmatter: parsed.frontmatter
    };
  }

  return article;
}

export function invalidateArticleCache(path: string): void {
  summaryCache.delete(path);
}

export async function getArticleRaw(path: string): Promise<string> {
  const c = getNextcloudClient();
  const content = await c.getFileContents(path, { format: 'text' });
  return typeof content === 'string' ? content : content.toString();
}

export async function putArticleRaw(path: string, content: string): Promise<void> {
  const c = getNextcloudClient();
  const buffer = Buffer.from(content, 'utf8');
  await c.putFileContents(path, buffer, {
    overwrite: true,
    contentLength: buffer.byteLength
  });
  invalidateArticleCache(path);
}

export async function testConnection(basePath = getBasePath()): Promise<{ ok: true; count: number }> {
  const files = await listMarkdownFiles(basePath);
  return { ok: true, count: files.length };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

function uniqueSummaries(summaries: ArticleSummary[]): ArticleSummary[] {
  const seen = new Set<string>();
  return summaries.filter((summary) => {
    if (seen.has(summary.id)) return false;
    seen.add(summary.id);
    return true;
  });
}
