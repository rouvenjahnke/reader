import matter from 'gray-matter';

import type { ArticleFrontmatter, ReaderStatus } from '@/types/article';

export function parseArticle(raw: string): { frontmatter: ArticleFrontmatter; body: string } {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  return {
    frontmatter: {
      ...data,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Ohne Titel',
      tags: normalizeTags(data.tags),
      score: normalizeNumber(data.score),
      priority: normalizeNumber(data.priority),
      reader_status: normalizeReaderStatus(data.reader_status)
    },
    body: parsed.content
  };
}

export function setRating(raw: string, status: Exclude<ReaderStatus, 'unrated'>, ratedAt = new Date()): string {
  const parsed = matter(raw);
  parsed.data.reader_status = status;
  parsed.data.reader_rated_at = ratedAt.toISOString();
  return matter.stringify(parsed.content, parsed.data);
}

export function addHighlight(raw: string, selectedText: string): string {
  const text = selectedText.trim();
  if (!text) {
    throw new Error('Kein Text markiert.');
  }

  const parsed = matter(raw);
  const body = parsed.content;
  const highlighted = highlightFirstOccurrence(body, text);
  return matter.stringify(highlighted, parsed.data);
}

export function highlightFirstOccurrence(body: string, selectedText: string): string {
  const needle = selectedText.trim();
  if (!needle) {
    return body;
  }

  const exactIndex = body.indexOf(needle);
  if (exactIndex >= 0 && !isAlreadyHighlighted(body, exactIndex, needle.length)) {
    return `${body.slice(0, exactIndex)}==${needle}==${body.slice(exactIndex + needle.length)}`;
  }

  const normalizedNeedle = normalizeWhitespace(needle);
  const match = findNormalizedMatch(body, normalizedNeedle);
  if (!match || isAlreadyHighlighted(body, match.start, match.end - match.start)) {
    throw new Error('Der markierte Text wurde im Markdown nicht eindeutig gefunden.');
  }

  return `${body.slice(0, match.start)}==${body.slice(match.start, match.end)}==${body.slice(match.end)}`;
}

function findNormalizedMatch(body: string, normalizedNeedle: string): { start: number; end: number } | null {
  for (let start = 0; start < body.length; start += 1) {
    if (body[start]?.trim() === '') continue;
    let bodyIndex = start;
    let needleIndex = 0;

    while (bodyIndex < body.length && needleIndex < normalizedNeedle.length) {
      const bodyChar = body[bodyIndex];
      const needleChar = normalizedNeedle[needleIndex];

      if (/\s/.test(bodyChar) && needleChar === ' ') {
        while (bodyIndex < body.length && /\s/.test(body[bodyIndex])) bodyIndex += 1;
        needleIndex += 1;
        continue;
      }

      if (bodyChar !== needleChar) break;
      bodyIndex += 1;
      needleIndex += 1;
    }

    if (needleIndex === normalizedNeedle.length) {
      return { start, end: bodyIndex };
    }
  }

  return null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isAlreadyHighlighted(body: string, start: number, length: number): boolean {
  return body.slice(Math.max(0, start - 2), start) === '==' && body.slice(start + length, start + length + 2) === '==';
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeReaderStatus(value: unknown): ReaderStatus {
  if (value === 'irrelevant' || value === 'relevant' || value === 'high_relevant') return value;
  return 'unrated';
}
