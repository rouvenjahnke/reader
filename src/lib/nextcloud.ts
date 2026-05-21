import 'server-only';

import { createClient, type FileStat, type WebDAVClient } from 'webdav';

import { parseArticle } from '@/lib/frontmatter';
import { encodeArticleId } from '@/lib/ids';
import type { Article, ArticleSummary } from '@/types/article';

let client: WebDAVClient | null = null;

export function getBasePath(): string {
  return process.env.NEXTCLOUD_BASE_PATH || '/Reader-Pipeline/';
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
  const files = await c.getDirectoryContents(basePath, { deep: true });
  return files.filter((item) => item.type === 'file' && item.basename.endsWith('.md'));
}

export async function listArticleSummaries(basePath = getBasePath()): Promise<ArticleSummary[]> {
  const files = await listMarkdownFiles(basePath);
  const summaries = await Promise.all(
    files.map(async (file) => {
      const raw = await getArticleRaw(file.filename);
      const parsed = parseArticle(raw);
      return {
        id: encodeArticleId(file.filename),
        path: file.filename,
        etag: file.etag ?? undefined,
        lastModified: file.lastmod,
        size: file.size,
        frontmatter: parsed.frontmatter
      };
    })
  );

  return summaries;
}

export async function getArticle(path: string): Promise<Article> {
  const raw = await getArticleRaw(path);
  const parsed = parseArticle(raw);

  return {
    id: encodeArticleId(path),
    path,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    raw
  };
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
}

export async function testConnection(basePath = getBasePath()): Promise<{ ok: true; count: number }> {
  const files = await listMarkdownFiles(basePath);
  return { ok: true, count: files.length };
}
