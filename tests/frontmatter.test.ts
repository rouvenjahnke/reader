import { describe, expect, it } from 'vitest';

import { addHighlight, highlightFirstOccurrence, parseArticle, setRating } from '@/lib/frontmatter';

describe('frontmatter helpers', () => {
  const raw = `---
title: "Test"
score: "7.5"
reader_priority: true
reader_pinned: "yes"
tags:
  - math
---

# Body

This is selected text.
`;

  it('parses frontmatter and normalizes fields', () => {
    const parsed = parseArticle(raw);
    expect(parsed.frontmatter.title).toBe('Test');
    expect(parsed.frontmatter.score).toBe(7.5);
    expect(parsed.frontmatter.reader_priority).toBe(100);
    expect(parsed.frontmatter.reader_pinned).toBe(true);
    expect(parsed.frontmatter.reader_status).toBe('unrated');
    expect(parsed.body).toContain('selected text');
  });

  it('sets rating without changing body text', () => {
    const updated = setRating(raw, 'relevant', new Date('2026-05-20T12:00:00.000Z'));
    expect(updated).toContain('reader_status: relevant');
    expect(updated).toContain("reader_rated_at: '2026-05-20T12:00:00.000Z'");
    expect(updated).toContain('This is selected text.');
  });

  it('adds Obsidian markdown highlights', () => {
    const updated = addHighlight(raw, 'selected text');
    expect(updated).toContain('This is ==selected text==.');
  });

  it('matches selected text across whitespace differences', () => {
    expect(highlightFirstOccurrence('alpha   beta\ngamma', 'alpha beta gamma')).toBe('==alpha   beta\ngamma==');
  });
});
