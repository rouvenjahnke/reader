# Preprint Reader — Redesign & Feature Expansion

Date: 2026-06-11 · Status: approved by user

## Goal

Give the reader PWA the habitus of a mathematics/AI research tool — a LaTeX-preprint
look — while keeping every existing function (offline-first sync, highlighting,
rating, dedup, Galois priority, prefetch) untouched, and adding eight feature packages.

## Visual system ("Preprint / LaTeX")

- **Headings & titles:** `KaTeX_Main` (Computer Modern), already bundled by KaTeX — 0 KB extra.
- **Body text:** STIX Two Text via `next/font/google` (self-hosted at build, offline-safe).
- **Metadata / keyboard hints:** JetBrains Mono via `next/font/google`, small sizes.
- **Colors:** paper `#faf8f3` / warm ink; dark mode = warm black. Accent: hyperref-style
  blue (light `#1a4fa0`, dark `#8ab4f8`). Highlights stay yellow. LaTeX `darkred` for
  destructive actions, dark green for positive.
- **Layout:** no cards. Hairline rules between list rows (like a table of contents).
  Badges in "theorem style": tiny mono, letterspaced, hairline border. `rounded-sm`
  corners everywhere. Footnote-style metadata lines: `Vaswani et al. · arXiv · 8.7 · 12 min`.

## New features

1. **Command palette** (`Ctrl/⌘K`): fuzzy article search (Fuse.js) + actions
   (views, sort, filter toggles, theme, sync via window event).
2. **arXiv tools** in reader: abs/PDF links, copy BibTeX, copy plain citation.
   New `lib/citation.ts` generates `@misc{...}` from frontmatter.
3. **Notes per article:** `reader_note` (+ `reader_note_updated_at`) in frontmatter.
   New endpoint `POST /api/articles/[id]/note`, offline queue `pending_notes`
   (IndexedDB v3), textarea section in the reader, debounced optimistic save.
4. **Table of contents** in reader: headings parsed from markdown, slug ids assigned
   in `MarkdownRenderer`, scroll-spy via IntersectionObserver, overlay panel.
5. **Triage mode** (`/triage`): one unrated article at a time (title + body preview
   from cache), rate via buttons/1/2/3, progress counter, auto-advance.
6. **Library** (`/library`): relevant + high_relevant articles grouped by tag /
   source / month.
7. **Stats upgrade:** GitHub-style activity heatmap from `reader_rated_at`,
   current/longest streak, in settings.
8. **Obsidian deep link:** `obsidian://open?vault=…&file=…` button in reader;
   new prefs `obsidianVault`, `obsidianPipelinePath`.

Navigation: home header gets Triage / Library links + ⌘K + settings. New shortcuts:
`t` triage, `b` library, `/` search (home); `n` note, `o` original (reader).

## Untouched

Sync architecture, highlight location logic, dedup, prefetch worker, Galois priority,
rating flow, service worker config.

## Risks / decisions

- Notes are stored in frontmatter (same write path as ratings — pipeline already
  tolerates `reader_status`).
- `react-window` rows keep a fixed `itemSize`; the new row design is sized to fit.
- Obsidian file path is derived from the article path segment after the configured
  pipeline folder; configurable in settings because the vault mapping is unknowable
  client-side.

## Verification

`npm test` and `npm run build` after each phase; conventional commits per phase.
