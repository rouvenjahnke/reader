import { describe, expect, it } from 'vitest';

import {
  applyPapersVisibility,
  collectSources,
  collectTags,
  dedupeArticles,
  estimateReadingMinutes,
  filterAndSortArticles,
  isGalois,
  nextUnratedAfter,
  priorityValue
} from '@/lib/filters';
import type { ArticleFilters, ArticleSummary } from '@/types/article';

const baseFilters: ArticleFilters = {
  sortMode: 'newest',
  statuses: ['unrated'],
  sources: [],
  tags: [],
  query: '',
  galoisOnly: false,
  newTodayOnly: false,
  showDuplicates: false
};

const articles: ArticleSummary[] = [
  {
    id: 'a',
    path: '/a.md',
    frontmatter: {
      title: 'Algebra fundamentals',
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
  },
  {
    id: 'c',
    path: '/c.md',
    frontmatter: {
      title: 'Galois capture',
      source: 'galois',
      author: 'Cara',
      published: '2026-05-18T00:00:00.000Z',
      score: 1,
      tags: ['capture'],
      reader_status: 'unrated',
      reader_priority: 200
    }
  }
];

describe('filters', () => {
  it('filters by default unrated status', () => {
    expect(filterAndSortArticles(articles, baseFilters).map((article) => article.id)).toEqual(['c', 'a']);
  });

  it('sorts by score', () => {
    expect(filterAndSortArticles(articles, { ...baseFilters, sortMode: 'score', statuses: ['unrated', 'relevant'] }).map((article) => article.id)).toEqual(['c', 'b', 'a']);
  });

  it('filters with fuzzy search', () => {
    expect(filterAndSortArticles(articles, { ...baseFilters, statuses: ['unrated', 'relevant'], query: 'algebra' }).map((article) => article.id)).toEqual(['a']);
  });

  it('collects sources', () => {
    expect(collectSources(articles)).toEqual(['arXiv', 'Blog', 'galois']);
  });

  it('filters by tags', () => {
    expect(filterAndSortArticles(articles, { ...baseFilters, statuses: ['unrated', 'relevant'], tags: ['ai'] }).map((article) => article.id)).toEqual(['b']);
  });

  it('collects tags', () => {
    expect(collectTags(articles)).toEqual(['ai', 'capture', 'math']);
  });

  it('galoisOnly filter restricts to galois source', () => {
    expect(filterAndSortArticles(articles, { ...baseFilters, statuses: ['unrated', 'relevant'], galoisOnly: true }).map((article) => article.id)).toEqual(['c']);
  });

  it('finds next unrated article', () => {
    expect(nextUnratedAfter(articles, 'b')?.id).toBe('c');
  });

  it('does not pin priority articles when pinPriorityOnTop=false', () => {
    expect(
      filterAndSortArticles(articles, { ...baseFilters, statuses: ['unrated', 'relevant'] }, { pinPriorityOnTop: false }).map((article) => article.id)
    ).toEqual(['b', 'a', 'c']);
  });

  it('pins priority articles by default even when sorted by newest', () => {
    expect(
      filterAndSortArticles(articles, { ...baseFilters, statuses: ['unrated', 'relevant'] }).map((article) => article.id)
    ).toEqual(['c', 'b', 'a']);
  });
});

describe('priorityValue', () => {
  it('honours reader_priority on every source', () => {
    const galois: ArticleSummary = { ...articles[2] };
    const nonGalois: ArticleSummary = {
      ...articles[2],
      id: 'd',
      path: '/d.md',
      frontmatter: { ...articles[2].frontmatter, source: 'arXiv' }
    };
    expect(priorityValue(galois)).toBe(200);
    expect(priorityValue(nonGalois)).toBe(200);
    expect(isGalois(galois)).toBe(true);
    expect(isGalois(nonGalois)).toBe(false);
  });

  it('treats reader_pinned as priority 100 regardless of source', () => {
    const pinnedGalois: ArticleSummary = {
      id: 'g1',
      path: '/g1.md',
      frontmatter: { title: 'x', source: 'galois', reader_pinned: true }
    };
    const pinnedOther: ArticleSummary = {
      id: 'g2',
      path: '/g2.md',
      frontmatter: { title: 'x', source: 'arXiv', reader_pinned: true }
    };
    expect(priorityValue(pinnedGalois)).toBe(100);
    expect(priorityValue(pinnedOther)).toBe(100);
  });
});

describe('applyPapersVisibility', () => {
  const pipeline: ArticleSummary = { id: 'p1', path: '/pipeline/a.md', frontmatter: { title: 'Pipeline article' } };
  const paper: ArticleSummary = { id: 'x1', path: '/papers/b.md', collection: 'papers', frontmatter: { title: 'Starred paper' } };
  const mixed = [pipeline, paper];

  it('keeps everything when shown', () => {
    expect(applyPapersVisibility(mixed, 'shown')).toEqual(mixed);
  });

  it('restricts to papers when only', () => {
    expect(applyPapersVisibility(mixed, 'only').map((article) => article.id)).toEqual(['x1']);
  });

  it('removes papers when hidden', () => {
    expect(applyPapersVisibility(mixed, 'hidden').map((article) => article.id)).toEqual(['p1']);
  });

  it('is a no-op for sets without papers', () => {
    expect(applyPapersVisibility([pipeline], 'only')).toEqual([]);
    expect(applyPapersVisibility([pipeline], 'hidden')).toEqual([pipeline]);
  });
});

describe('dedupeArticles', () => {
  it('groups by arxiv_id and keeps the highest-rated winner', () => {
    const input: ArticleSummary[] = [
      { id: '1', path: '/p1.md', frontmatter: { title: 'Paper', arxiv_id: '2401.12345v1', reader_status: 'unrated', published: '2026-01-01' } },
      { id: '2', path: '/p2.md', frontmatter: { title: 'Paper', arxiv_id: '2401.12345v2', reader_status: 'relevant', published: '2026-02-01' } }
    ];
    const result = dedupeArticles(input);
    expect(result.duplicateCount).toBe(1);
    expect(result.visible).toHaveLength(1);
    expect(result.visible[0].id).toBe('2');
    expect(result.visible[0].duplicates).toHaveLength(1);
    expect(result.visible[0].duplicates?.[0].id).toBe('1');
  });

  it('groups by normalized url, ignoring tracking params', () => {
    const input: ArticleSummary[] = [
      { id: 'a', path: '/a.md', frontmatter: { title: 'Same article one', url: 'https://example.com/post?utm_source=twitter' } },
      { id: 'b', path: '/b.md', frontmatter: { title: 'Same article two', url: 'https://example.com/post' } }
    ];
    const result = dedupeArticles(input);
    expect(result.duplicateCount).toBe(1);
    expect(result.visible).toHaveLength(1);
  });

  it('groups by normalized title+source when ids/urls are missing', () => {
    const input: ArticleSummary[] = [
      { id: 'a', path: '/a.md', frontmatter: { title: 'Quantum Field Theory', source: 'arXiv' } },
      { id: 'b', path: '/b.md', frontmatter: { title: 'Quantum field theory', source: 'arXiv' } }
    ];
    const result = dedupeArticles(input);
    expect(result.duplicateCount).toBe(1);
    expect(result.visible).toHaveLength(1);
  });

  it('keeps duplicates visible when showDuplicates is true', () => {
    const input: ArticleSummary[] = [
      { id: 'a', path: '/a.md', frontmatter: { title: 'Same', arxiv_id: '1' } },
      { id: 'b', path: '/b.md', frontmatter: { title: 'Same', arxiv_id: '1' } }
    ];
    const result = dedupeArticles(input, { showDuplicates: true });
    expect(result.visible).toHaveLength(2);
    expect(result.duplicateCount).toBe(1);
  });
});

describe('estimateReadingMinutes', () => {
  it('returns 1 for short text', () => {
    expect(estimateReadingMinutes('hello world')).toBe(1);
  });

  it('scales with word count', () => {
    const body = 'word '.repeat(2200);
    expect(estimateReadingMinutes(body)).toBe(10);
  });

  it('ignores code blocks and math', () => {
    const body = '```\n' + 'noise '.repeat(2000) + '\n```\nhello world';
    expect(estimateReadingMinutes(body)).toBe(1);
  });
});
