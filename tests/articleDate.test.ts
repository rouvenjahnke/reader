import { describe, expect, it } from 'vitest';

import { publishedTimestamp } from '@/lib/articleDate';
import type { ArticleSummary } from '@/types/article';

function article(frontmatter: ArticleSummary['frontmatter']): ArticleSummary {
  return { id: 'article', path: '/article.md', frontmatter };
}

describe('publishedTimestamp', () => {
  it('reads a valid publication date', () => {
    expect(publishedTimestamp(article({ title: 'Article', published: '2026-06-11T09:00:00.000Z' }))).toBe(
      Date.parse('2026-06-11T09:00:00.000Z')
    );
  });

  it('does not fall back to fetched or file timestamps', () => {
    const input = {
      ...article({ title: 'Article', fetched: '2026-06-11T09:00:00.000Z' }),
      firstSeenAt: '2026-06-11T09:00:00.000Z',
      lastModified: '2026-06-11T09:00:00.000Z'
    };

    expect(publishedTimestamp(input)).toBeUndefined();
  });

  it('rejects an invalid publication date', () => {
    expect(publishedTimestamp(article({ title: 'Article', published: 'not-a-date' }))).toBeUndefined();
  });
});
