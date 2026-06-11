import { describe, expect, it } from 'vitest';

import { arxivAbsUrl, arxivPdfUrl, buildBibtex, buildPlainCitation, normalizeArxivId } from '@/lib/citation';
import type { ArticleFrontmatter } from '@/types/article';

const arxivArticle: ArticleFrontmatter = {
  title: 'Attention Is All You Need',
  author: 'Ashish Vaswani, Noam Shazeer',
  published: '2017-06-12',
  arxiv_id: 'arXiv:1706.03762',
  primary_category: 'cs.CL'
};

const webArticle: ArticleFrontmatter = {
  title: 'A Blog Post {with braces}',
  author: 'Jane Doe',
  fetched: '2026-06-01T07:00:00.000Z',
  url: 'https://example.com/post',
  source: 'example'
};

describe('normalizeArxivId', () => {
  it('strips the arxiv: prefix case-insensitively', () => {
    expect(normalizeArxivId('arXiv:1706.03762')).toBe('1706.03762');
    expect(normalizeArxivId('ARXIV:2401.00001')).toBe('2401.00001');
    expect(normalizeArxivId(' 1706.03762 ')).toBe('1706.03762');
  });
});

describe('arxiv URLs', () => {
  it('builds abs and pdf URLs from prefixed ids', () => {
    expect(arxivAbsUrl('arXiv:1706.03762')).toBe('https://arxiv.org/abs/1706.03762');
    expect(arxivPdfUrl('1706.03762')).toBe('https://arxiv.org/pdf/1706.03762');
  });
});

describe('buildBibtex', () => {
  it('emits eprint fields for arXiv articles', () => {
    const bibtex = buildBibtex(arxivArticle);
    expect(bibtex).toContain('@misc{vaswani2017attention,');
    expect(bibtex).toContain('title = {Attention Is All You Need}');
    expect(bibtex).toContain('author = {Ashish Vaswani and Noam Shazeer}');
    expect(bibtex).toContain('eprint = {1706.03762}');
    expect(bibtex).toContain('archivePrefix = {arXiv}');
    expect(bibtex).toContain('primaryClass = {cs.CL}');
    expect(bibtex).toContain('url = {https://arxiv.org/abs/1706.03762}');
  });

  it('falls back to a plain @misc with url and escapes braces', () => {
    const bibtex = buildBibtex(webArticle);
    expect(bibtex).toContain('title = {A Blog Post with braces}');
    expect(bibtex).toContain('url = {https://example.com/post}');
    expect(bibtex).not.toContain('eprint');
  });

  it('terminates the entry without a trailing comma on the last field', () => {
    const lines = buildBibtex(webArticle).split('\n');
    expect(lines[lines.length - 1]).toBe('}');
    expect(lines[lines.length - 2].endsWith(',')).toBe(false);
  });

  it('handles missing author and date', () => {
    const bibtex = buildBibtex({ title: 'Untitled Mystery' });
    expect(bibtex).toContain('@misc{unknownuntitled,');
    expect(bibtex).toContain('title = {Untitled Mystery}');
  });
});

describe('buildPlainCitation', () => {
  it('formats arXiv articles with id', () => {
    const citation = buildPlainCitation(arxivArticle);
    expect(citation).toBe('Ashish Vaswani, Noam Shazeer (2017) "Attention Is All You Need" arXiv:1706.03762');
  });

  it('formats web articles with source and url', () => {
    const citation = buildPlainCitation(webArticle);
    expect(citation).toContain('Jane Doe (2026)');
    expect(citation).toContain('example');
    expect(citation).toContain('https://example.com/post');
  });
});
