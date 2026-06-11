'use client';

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eraser,
  ExternalLink,
  FileDown,
  Highlighter,
  Keyboard,
  ListTree,
  NotebookPen,
  Quote,
  X
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { RatingActionBar } from '@/components/RatingActionBar';
import { SwipeContainer } from '@/components/SwipeContainer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { flushPendingQueues, queueHighlight, queueNote, queueRating, saveArticle, updateCachedBody, updateCachedNote, updateCachedRating } from '@/lib/cache';
import { arxivAbsUrl, arxivPdfUrl, buildBibtex, buildPlainCitation, normalizeArxivId } from '@/lib/citation';
import { estimateReadingMinutes, filterAndSortArticles, nextUnratedAfter, priorityValue } from '@/lib/filters';
import { highlightFirstOccurrence, removeHighlightInBody } from '@/lib/frontmatter';
import { buildObsidianUri, slugifyHeading } from '@/lib/obsidian';
import { appendSyncLog } from '@/lib/syncLog';
import { useArticleStore } from '@/stores/useArticleStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import type { Article, ReaderStatus } from '@/types/article';

interface Props {
  article: Article;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export function ArticleReader({ article: initialArticle }: Props): React.ReactElement {
  const router = useRouter();
  const [article, setArticle] = useState(initialArticle);
  const [selection, setSelectionState] = useState<{ text: string; occurrenceIndex: number; overlapsHighlight: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const scrollSaveRef = useRef<{ timer: number | null; pendingY: number }>({ timer: null, pendingY: 0 });
  const syncTimerRef = useRef<number | null>(null);
  const proseRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<{ text: string; occurrenceIndex: number; overlapsHighlight: boolean } | null>(null);
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const updateSummary = useArticleStore((state) => state.updateSummary);
  const setLastArticleId = useArticleStore((state) => state.setLastArticleId);
  const setArticleScrollPosition = useArticleStore((state) => state.setArticleScrollPosition);
  const pinGaloisOnTop = usePreferencesStore((state) => state.pinGaloisOnTop);
  const fontSize = usePreferencesStore((state) => state.fontSize);
  const showReadingProgress = usePreferencesStore((state) => state.showReadingProgress);
  const obsidianVault = usePreferencesStore((state) => state.obsidianVault);
  const obsidianPipelinePath = usePreferencesStore((state) => state.obsidianPipelinePath);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState(initialArticle.frontmatter.reader_note ?? '');
  const noteDraftRef = useRef(noteDraft);
  const readingMinutes = useMemo(() => estimateReadingMinutes(article.body), [article.body]);
  const ordered = useMemo(
    () => filterAndSortArticles(articles, filters, { pinGaloisOnTop }),
    [articles, filters, pinGaloisOnTop]
  );
  const currentIndex = ordered.findIndex((item) => item.id === article.id);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined;
  const tags = article.frontmatter.tags ?? [];
  const priority = priorityValue(article);
  const arxivId = article.frontmatter.arxiv_id;
  const obsidianUri = useMemo(
    () => buildObsidianUri(obsidianVault, obsidianPipelinePath, article.path),
    [obsidianVault, obsidianPipelinePath, article.path]
  );

  const saveNote = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      const current = (useArticleStore.getState().articles.find((item) => item.id === article.id)?.frontmatter.reader_note ?? '').trim();
      const previousNote = (article.frontmatter.reader_note ?? '').trim();
      if (trimmed === previousNote && trimmed === current) return;

      const updatedAt = new Date().toISOString();
      const optimistic: Article = {
        ...article,
        frontmatter: {
          ...article.frontmatter,
          reader_note: trimmed || undefined,
          reader_note_updated_at: trimmed ? updatedAt : undefined
        }
      };
      setArticle(optimistic);
      updateSummary(optimistic);
      await updateCachedNote(article.id, trimmed, updatedAt);

      try {
        if (!navigator.onLine) throw new Error('offline');
        const response = await fetch(`/api/articles/${article.id}/note`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note: trimmed })
        });
        if (!response.ok) throw new Error(await response.text());
        setFeedback({ tone: 'success', message: 'Note saved.' });
      } catch {
        await queueNote({ id: article.id, path: article.path, note: trimmed, updatedAt });
        setFeedback({ tone: 'info', message: 'Note queued for sync.' });
      }
    },
    [article, updateSummary]
  );

  const goTo = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      void saveNote(noteDraftRef.current);
      void flushPendingQueues();
      router.push(`/article/${id}`);
    },
    [router, saveNote]
  );

  const scheduleDeferredSync = useCallback(() => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void flushPendingQueues();
    }, 20_000);
  }, []);

  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    const proseRoot = proseRef.current;
    if (!sel || sel.rangeCount === 0 || !proseRoot) {
      // Don't clear the latch here — the browser routinely clears the selection
      // when the user taps the toolbar, and we want the action to still see the
      // last meaningful selection. The latch is invalidated when the action runs
      // or on article navigation / unmount.
      setSelectionState(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (range.collapsed || !proseRoot.contains(range.commonAncestorContainer)) {
      setSelectionState(null);
      return;
    }

    const markdownText = buildSelectionMarkdownSource(range);
    if (markdownText.trim().length <= 1) {
      setSelectionState(null);
      return;
    }

    const occurrenceIndex = countOccurrencesInPrefix(proseRoot, range, markdownText);
    const overlapsHighlight = rangeOverlapsHighlight(range);

    const snapshot = { text: markdownText, occurrenceIndex, overlapsHighlight };
    selectionRef.current = snapshot;
    setSelectionState(snapshot);
  }, []);

  const handleRate = useCallback(
    async (status: Exclude<ReaderStatus, 'unrated'>) => {
      if (busy || article.frontmatter.reader_status === status) return;
      const ratedAt = new Date().toISOString();
      const optimistic = {
        ...article,
        frontmatter: { ...article.frontmatter, reader_status: status, reader_rated_at: ratedAt }
      };
      setArticle(optimistic);
      updateSummary(optimistic);
      await updateCachedRating(article.id, status, ratedAt);

      setBusy(true);
      try {
        if (!navigator.onLine) throw new Error('offline');
        const response = await fetch(`/api/articles/${article.id}/rate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error(await response.text());
        const saved = (await response.json()) as Article;
        setArticle(saved);
        updateSummary(saved);
        await saveArticle(saved);
      } catch {
        await queueRating({ id: article.id, path: article.path, status, createdAt: ratedAt });
      } finally {
        setBusy(false);
        const target = nextUnratedAfter(ordered, article.id);
        if (target) router.push(`/article/${target.id}`);
      }
    },
    [article, busy, ordered, router, updateSummary]
  );

  const runHighlightAction = useCallback(
    async (action: 'add' | 'remove') => {
      const snapshot = selectionRef.current ?? selection;
      if (!snapshot || busy) return;
      const { text, occurrenceIndex } = snapshot;
      selectionRef.current = null;
      window.getSelection()?.removeAllRanges();
      setSelectionState(null);

      let optimisticBody: string;
      try {
        optimisticBody =
          action === 'add'
            ? highlightFirstOccurrence(article.body, text, { occurrenceIndex })
            : removeHighlightInBody(article.body, text, { occurrenceIndex });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        appendSyncLog('error', `Highlight ${action} failed locally: ${article.path} (${message})`);
        setFeedback({ tone: 'error', message: 'Selection could not be located in the markdown.' });
        return;
      }

      if (optimisticBody === article.body) {
        // No-op: nothing to highlight or remove. Stay silent.
        return;
      }

      setArticle((current) => ({ ...current, body: optimisticBody }));
      await updateCachedBody(article.id, optimisticBody);

      await queueHighlight({
        id: `${article.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        articleId: article.id,
        path: article.path,
        text,
        action,
        occurrenceIndex,
        createdAt: new Date().toISOString()
      });
      appendSyncLog('info', `Highlight ${action} queued: ${article.path}`);
      scheduleDeferredSync();
    },
    [article, busy, scheduleDeferredSync, selection]
  );

  const handleHighlight = useCallback(() => runHighlightAction('add'), [runHighlightAction]);
  const handleUnhighlight = useCallback(() => runHighlightAction('remove'), [runHighlightAction]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback({ tone: 'success', message: `${label} copied.` });
    } catch {
      setFeedback({ tone: 'error', message: `Could not copy ${label.toLowerCase()}.` });
    }
  }, []);

  useEffect(() => {
    noteDraftRef.current = noteDraft;
  }, [noteDraft]);

  useEffect(() => {
    setArticle(initialArticle);
    setSelectionState(null);
    selectionRef.current = null;
    setNoteDraft(initialArticle.frontmatter.reader_note ?? '');
    setTocOpen(false);
    setLastArticleId(initialArticle.id);
    const savedScrollY = useArticleStore.getState().articleScrollPositions[initialArticle.id] ?? 0;
    const restore = window.setTimeout(() => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(savedScrollY, maxY), behavior: 'auto' });
    }, 80);
    return () => window.clearTimeout(restore);
  }, [initialArticle, setLastArticleId]);

  // Assign stable slug ids to rendered headings and build the TOC from the DOM,
  // so TOC targets always match what is actually on screen (math, links, …).
  useEffect(() => {
    const root = proseRef.current;
    if (!root) return;
    const taken = new Set<string>();
    const entries: TocEntry[] = [];
    for (const heading of Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4'))) {
      const text = (heading.textContent ?? '').trim();
      if (!text) continue;
      const id = slugifyHeading(text, taken);
      heading.id = id;
      entries.push({ id, text, level: Number(heading.tagName.slice(1)) });
    }
    setToc(entries);

    if (entries.length === 0) return;
    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveHeading(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' }
    );
    for (const entry of entries) {
      const el = document.getElementById(entry.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [article.body]);

  useEffect(() => {
    const persist = () => {
      scrollSaveRef.current.timer = null;
      setArticleScrollPosition(article.id, scrollSaveRef.current.pendingY);
    };

    const onScroll = () => {
      scrollSaveRef.current.pendingY = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = Math.max(0, Math.min(1, window.scrollY / max));
      setScrollProgress(ratio);
      if (scrollSaveRef.current.timer !== null) return;
      scrollSaveRef.current.timer = window.setTimeout(persist, 400);
    };

    const flush = () => {
      if (scrollSaveRef.current.timer !== null) {
        window.clearTimeout(scrollSaveRef.current.timer);
        scrollSaveRef.current.timer = null;
      }
      scrollSaveRef.current.pendingY = window.scrollY;
      setArticleScrollPosition(article.id, scrollSaveRef.current.pendingY);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      void flushPendingQueues();
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
    };
  }, [article.id, setArticleScrollPosition]);

  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [captureSelection]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void flushPendingQueues();
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(event.target.tagName))) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setShowShortcuts((value) => !value);
        return;
      }
      if (event.key === 'Escape') {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (tocOpen) {
          setTocOpen(false);
          return;
        }
        router.push('/');
        return;
      }
      if (event.key === 'ArrowLeft') goTo(previous?.id);
      if (event.key === 'ArrowRight') goTo(next?.id);
      if (event.key === '1') void handleRate('irrelevant');
      if (event.key === '2') void handleRate('relevant');
      if (event.key === '3') void handleRate('high_relevant');
      if (event.key === 'c') setTocOpen((value) => !value);
      if (event.key === 'n') {
        event.preventDefault();
        noteRef.current?.focus();
        noteRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (event.key === 'o' && article.frontmatter.url) {
        window.open(article.frontmatter.url, '_blank', 'noopener,noreferrer');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [article.frontmatter.url, goTo, handleRate, next?.id, previous?.id, router, showShortcuts, tocOpen]);

  // Persist an unsaved note draft when the reader unmounts.
  useEffect(() => {
    return () => {
      void saveNote(noteDraftRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  return (
    <div className="min-h-screen pb-28">
      <header className="reader-surface-bar sticky top-0 z-20 border-b px-3 py-2 text-ink">
        <div className="mx-auto max-w-[760px]">
          <div className="flex items-center gap-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Back" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-heading text-sm font-bold" title={article.frontmatter.title}>
                {article.frontmatter.title}
              </h1>
              <p className="truncate font-meta text-[11px] text-mutedink">
                {[
                  article.frontmatter.source,
                  arxivId ? `arXiv:${normalizeArxivId(arxivId)}` : undefined,
                  typeof article.frontmatter.score === 'number' ? `score ${article.frontmatter.score.toFixed(1)}` : undefined,
                  readingMinutes > 0 ? `${readingMinutes} min` : undefined
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {toc.length > 1 ? (
              <Button type="button" size="icon" variant="ghost" onClick={() => setTocOpen(true)} aria-label="Table of contents" title="Contents (c)">
                <ListTree className="h-4 w-4" />
              </Button>
            ) : null}
            <Button type="button" size="icon" variant="ghost" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts" className="hidden sm:inline-flex">
              <Keyboard className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="secondary" onClick={() => goTo(previous?.id)} disabled={!previous} aria-label="Previous article">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="secondary" onClick={() => goTo(next?.id)} disabled={!next} aria-label="Next article">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {showReadingProgress ? (
            <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
              <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${Math.round(scrollProgress * 100)}%` }} />
            </div>
          ) : null}
          {tags.length > 0 || priority > 0 ? (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 pl-[3.25rem]">
              {priority > 0 ? (
                <Badge className="shrink-0 border-amber-600/60 text-amber-700 dark:border-amber-400/60 dark:text-amber-300">prio {priority}</Badge>
              ) : null}
              {tags.map((tag) => (
                <Badge key={tag} className="shrink-0">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {selection ? (
        <div
          className="fixed left-1/2 top-24 z-40 flex -translate-x-1/2 gap-2 rounded-sm border border-yellow-400 bg-yellow-50 p-2 text-neutral-950 shadow-lg dark:border-yellow-500 dark:bg-yellow-100"
          data-no-swipe
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="highlight"
            size="sm"
            disabled={busy}
            onMouseDown={(event) => {
              event.preventDefault();
              void handleHighlight();
            }}
            onTouchStart={(event) => {
              event.preventDefault();
              void handleHighlight();
            }}
          >
            <Highlighter className="h-4 w-4" /> Highlight
          </Button>
          {selection.overlapsHighlight ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onMouseDown={(event) => {
                event.preventDefault();
                void handleUnhighlight();
              }}
              onTouchStart={(event) => {
                event.preventDefault();
                void handleUnhighlight();
              }}
            >
              <Eraser className="h-4 w-4" /> Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-sm px-3 py-2 text-sm shadow-lg ${
            feedback.tone === 'success'
              ? 'bg-[#1e5c34] text-white'
              : feedback.tone === 'error'
              ? 'bg-[#8c1d18] text-white'
              : 'bg-ink text-paper'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <main className="mx-auto max-w-[760px] px-4 py-6" onMouseUp={captureSelection} onTouchEnd={() => window.setTimeout(captureSelection, 80)}>
        <SwipeContainer onNext={() => goTo(next?.id)} onPrev={() => goTo(previous?.id)}>
          <div ref={proseRef}>
            <MarkdownRenderer content={article.body} fontSize={fontSize} />
          </div>

          <section className="mt-12 border-t border-hairline pt-5" data-no-swipe>
            <div className="mb-2 flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-mutedink" />
              <h2 className="theorem-label text-mutedink">Notes</h2>
              {article.frontmatter.reader_note_updated_at ? (
                <span className="font-meta text-[10px] text-mutedink">{new Date(article.frontmatter.reader_note_updated_at).toLocaleString()}</span>
              ) : null}
            </div>
            <textarea
              ref={noteRef}
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              onBlur={() => void saveNote(noteDraft)}
              placeholder="Your thoughts on this article — saved into the markdown frontmatter. (n)"
              rows={4}
              className="w-full resize-y rounded-sm border border-hairline bg-surface p-3 text-sm leading-relaxed text-ink outline-none transition placeholder:text-mutedink focus:border-accent"
            />
          </section>

          <section className="mt-8 border-t border-hairline pt-5" data-no-swipe>
            <h2 className="theorem-label mb-3 text-mutedink">References &amp; tools</h2>
            <div className="flex flex-wrap gap-2">
              {article.frontmatter.url ? (
                <ToolLink href={article.frontmatter.url} label="Original source" icon={<ExternalLink className="h-4 w-4 shrink-0" />} shortcut="o" />
              ) : null}
              {arxivId ? (
                <>
                  <ToolLink href={arxivAbsUrl(arxivId)} label="arXiv abs" icon={<ExternalLink className="h-4 w-4 shrink-0" />} />
                  <ToolLink href={arxivPdfUrl(arxivId)} label="PDF" icon={<FileDown className="h-4 w-4 shrink-0" />} />
                </>
              ) : null}
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyToClipboard(buildBibtex(article.frontmatter), 'BibTeX')}>
                <Quote className="h-4 w-4" /> BibTeX
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyToClipboard(buildPlainCitation(article.frontmatter), 'Citation')}>
                <Quote className="h-4 w-4" /> Citation
              </Button>
              {obsidianUri ? (
                <ToolLink
                  href={obsidianUri}
                  label="Open in Obsidian"
                  icon={
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
                      <path d="M14.3 1.6 8.2 5.2a1 1 0 0 0-.5.7l-1.5 8.4a1 1 0 0 0 .2.8l4.8 6.4c.4.6 1.3.5 1.7-.1l5.6-9.6a1 1 0 0 0 .1-.8l-2.8-8.9a1 1 0 0 0-1.5-.5Z" />
                    </svg>
                  }
                />
              ) : null}
            </div>
            {article.frontmatter.url ? <p className="mt-3 break-all font-meta text-[11px] text-mutedink">{article.frontmatter.url}</p> : null}
          </section>
        </SwipeContainer>
      </main>

      <RatingActionBar currentStatus={article.frontmatter.reader_status} onRate={handleRate} disabled={busy} />

      {tocOpen ? (
        <TocOverlay toc={toc} activeId={activeHeading} onClose={() => setTocOpen(false)} />
      ) : null}

      {showShortcuts ? <ShortcutsOverlay onClose={() => setShowShortcuts(false)} /> : null}
    </div>
  );
}

function ToolLink({ href, label, icon, shortcut }: { href: string; label: string; icon: React.ReactNode; shortcut?: string }): React.ReactElement {
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="inline-flex h-9 max-w-full items-center gap-2 rounded-sm border border-hairline bg-surface px-3 text-sm font-medium text-ink transition hover:bg-surface-muted"
    >
      {icon}
      <span className="truncate">{label}</span>
      {shortcut ? <kbd className="theorem-label rounded-sm border border-hairline px-1 text-mutedink">{shortcut}</kbd> : null}
    </a>
  );
}

function TocOverlay({ toc, activeId, onClose }: { toc: TocEntry[]; activeId: string | null; onClose: () => void }): React.ReactElement {
  const minLevel = Math.min(...toc.map((entry) => entry.level));
  return (
    <div className="fixed inset-0 z-50 bg-black/30 px-3 py-16 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Table of contents">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close contents" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[min(70vh,560px)] w-full max-w-[480px] flex-col rounded-sm border border-hairline bg-surface text-ink shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <h2 className="font-heading text-base font-bold">Contents</h2>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="overflow-y-auto p-2">
          {toc.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                document.getElementById(entry.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                onClose();
              }}
              className={`block w-full truncate rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted ${
                entry.id === activeId ? 'bg-accent-soft text-accent-soft-fg' : ''
              }`}
              style={{ paddingLeft: `${0.75 + (entry.level - minLevel) * 0.9}rem` }}
            >
              {entry.text}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }): React.ReactElement {
  const rows: Array<{ keys: string; label: string }> = [
    { keys: '←  →', label: 'Previous / next article' },
    { keys: '1', label: 'Rate irrelevant' },
    { keys: '2', label: 'Rate relevant' },
    { keys: '3', label: 'Rate high relevant' },
    { keys: 'c', label: 'Table of contents' },
    { keys: 'n', label: 'Focus note' },
    { keys: 'o', label: 'Open original source' },
    { keys: 'Ctrl K', label: 'Command palette' },
    { keys: 'Esc', label: 'Back to list' },
    { keys: '?', label: 'Open this overlay' }
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-sm border border-hairline bg-surface p-5 text-ink shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Keyboard className="h-4 w-4" />
          <h2 className="font-heading text-base font-bold">Keyboard shortcuts</h2>
        </div>
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.keys} className="flex items-center justify-between gap-3">
              <span className="text-mutedink">{row.label}</span>
              <kbd className="rounded-sm border border-hairline bg-surface-muted px-2 py-0.5 font-meta text-xs text-ink">{row.keys}</kbd>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" className="mt-5 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/**
 * Walk the selection range, substituting KaTeX math elements with their `$source$`
 * representation so mixed text+math selections can be located in the markdown body.
 *
 * For plain text we use the literal rendered text. The walker enters element subtrees
 * unless they're math, in which case it emits the source and skips the subtree.
 */
function buildSelectionMarkdownSource(range: Range): string {
  let result = '';

  const visit = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (!rangeIntersectsNode(range, element)) return;

      if (element.matches('.katex, .katex-display') || element.classList.contains('katex')) {
        const startsBefore = nodeContainsBefore(element, range.startContainer, range.startOffset);
        const endsAfter = nodeContainsAfter(element, range.endContainer, range.endOffset);
        if (startsBefore && endsAfter) {
          const source = mathSourceFor(element);
          if (source) result += source;
          return;
        }
        // Partial math selection: can't be represented in markdown – skip silently.
        return;
      }

      for (const child of Array.from(element.childNodes)) {
        visit(child);
      }
      return;
    }

    if (node.nodeType !== Node.TEXT_NODE) return;

    const parentEl = (node as Text).parentElement;
    if (parentEl?.closest('.katex, .katex-display')) return;

    if (!rangeIntersectsNode(range, node)) return;

    const text = (node as Text).data;
    let from = 0;
    let to = text.length;
    if (node === range.startContainer) from = range.startOffset;
    if (node === range.endContainer) to = range.endOffset;
    if (to > from) result += text.slice(from, to);
  };

  visit(range.commonAncestorContainer);
  return result;
}

function mathSourceFor(element: Element): string {
  const direct = element.getAttribute('data-md-source');
  if (direct) return direct;
  const annotation = element.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
  if (!annotation) return '';
  const display = Boolean(element.closest('.katex-display'));
  return display ? `$$${annotation}$$` : `$${annotation}$`;
}

function rangeIntersectsNode(range: Range, node: Node): boolean {
  const nodeRange = node.ownerDocument?.createRange();
  if (!nodeRange) return false;
  try {
    nodeRange.selectNode(node);
  } catch {
    return false;
  }
  const afterStart = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0;
  const beforeEnd = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0;
  return afterStart && beforeEnd;
}

function nodeContainsBefore(element: Element, container: Node, offset: number): boolean {
  // True when the range's start point is at or before the element's start.
  const ref = element.ownerDocument!.createRange();
  ref.selectNode(element);
  const probe = element.ownerDocument!.createRange();
  probe.setStart(container, offset);
  probe.setEnd(container, offset);
  return probe.compareBoundaryPoints(Range.START_TO_START, ref) <= 0;
}

function nodeContainsAfter(element: Element, container: Node, offset: number): boolean {
  const ref = element.ownerDocument!.createRange();
  ref.selectNode(element);
  const probe = element.ownerDocument!.createRange();
  probe.setStart(container, offset);
  probe.setEnd(container, offset);
  return probe.compareBoundaryPoints(Range.END_TO_END, ref) >= 0;
}

/**
 * Count how many times `needle` appears in the rendered text BEFORE the selection start.
 * This lets us pick the matching occurrence in the source body when the same text
 * appears multiple times (e.g., the word "of").
 */
function countOccurrencesInPrefix(root: HTMLElement, range: Range, needle: string): number {
  if (!root.contains(range.startContainer)) return 0;
  const prefix = root.ownerDocument!.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const prefixText = prefix.toString();

  // Try both the literal needle and a whitespace-collapsed form for robustness.
  const candidates = [needle, needle.replace(/\s+/g, ' ').trim()];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const haystack = prefixText.includes(candidate) ? prefixText : prefixText.replace(/\s+/g, ' ');
    let count = 0;
    let idx = 0;
    while (true) {
      const found = haystack.indexOf(candidate, idx);
      if (found < 0) break;
      count += 1;
      idx = found + Math.max(1, candidate.length);
    }
    if (count > 0 || candidate === needle) return count;
  }
  return 0;
}

/**
 * True when the selection range starts or ends inside a `<mark>` element or contains one.
 */
function rangeOverlapsHighlight(range: Range): boolean {
  const selector = 'mark, .reader-math-highlight';
  const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element) : range.startContainer.parentElement;
  const endEl = range.endContainer.nodeType === Node.ELEMENT_NODE ? (range.endContainer as Element) : range.endContainer.parentElement;
  if (startEl?.closest(selector)) return true;
  if (endEl?.closest(selector)) return true;

  const common = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? (range.commonAncestorContainer as Element) : range.commonAncestorContainer.parentElement;
  const candidates = common?.querySelectorAll(selector) ?? [];
  for (const candidate of candidates) {
    if (rangeIntersectsNode(range, candidate)) return true;
  }
  return false;
}
