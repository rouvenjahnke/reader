import { describe, expect, it } from 'vitest';

import { collectSources, filterAndSortArticles, nextUnratedAfter } from '@/lib/filters';
import type { ArticleSummary } from '@/types/article';

const articles: ArticleSummary[] = [
  {
    id: 'a',
    path: '/a.md',
    frontmatter: {
      title: 'Algebra',
      source: 'arXiv',
      author: 'Ada',
      published: '2026-05-19T00:00:00.000Z',
      score: 5,
      tags: ['math'],
      reader_status: 'unrated'
    }
  },
  {
    id: 'b',
    path: '/b.md',
    frontmatter: {
      title: 'AI paper',
      source: 'Blog',
      author: 'Bo',
      published: '2026-05-20T00:00:00.000Z',
      score: 9,
      tags: ['ai'],
      reader_status: 'relevant'
    }
  }
];

describe('filters', () => {
  it('filters by default unrated status', () => {
    expect(filterAndSortArticles(articles, { sortMode: 'newest', statuses: ['unrated'], sources: [], query: '' }).map((article) => article.id)).toEqual(['a']);
  });

  it('sorts by score', () => {
    expect(filterAndSortArticles(articles, { sortMode: 'score', statuses: ['unrated', 'relevant'], sources: [], query: '' }).map((article) => article.id)).toEqual(['b', 'a']);
  });

  it('filters with fuzzy search', () => {
    expect(filterAndSortArticles(articles, { sortMode: 'newest', statuses: ['unrated', 'relevant'], sources: [], query: 'algebra' }).map((article) => article.id)).toEqual(['a']);
  });

  it('collects sources', () => {
    expect(collectSources(articles)).toEqual(['arXiv', 'Blog']);
  });

  it('finds next unrated article', () => {
    expect(nextUnratedAfter(articles, 'b')?.id).toBe('a');
  });
});
