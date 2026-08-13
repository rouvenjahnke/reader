import matter from 'gray-matter';

import type { ArticleFrontmatter, PaperStatus, ReaderStatus } from '@/types/article';

export function parseArticle(raw: string): { frontmatter: ArticleFrontmatter; body: string } {
  const parsed = parseMatter(raw);
  const data = parsed.data as Record<string, unknown>;

  return {
    frontmatter: {
      ...data,
      title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Ohne Titel',
      url: normalizeString(data.url),
      source: normalizeString(data.source),
      author: normalizeString(data.author),
      authors: normalizeStringArray(data.authors),
      arxiv_id: normalizeString(data.arxiv_id),
      doi: normalizeString(data.doi),
      pdf_url: normalizeString(data.pdf_url),
      html_url: normalizeString(data.html_url),
      published: normalizeString(data.published),
      fetched: normalizeString(data.fetched),
      tags: normalizeTags(data.tags),
      score: normalizeScore(data.score),
      content_score: normalizeScore(data.content_score),
      source_priority: normalizeScore(data.source_priority),
      scoring_version: normalizeString(data.scoring_version),
      priority: normalizeNumber(data.priority),
      all_categories: normalizeStringArray(data.all_categories),
      matched_authors: normalizeStringArray(data.matched_authors),
      matched_topics: normalizeStringArray(data.matched_topics),
      key_concepts: normalizeStringArray(data.key_concepts),
      reader_priority: normalizeReaderPriority(data.reader_priority),
      reader_pinned: normalizeBoolean(data.reader_pinned),
      reader_pinned_by: normalizeString(data.reader_pinned_by),
      reader_pinned_at: normalizeString(data.reader_pinned_at),
      reader_status: normalizeReaderStatus(data.reader_status),
      paper_status: normalizePaperStatus(data.paper_status),
      paper_status_updated_at: normalizeString(data.paper_status_updated_at),
      reader_note: normalizeString(data.reader_note)
    },
    body: parsed.content
  };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

export function setRating(raw: string, status: Exclude<ReaderStatus, 'unrated'>, ratedAt = new Date()): string {
  const parsed = parseMatter(raw);
  parsed.data.reader_status = status;
  parsed.data.reader_rated_at = ratedAt.toISOString();
  return matter.stringify(parsed.content, parsed.data);
}

export function setPinned(raw: string, pinned: boolean, by = 'reader', updatedAt = new Date()): string {
  const parsed = parseMatter(raw);
  if (pinned) {
    parsed.data.reader_pinned = true;
    parsed.data.reader_pinned_by = by.trim() || 'reader';
    parsed.data.reader_pinned_at = updatedAt.toISOString();
  } else {
    delete parsed.data.reader_pinned;
    delete parsed.data.reader_pinned_by;
    delete parsed.data.reader_pinned_at;
  }
  // Automatic numeric ranking is obsolete. A deliberate pin is the only priority signal.
  delete parsed.data.reader_priority;
  return matter.stringify(parsed.content, parsed.data);
}

export function setPaperStatus(raw: string, status: PaperStatus, updatedAt = new Date()): string {
  const parsed = parseMatter(raw);
  parsed.data.paper_status = status;
  parsed.data.paper_status_updated_at = updatedAt.toISOString();
  return matter.stringify(parsed.content, parsed.data);
}

/** Set or clear the personal note. An empty note removes both fields. */
export function setNote(raw: string, note: string, updatedAt = new Date()): string {
  const parsed = parseMatter(raw);
  const trimmed = note.trim();
  if (trimmed) {
    parsed.data.reader_note = trimmed;
    parsed.data.reader_note_updated_at = updatedAt.toISOString();
  } else {
    delete parsed.data.reader_note;
    delete parsed.data.reader_note_updated_at;
  }
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

interface MappedText {
  text: string;
  starts: number[];
  ends: number[];
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
  const rendered = buildRenderedMarkdownMap(stripped.text);
  const renderedRange = locateInMappedText(rendered, needle, occurrenceIndex, stripped.map);
  if (renderedRange) return renderedRange;

  const source = buildIdentityMap(stripped.text);
  return locateInMappedText(source, needle, occurrenceIndex, stripped.map);
}

function locateInMappedText(mapped: MappedText, needle: string, occurrenceIndex: number, sourceMap: number[]): { start: number; end: number } | null {
  let from = 0;
  let skipped = 0;
  while (true) {
    const idx = mapped.text.indexOf(needle, from);
    if (idx < 0) break;
    if (skipped >= occurrenceIndex) {
      return mappedRange(mapped, idx, needle.length, sourceMap);
    }
    skipped += 1;
    from = idx + Math.max(1, needle.length);
  }

  const collapsed = collapseMappedWhitespace(mapped);
  const collapsedNeedle = needle.replace(/\s+/g, ' ').trim();
  let cFrom = 0;
  let cSkipped = 0;
  while (true) {
    const cIdx = collapsed.text.indexOf(collapsedNeedle, cFrom);
    if (cIdx < 0) break;
    if (cSkipped >= occurrenceIndex) {
      return mappedRange(collapsed, cIdx, collapsedNeedle.length, sourceMap);
    }
    cSkipped += 1;
    cFrom = cIdx + Math.max(1, collapsedNeedle.length);
  }

  return null;
}

function mappedRange(mapped: MappedText, start: number, length: number, sourceMap: number[]): { start: number; end: number } | null {
  if (length <= 0) return null;
  const end = start + length - 1;
  const sourceStart = mapped.starts[start];
  const sourceEnd = mapped.ends[end];
  if (sourceStart === undefined || sourceEnd === undefined) return null;
  return { start: sourceMap[sourceStart], end: sourceMap[sourceEnd] };
}

function buildIdentityMap(text: string): MappedText {
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    starts.push(index);
    ends.push(index + 1);
  }
  return { text, starts, ends };
}

function collapseMappedWhitespace(mapped: MappedText): MappedText {
  let out = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < mapped.text.length; i += 1) {
    const ch = mapped.text[i];
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        out += ' ';
        starts.push(mapped.starts[i]);
        ends.push(mapped.ends[i]);
        lastWasSpace = true;
      } else {
        ends[ends.length - 1] = mapped.ends[i];
      }
    } else {
      out += ch;
      starts.push(mapped.starts[i]);
      ends.push(mapped.ends[i]);
      lastWasSpace = false;
    }
  }
  return { text: out, starts, ends };
}

function buildRenderedMarkdownMap(source: string): MappedText {
  const text: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];

  const append = (index: number) => {
    text.push(source[index]);
    starts.push(index);
    ends.push(index + 1);
  };

  const walk = (start: number, end: number) => {
    let index = start;
    while (index < end) {
      const link = parseMarkdownLink(source, index, end);
      if (link) {
        walk(link.labelStart, link.labelEnd);
        index = link.end;
        continue;
      }

      append(index);
      index += 1;
    }
  };

  walk(0, source.length);
  return { text: text.join(''), starts, ends };
}

function parseMarkdownLink(source: string, start: number, limit: number): { labelStart: number; labelEnd: number; end: number } | null {
  if (source[start] !== '[' || source[start - 1] === '!') return null;

  const labelEnd = findClosingBracket(source, start + 1, limit);
  if (labelEnd < 0) return null;

  const next = labelEnd + 1;
  if (source[next] === '(') {
    const destinationEnd = findClosingParen(source, next + 1, limit);
    if (destinationEnd >= 0) {
      return { labelStart: start + 1, labelEnd, end: destinationEnd + 1 };
    }
  }

  if (source[next] === '[') {
    const referenceEnd = findClosingBracket(source, next + 1, limit);
    if (referenceEnd >= 0) {
      return { labelStart: start + 1, labelEnd, end: referenceEnd + 1 };
    }
  }

  return null;
}

function findClosingBracket(source: string, start: number, limit: number): number {
  let depth = 0;
  let escaped = false;
  for (let index = start; index < limit; index += 1) {
    const ch = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '[') {
      depth += 1;
      continue;
    }
    if (ch === ']') {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findClosingParen(source: string, start: number, limit: number): number {
  let depth = 0;
  let escaped = false;
  for (let index = start; index < limit; index += 1) {
    const ch = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
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
  return normalizeStringArray(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
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

function normalizeScore(value: unknown): number | undefined {
  const score = normalizeNumber(value);
  if (score === undefined) return undefined;
  return Math.max(0, Math.min(10, score));
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

function normalizePaperStatus(value: unknown): PaperStatus {
  if (value === 'skimmed' || value === 'reading' || value === 'reference' || value === 'dismissed') return value;
  return 'inbox';
}
