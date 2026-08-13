import { describe, expect, it } from 'vitest';

import {
  addHighlight,
  highlightFirstOccurrence,
  parseArticle,
  removeHighlight,
  removeHighlightInBody,
  setPaperStatus,
  setPinned,
  setRating
} from '@/lib/frontmatter';

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

  it('repairs invalid YAML escapes from LaTeX in quoted frontmatter', () => {
    const source = `---
title: "Trace functions over \\(\\mathbb{F}_{q^n}\\)"
---

Body`;
    const parsed = parseArticle(source);
    expect(parsed.frontmatter.title).toBe('Trace functions over \\(\\mathbb{F}_{q^n}\\)');
  });

  it('sets rating without changing body text', () => {
    const updated = setRating(raw, 'relevant', new Date('2026-05-20T12:00:00.000Z'));
    expect(updated).toContain('reader_status: relevant');
    expect(updated).toContain("reader_rated_at: '2026-05-20T12:00:00.000Z'");
    expect(updated).toContain('This is selected text.');
  });

  it('uses deliberate pinning and removes a legacy automatic rank', () => {
    const pinned = setPinned(raw, true, 'openclaw', new Date('2026-08-13T08:00:00.000Z'));
    const parsed = parseArticle(pinned);
    expect(parsed.frontmatter.reader_pinned).toBe(true);
    expect(parsed.frontmatter.reader_pinned_by).toBe('openclaw');
    expect(parsed.frontmatter.reader_pinned_at).toBe('2026-08-13T08:00:00.000Z');
    expect(parsed.frontmatter.reader_priority).toBeUndefined();

    expect(parseArticle(setPinned(pinned, false)).frontmatter.reader_pinned).toBeUndefined();
  });

  it('sets a paper workflow status', () => {
    const updated = setPaperStatus(raw, 'reading', new Date('2026-08-13T09:00:00.000Z'));
    const parsed = parseArticle(updated);
    expect(parsed.frontmatter.paper_status).toBe('reading');
    expect(parsed.frontmatter.paper_status_updated_at).toBe('2026-08-13T09:00:00.000Z');
  });

  it('clamps pipeline scores to the documented 0-10 range', () => {
    expect(parseArticle('---\ntitle: High\nscore: 108\ncontent_score: -2\n---\n').frontmatter).toMatchObject({ score: 10, content_score: 0 });
  });

  it('normalizes paper provenance used by the watchlist UI', () => {
    const paper = parseArticle(`---
title: Watched paper
source_priority: "9"
scoring_version: content-85_source-15_v1
matched_authors: [Peter Scholze]
matched_topics: [Prismatic cohomology]
paper_status: reference
---
`).frontmatter;
    expect(paper).toMatchObject({
      source_priority: 9,
      scoring_version: 'content-85_source-15_v1',
      matched_authors: ['Peter Scholze'],
      matched_topics: ['Prismatic cohomology'],
      paper_status: 'reference'
    });
  });

  it('adds Obsidian markdown highlights', () => {
    const updated = addHighlight(raw, 'selected text');
    expect(updated).toContain('This is ==selected text==.');
  });

  it('highlights markdown link text without touching the url', () => {
    expect(highlightFirstOccurrence('Read [Example](https://example.com) now.', 'Example')).toBe('Read [==Example==](https://example.com) now.');
  });

  it('highlights selections spanning markdown links', () => {
    expect(highlightFirstOccurrence('Read [Example](https://example.com) now.', 'Read Example now')).toBe('==Read [Example](https://example.com) now==.');
  });

  it('does not count hidden markdown link destinations as rendered occurrences', () => {
    expect(highlightFirstOccurrence('Read [Example](https://example.com/example) and Example later.', 'Example', { occurrenceIndex: 1 })).toBe(
      'Read [Example](https://example.com/example) and ==Example== later.'
    );
  });

  it('matches selected text across whitespace differences', () => {
    expect(highlightFirstOccurrence('alpha   beta\ngamma', 'alpha beta gamma')).toBe('==alpha   beta\ngamma==');
  });

  it('matches rendered display math back to markdown math source', () => {
    expect(highlightFirstOccurrence('Before\n$$\n\\int_0^1 x dx\n$$\nAfter', '$$\\int_0^1 x dx$$')).toBe('Before\n==$$\n\\int_0^1 x dx\n$$==\nAfter');
  });

  it('matches rendered inline math back to markdown math source', () => {
    expect(highlightFirstOccurrence('This is $ x^2 + 1 $ in text.', '$x^2+1$')).toBe('This is ==$ x^2 + 1 $== in text.');
  });

  it('merges new highlight with adjacent existing one', () => {
    expect(highlightFirstOccurrence('foo ==bar== baz', 'bar baz')).toBe('foo ==bar baz==');
  });

  it('dissolves nested markers inside the new range', () => {
    expect(highlightFirstOccurrence('one ==two== three ==four== five', 'two three four')).toBe('one ==two three four== five');
  });

  it('idempotent re-highlight on the same already-highlighted text', () => {
    expect(highlightFirstOccurrence('alpha ==beta== gamma', 'beta')).toBe('alpha ==beta== gamma');
  });

  it('uses occurrence index to pick the Nth match', () => {
    expect(highlightFirstOccurrence('cat then cat again', 'cat', { occurrenceIndex: 1 })).toBe('cat then ==cat== again');
  });

  it('skips already-highlighted occurrences when counting', () => {
    expect(highlightFirstOccurrence('==cat== then cat again', 'cat', { occurrenceIndex: 1 })).toBe('==cat== then ==cat== again');
  });

  it('removes a highlight by selection text', () => {
    expect(removeHighlightInBody('alpha ==beta== gamma', 'beta')).toBe('alpha beta gamma');
  });

  it('removes a highlight when the selection covers a subset of it', () => {
    expect(removeHighlightInBody('alpha ==beta gamma delta== epsilon', 'gamma')).toBe('alpha beta gamma delta epsilon');
  });

  it('removes a highlight via removeHighlight wrapper that preserves frontmatter', () => {
    const source = `---\ntitle: T\n---\n\nalpha ==beta== gamma`;
    const out = removeHighlight(source, 'beta');
    expect(out).toContain('alpha beta gamma');
    expect(out).toContain('title: T');
  });

  it('finds and highlights math even when other highlights are present', () => {
    expect(highlightFirstOccurrence('text ==before== and $x^2$ after', '$x^2$')).toBe('text ==before== and ==$x^2$== after');
  });

  it('highlights selection containing math source representation', () => {
    expect(highlightFirstOccurrence('Let $x$ be the variable here.', 'Let $x$ be')).toBe('==Let $x$ be== the variable here.');
  });
});
