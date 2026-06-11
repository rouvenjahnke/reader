import type { ArticleFrontmatter } from '@/types/article';

/**
 * Build a BibTeX entry from pipeline frontmatter. arXiv articles get the
 * eprint fields; everything else falls back to a plain @misc with url.
 */
export function buildBibtex(fm: ArticleFrontmatter): string {
  const year = extractYear(fm.published ?? fm.fetched);
  const key = citationKey(fm, year);
  const lines: string[] = [];

  lines.push(`@misc{${key},`);
  lines.push(`  title = {${escapeBibtex(fm.title)}},`);
  if (fm.author) lines.push(`  author = {${escapeBibtex(formatBibtexAuthors(fm.author))}},`);
  if (year) lines.push(`  year = {${year}},`);
  if (fm.arxiv_id) {
    lines.push(`  eprint = {${normalizeArxivId(fm.arxiv_id)}},`);
    lines.push(`  archivePrefix = {arXiv},`);
    if (fm.primary_category) lines.push(`  primaryClass = {${fm.primary_category}},`);
    lines.push(`  url = {https://arxiv.org/abs/${normalizeArxivId(fm.arxiv_id)}},`);
  } else if (fm.url) {
    lines.push(`  url = {${fm.url}},`);
  }

  // Strip the trailing comma from the last field line.
  const last = lines.length - 1;
  lines[last] = lines[last].replace(/,$/, '');
  lines.push('}');
  return lines.join('\n');
}

/** Plain-text one-line citation, e.g. for pasting into notes. */
export function buildPlainCitation(fm: ArticleFrontmatter): string {
  const year = extractYear(fm.published ?? fm.fetched);
  const parts: string[] = [];
  if (fm.author) parts.push(fm.author);
  if (year) parts.push(`(${year})`);
  parts.push(`"${fm.title}"`);
  if (fm.arxiv_id) parts.push(`arXiv:${normalizeArxivId(fm.arxiv_id)}`);
  else if (fm.source) parts.push(fm.source);
  if (!fm.arxiv_id && fm.url) parts.push(fm.url);
  return parts.join(' ');
}

export function normalizeArxivId(value: string): string {
  return value.trim().replace(/^arxiv:/i, '');
}

export function arxivAbsUrl(arxivId: string): string {
  return `https://arxiv.org/abs/${normalizeArxivId(arxivId)}`;
}

export function arxivPdfUrl(arxivId: string): string {
  return `https://arxiv.org/pdf/${normalizeArxivId(arxivId)}`;
}

function citationKey(fm: ArticleFrontmatter, year: string | undefined): string {
  const lastName = firstAuthorLastName(fm.author) ?? 'unknown';
  const firstWord =
    fm.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .find((word) => word.length > 3) ?? 'untitled';
  return `${lastName}${year ?? ''}${firstWord}`.replace(/[^a-z0-9]/gi, '');
}

function firstAuthorLastName(author: string | undefined): string | undefined {
  if (!author) return undefined;
  const first = author.split(/,|\band\b|&|;/)[0]?.trim();
  if (!first) return undefined;
  const tokens = first.split(/\s+/);
  return tokens[tokens.length - 1]?.toLowerCase();
}

/** "A B, C D" → "A B and C D" (BibTeX author separator). */
function formatBibtexAuthors(author: string): string {
  if (/\band\b/.test(author)) return author;
  return author
    .split(/,|;|&/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' and ');
}

function extractYear(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : undefined;
}

function escapeBibtex(value: string): string {
  return value.replace(/[{}]/g, '');
}
