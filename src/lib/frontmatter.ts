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
      reader_priority: normalizeReaderPriority(data.reader_priority),
      reader_pinned: normalizeBoolean(data.reader_pinned),
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

  const mathMatch = findMathMatch(body, needle);
  if (mathMatch && !isAlreadyHighlighted(body, mathMatch.start, mathMatch.end - mathMatch.start)) {
    return `${body.slice(0, mathMatch.start)}==${body.slice(mathMatch.start, mathMatch.end)}==${body.slice(mathMatch.end)}`;
  }

  const normalizedNeedle = normalizeWhitespace(needle);
  const match = findNormalizedMatch(body, normalizedNeedle);
  if (!match || isAlreadyHighlighted(body, match.start, match.end - match.start)) {
    throw new Error('Der markierte Text wurde im Markdown nicht eindeutig gefunden.');
  }

  return `${body.slice(0, match.start)}==${body.slice(match.start, match.end)}==${body.slice(match.end)}`;
}

function findMathMatch(body: string, selectedText: string): { start: number; end: number } | null {
  const math = parseSelectedMath(selectedText);
  if (!math) return null;

  const candidates = math.display ? findDisplayMathRanges(body) : [...findInlineMathRanges(body), ...findDisplayMathRanges(body)];
  const normalizedNeedle = normalizeMath(math.content);
  const matches = candidates.filter((candidate) => normalizeMath(candidate.content) === normalizedNeedle);

  return matches.length === 1 ? { start: matches[0].start, end: matches[0].end } : null;
}

function parseSelectedMath(value: string): { content: string; display: boolean } | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    return { content: trimmed.slice(2, -2), display: true };
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    return { content: trimmed.slice(1, -1), display: false };
  }
  return null;
}

function findDisplayMathRanges(body: string): Array<{ start: number; end: number; content: string }> {
  const ranges: Array<{ start: number; end: number; content: string }> = [];
  const pattern = /\$\$([\s\S]*?)\$\$/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length, content: match[1] });
  }
  return ranges;
}

function findInlineMathRanges(body: string): Array<{ start: number; end: number; content: string }> {
  const ranges: Array<{ start: number; end: number; content: string }> = [];

  for (let index = 0; index < body.length; index += 1) {
    if (body[index] !== '$' || body[index + 1] === '$' || body[index - 1] === '\\') continue;
    const start = index;
    index += 1;
    let content = '';

    while (index < body.length) {
      if (body[index] === '$' && body[index - 1] !== '\\' && body[index + 1] !== '$') {
        ranges.push({ start, end: index + 1, content });
        break;
      }
      content += body[index];
      index += 1;
    }
  }

  return ranges;
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

function normalizeMath(value: string): string {
  return value.replace(/\s+/g, '');
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

function normalizeReaderPriority(value: unknown): number | undefined {
  if (value === true) return 100;
  return normalizeNumber(value);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'ja', '1'].includes(normalized)) return true;
    if (['false', 'no', 'nein', '0'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeReaderStatus(value: unknown): ReaderStatus {
  if (value === 'irrelevant' || value === 'relevant' || value === 'high_relevant') return value;
  return 'unrated';
}
