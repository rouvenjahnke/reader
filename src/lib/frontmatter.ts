import matter from 'gray-matter';

import type { ArticleFrontmatter, ReaderStatus } from '@/types/article';

export function parseArticle(raw: string): { frontmatter: ArticleFrontmatter; body: string } {
  const parsed = parseMatter(raw);
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
  const parsed = parseMatter(raw);
  parsed.data.reader_status = status;
  parsed.data.reader_rated_at = ratedAt.toISOString();
  return matter.stringify(parsed.content, parsed.data);
}

export interface HighlightOptions {
  /** Number of previous occurrences of the selected text seen in the rendered prefix before the selection start. */
  occurrenceIndex?: number;
}

export function addHighlight(raw: string, selectedText: string, options: HighlightOptions = {}): string {
  const text = selectedText.trim();
  if (!text) {
    throw new Error('Selection is empty.');
  }

  const parsed = parseMatter(raw);
  const highlighted = highlightFirstOccurrence(parsed.content, text, options);
  return matter.stringify(highlighted, parsed.data);
}

export function removeHighlight(raw: string, selectedText: string, options: HighlightOptions = {}): string {
  const text = selectedText.trim();
  if (!text) {
    throw new Error('Selection is empty.');
  }

  const parsed = parseMatter(raw);
  const updated = removeHighlightInBody(parsed.content, text, options);
  return matter.stringify(updated, parsed.data);
}

function parseMatter(raw: string): matter.GrayMatterFile<string> {
  try {
    return matter(raw);
  } catch (error) {
    const repaired = repairInvalidYamlEscapes(raw);
    if (repaired === raw) throw error;
    return matter(repaired);
  }
}

export function repairInvalidYamlEscapes(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return raw;

  const frontmatter = raw.slice(0, end);
  const body = raw.slice(end);
  const repaired = frontmatter.replace(/\\(?![0abtnvfre "\\/N_LPxuU\r\n])/g, '\\\\');
  return `${repaired}${body}`;
}

export function highlightFirstOccurrence(body: string, selectedText: string, options: HighlightOptions = {}): string {
  const needle = selectedText.trim();
  if (!needle) return body;

  const mathRange = findMathMatch(body, needle);
  if (mathRange) {
    return applyHighlight(body, mathRange.start, mathRange.end);
  }

  const range = locateRange(body, needle, options.occurrenceIndex ?? 0);
  if (!range) {
    throw new Error('Selection could not be located in the markdown.');
  }
  return applyHighlight(body, range.start, range.end);
}

export function removeHighlightInBody(body: string, selectedText: string, options: HighlightOptions = {}): string {
  const needle = selectedText.trim();
  if (!needle) return body;

  // First try math: locate the math range, then strip surrounding == if present.
  const mathRange = findMathMatch(body, needle);
  if (mathRange) {
    return stripMarkersAround(body, mathRange.start, mathRange.end);
  }

  const range = locateRange(body, needle, options.occurrenceIndex ?? 0);
  if (!range) {
    // Nothing to remove for this selection.
    return body;
  }

  return stripMarkersAround(body, range.start, range.end);
}

function applyHighlight(body: string, start: number, end: number): string {
  let s = start;
  let e = end;

  // If selection is immediately preceded/followed by existing markers, merge with them.
  if (body.slice(Math.max(0, s - 2), s) === '==') {
    s -= 2;
  }
  if (body.slice(e, e + 2) === '==') {
    e += 2;
  }

  const inner = body.slice(s, e).replace(/==/g, '');
  if (!inner.trim()) return body;
  return `${body.slice(0, s)}==${inner}==${body.slice(e)}`;
}

function stripMarkersAround(body: string, start: number, end: number): string {
  let s = start;
  let e = end;

  // Expand to include any enclosing == markers immediately around the range.
  if (body.slice(Math.max(0, s - 2), s) === '==') {
    s -= 2;
  }
  if (body.slice(e, e + 2) === '==') {
    e += 2;
  }

  // Find the surrounding `==...==` block by scanning outward if the immediate slice doesn't already include them.
  const widened = widenToEnclosingHighlight(body, s, e);
  if (widened) {
    s = widened.start;
    e = widened.end;
  }

  const inner = body.slice(s, e).replace(/==/g, '');
  return `${body.slice(0, s)}${inner}${body.slice(e)}`;
}

function widenToEnclosingHighlight(body: string, start: number, end: number): { start: number; end: number } | null {
  // If [start,end) is inside a single ==...== block, expand to that block boundaries.
  const before = body.lastIndexOf('==', start);
  if (before < 0) return null;
  const after = body.indexOf('==', end);
  if (after < 0) return null;

  // Ensure there is no `==` between the inner region and the outer markers.
  const between1 = body.slice(before + 2, start);
  const between2 = body.slice(end, after);
  if (between1.includes('==') || between2.includes('==')) return null;

  return { start: before, end: after + 2 };
}

interface StrippedBody {
  text: string;
  map: number[];
}

function stripHighlightMarkers(body: string): StrippedBody {
  let text = '';
  const map: number[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] === '=' && body[i + 1] === '=') {
      i += 2;
      continue;
    }
    map.push(i);
    text += body[i];
    i += 1;
  }
  map.push(body.length);
  return { text, map };
}

function locateRange(body: string, needle: string, occurrenceIndex: number): { start: number; end: number } | null {
  const stripped = stripHighlightMarkers(body);

  // Exact match (case-sensitive) – occurrence-aware
  let from = 0;
  let skipped = 0;
  while (true) {
    const idx = stripped.text.indexOf(needle, from);
    if (idx < 0) break;
    if (skipped >= occurrenceIndex) {
      return { start: stripped.map[idx], end: stripped.map[idx + needle.length] };
    }
    skipped += 1;
    from = idx + Math.max(1, needle.length);
  }

  // Whitespace-tolerant match: collapse whitespace in both sides and remap indices.
  const collapsed = collapseWhitespace(stripped.text);
  const collapsedNeedle = needle.replace(/\s+/g, ' ').trim();
  let cFrom = 0;
  let cSkipped = 0;
  while (true) {
    const cIdx = collapsed.text.indexOf(collapsedNeedle, cFrom);
    if (cIdx < 0) break;
    if (cSkipped >= occurrenceIndex) {
      const startStripped = collapsed.map[cIdx];
      const endStripped = collapsed.map[cIdx + collapsedNeedle.length];
      return { start: stripped.map[startStripped], end: stripped.map[endStripped] };
    }
    cSkipped += 1;
    cFrom = cIdx + Math.max(1, collapsedNeedle.length);
  }

  return null;
}

function collapseWhitespace(text: string): { text: string; map: number[] } {
  let out = '';
  const map: number[] = [];
  let i = 0;
  let lastWasSpace = false;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        out += ' ';
        map.push(i);
        lastWasSpace = true;
      }
      i += 1;
    } else {
      out += ch;
      map.push(i);
      lastWasSpace = false;
      i += 1;
    }
  }
  map.push(text.length);
  return { text: out, map };
}

function findMathMatch(body: string, selectedText: string): { start: number; end: number } | null {
  const math = parseSelectedMath(selectedText);
  if (!math) return null;

  const candidates = math.display
    ? findDisplayMathRanges(body)
    : [...findInlineMathRanges(body), ...findDisplayMathRanges(body)];
  const normalizedNeedle = normalizeMath(math.content);
  const matches = candidates.filter((candidate) => normalizeMath(candidate.content) === normalizedNeedle);

  return matches.length >= 1 ? { start: matches[0].start, end: matches[0].end } : null;
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

function normalizeMath(value: string): string {
  return value.replace(/\s+/g, '');
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
