'use client';

import { ArrowLeft, ArrowRight, BookOpen, Check, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { queueRating, updateCachedRating } from '@/lib/cache';
import { applyPapersVisibility, dedupeArticles } from '@/lib/filters';
import { loadArticleCacheFirst, loadCachedSummaries } from '@/lib/sync';
import { useArticleStore } from '@/stores/useArticleStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import type { ArticleSummary, ReaderStatus } from '@/types/article';

const EXCERPT_LENGTH = 900;

/** Rough plain-text excerpt: strips markdown/math syntax for a skimmable preview. */
function excerptFromMarkdown(body: string): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' [math] ')
    .replace(/\$[^$\n]+\$/g, ' [math] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : EXCERPT_LENGTH)} …`;
}

export default function TriagePage(): React.ReactElement {
  const router = useRouter();
  const articles = useArticleStore((state) => state.articles);
  const hydrated = useArticleStore((state) => state.hydrated);
  const hydrateArticles = useArticleStore((state) => state.hydrateArticles);
  const updateSummary = useArticleStore((state) => state.updateSummary);

  // Snapshot the unrated queue once on first hydration so rating an article
  // does not reshuffle the deck mid-session. Ratings still update the store.
  const [queueIds, setQueueIds] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [excerpt, setExcerpt] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    void loadCachedSummaries().then((cached) => {
      if (cached.length > 0) hydrateArticles(cached);
    });
  }, [hydrated, hydrateArticles]);

  useEffect(() => {
    if (queueIds !== null || articles.length === 0) return;
    const unratedInput = applyPapersVisibility(articles, usePreferencesStore.getState().papersVisibility).filter(
      (article) => (article.frontmatter.reader_status ?? 'unrated') === 'unrated'
    );
    const { visible } = dedupeArticles(unratedInput, {
      showDuplicates: false
    });
    const unrated = visible.map((article) => article.id);
    setQueueIds(unrated);
  }, [articles, queueIds]);

  const byId = useMemo(() => new Map(articles.map((article) => [article.id, article] as const)), [articles]);
  const queue = queueIds ?? [];
  const current: ArticleSummary | undefined = byId.get(queue[index] ?? '');
  const remaining = queue.length - index;

  // Load a body preview for the current card (cache-first, fetch fallback).
  useEffect(() => {
    setExcerpt(undefined);
    if (!current) return;
    let cancelled = false;
    void loadArticleCacheFirst(current.id).then(({ article }) => {
      if (cancelled || !article) return;
      setExcerpt(excerptFromMarkdown(article.body));
    });
    return () => {
      cancelled = true;
    };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = () => setIndex((value) => value + 1);

  const rate = async (status: Exclude<ReaderStatus, 'unrated'>) => {
    if (!current || busy) return;
    setBusy(true);
    const ratedAt = new Date().toISOString();
    const updated: ArticleSummary = {
      ...current,
      frontmatter: { ...current.frontmatter, reader_status: status, reader_rated_at: ratedAt }
    };
    updateSummary(updated);
    void updateCachedRating(current.id, status, ratedAt).catch(() => undefined);

    try {
      const response = await fetch(`/api/articles/${current.id}/rate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      await queueRating({ id: current.id, path: current.path, status, createdAt: ratedAt }).catch(() => undefined);
    }

    setDone((value) => value + 1);
    setBusy(false);
    advance();
  };

  const rateRef = useRef(rate);
  rateRef.current = rate;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(event.target.tagName))) return;
      if (event.key === '1') void rateRef.current('irrelevant');
      if (event.key === '2') void rateRef.current('relevant');
      if (event.key === '3') void rateRef.current('high_relevant');
      if (event.key === 'ArrowRight') setIndex((value) => value + 1);
      if (event.key === 'Escape') router.push('/');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  const progressPct = queue.length > 0 ? Math.round((index / queue.length) * 100) : 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col px-4 py-6">
      <header className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => router.push('/')} aria-label="Back to list">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-heading text-lg font-bold italic text-ink">Triage</h1>
        </div>
        <p className="font-meta text-xs tabular-nums text-mutedink">
          {remaining > 0 ? `${remaining} remaining · ${done} rated` : `${done} rated`}
        </p>
      </header>

      <div className="h-px w-full bg-hairline">
        <div className="h-px bg-accent transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {!current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          {queueIds === null ? (
            <p className="font-meta text-xs text-mutedink">Loading…</p>
          ) : (
            <>
              <p className="font-heading text-xl font-bold text-ink">∎</p>
              <p className="text-sm text-mutedink">
                {queue.length === 0 ? 'Nothing to triage — all articles are rated.' : `Done. ${done} article${done === 1 ? '' : 's'} rated.`}
              </p>
              <Button type="button" variant="secondary" onClick={() => router.push('/')}>
                Back to list
              </Button>
            </>
          )}
        </div>
      ) : (
        <article className="flex flex-1 flex-col gap-4 py-6 pb-32">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{index + 1} / {queue.length}</Badge>
            {current.frontmatter.source ? <Badge>{current.frontmatter.source}</Badge> : null}
            {(current.frontmatter.tags ?? []).slice(0, 3).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
            {typeof current.frontmatter.score === 'number' ? (
              <span className="ml-auto font-meta text-xs tabular-nums text-mutedink">score {current.frontmatter.score.toFixed(2)}</span>
            ) : null}
          </div>

          <h2 className="font-heading text-2xl font-bold leading-snug text-ink">{current.frontmatter.title}</h2>

          <p className="font-meta text-[11px] uppercase tracking-[0.08em] text-mutedink">
            {[current.frontmatter.author, current.frontmatter.published ?? current.frontmatter.fetched]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {excerpt === undefined ? (
            <p className="font-meta text-xs text-mutedink">Loading preview…</p>
          ) : excerpt ? (
            <p className="border-l-2 border-hairline pl-4 font-body text-[0.95rem] leading-relaxed text-ink/90">{excerpt}</p>
          ) : (
            <p className="font-meta text-xs text-mutedink">No preview available.</p>
          )}

          <Link
            href={`/article/${current.id}`}
            className="inline-flex w-fit items-center gap-2 text-sm text-accent underline decoration-hairline-strong underline-offset-4 hover:decoration-accent"
          >
            <BookOpen className="h-4 w-4" /> Read full article
          </Link>
        </article>
      )}

      {current ? (
        <div className="reader-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-paper px-3 pt-3">
          <div className="mx-auto grid max-w-[720px] grid-cols-4 gap-2 pb-3">
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void rate('irrelevant')}>
              <X className="h-4 w-4" /> <span className="hidden sm:inline">Irrelevant</span> <kbd className="font-meta text-[10px] opacity-70">1</kbd>
            </Button>
            <Button type="button" variant="positive" disabled={busy} onClick={() => void rate('relevant')}>
              <Check className="h-4 w-4" /> <span className="hidden sm:inline">Relevant</span> <kbd className="font-meta text-[10px] opacity-70">2</kbd>
            </Button>
            <Button type="button" variant="default" disabled={busy} onClick={() => void rate('high_relevant')}>
              <Star className="h-4 w-4" /> <span className="hidden sm:inline">High</span> <kbd className="font-meta text-[10px] opacity-70">3</kbd>
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={advance}>
              <ArrowRight className="h-4 w-4" /> <span className="hidden sm:inline">Skip</span>
            </Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
