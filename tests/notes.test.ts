import { describe, expect, it } from 'vitest';

import { parseArticle, setNote } from '@/lib/frontmatter';

const raw = `---
title: "Test"
tags:
  - math
---

# Body

Content stays put.
`;

describe('setNote', () => {
  it('writes note and timestamp into frontmatter without touching the body', () => {
    const updated = setNote(raw, 'Key idea: spectral gap.', new Date('2026-06-11T10:00:00.000Z'));
    expect(updated).toContain('reader_note: \'Key idea: spectral gap.\'');
    expect(updated).toContain("reader_note_updated_at: '2026-06-11T10:00:00.000Z'");
    expect(updated).toContain('Content stays put.');

    const parsed = parseArticle(updated);
    expect(parsed.frontmatter.reader_note).toBe('Key idea: spectral gap.');
    expect(parsed.frontmatter.reader_note_updated_at).toBe('2026-06-11T10:00:00.000Z');
  });

  it('trims whitespace before saving', () => {
    const updated = setNote(raw, '  padded  ', new Date('2026-06-11T10:00:00.000Z'));
    expect(parseArticle(updated).frontmatter.reader_note).toBe('padded');
  });

  it('removes note fields when the note is emptied', () => {
    const withNote = setNote(raw, 'temp', new Date('2026-06-11T10:00:00.000Z'));
    const cleared = setNote(withNote, '   ', new Date('2026-06-11T11:00:00.000Z'));
    expect(cleared).not.toContain('reader_note');
    expect(cleared).not.toContain('reader_note_updated_at');
    expect(parseArticle(cleared).frontmatter.reader_note).toBeUndefined();
  });
});
