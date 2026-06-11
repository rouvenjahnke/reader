import { describe, expect, it } from 'vitest';

import { buildObsidianUri, slugifyHeading } from '@/lib/obsidian';

describe('buildObsidianUri', () => {
  it('returns null when the vault is not configured', () => {
    expect(buildObsidianUri('', 'inbox/pipeline', '/remote/inbox/pipeline/a.md')).toBeNull();
    expect(buildObsidianUri('   ', 'inbox/pipeline', '/remote/inbox/pipeline/a.md')).toBeNull();
  });

  it('derives the vault-relative file from the pipeline marker', () => {
    const uri = buildObsidianUri('My Vault', '00_inbox/reader-pipeline', '/remote.php/dav/files/u/00_inbox/reader-pipeline/2026/article.md');
    expect(uri).toBe(
      `obsidian://open?vault=${encodeURIComponent('My Vault')}&file=${encodeURIComponent('00_inbox/reader-pipeline/2026/article')}`
    );
  });

  it('falls back to the basename when the marker is absent', () => {
    const uri = buildObsidianUri('Vault', 'pipeline', '/somewhere/else/article.md');
    expect(uri).toBe(`obsidian://open?vault=Vault&file=${encodeURIComponent('pipeline/article')}`);
  });

  it('tolerates slashes around the pipeline path', () => {
    const uri = buildObsidianUri('Vault', '/pipeline/', '/base/pipeline/article.md');
    expect(uri).toBe(`obsidian://open?vault=Vault&file=${encodeURIComponent('pipeline/article')}`);
  });
});

describe('slugifyHeading', () => {
  it('lowercases, strips punctuation, and hyphenates', () => {
    expect(slugifyHeading('Hello, World!', new Set())).toBe('hello-world');
  });

  it('keeps unicode letters', () => {
    expect(slugifyHeading('Über Galois-Theorie', new Set())).toBe('über-galois-theorie');
  });

  it('falls back to "section" for symbol-only headings', () => {
    expect(slugifyHeading('→ ∞ §', new Set())).toBe('section');
  });

  it('dedupes with numeric suffixes', () => {
    const taken = new Set<string>();
    expect(slugifyHeading('Proof', taken)).toBe('proof');
    expect(slugifyHeading('Proof', taken)).toBe('proof-1');
    expect(slugifyHeading('Proof', taken)).toBe('proof-2');
  });
});
