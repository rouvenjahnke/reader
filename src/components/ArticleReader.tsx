'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Eraser, ExternalLink, Highlighter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { RatingActionBar } from '@/components/RatingActionBar';
import { SwipeContainer } from '@/components/SwipeContainer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { flushPendingQueues } from '@/lib/cache';
import { filterAndSortArticles, nextUnratedAfter, priorityValue } from '@/lib/filters';
import { highlightFirstOccurrence, removeHighlightInBody } from '@/lib/frontmatter';
import { queueHighlight, queueRating, saveArticle, updateCachedBody, updateCachedRating } from '@/lib/cache';
import { appendSyncLog } from '@/lib/syncLog';
import { useArticleStore } from '@/stores/useArticleStore';
import type { Article, ReaderStatus } from '@/types/article';

interface Props {
  article: Article;
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
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const updateSummary = useArticleStore((state) => state.updateSummary);
  const setLastArticleId = useArticleStore((state) => state.setLastArticleId);
  const setArticleScrollPosition = useArticleStore((state) => state.setArticleScrollPosition);
  const ordered = useMemo(() => filterAndSortArticles(articles, filters), [articles, filters]);
  const currentIndex = ordered.findIndex((item) => item.id === article.id);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined;
  const tags = article.frontmatter.tags ?? [];
  const priority = priorityValue(article);

  const goTo = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      void flushPendingQueues();
      router.push(`/article/${id}`);
    },
    [router]
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

    setSelectionState({ text: markdownText, occurrenceIndex, overlapsHighlight });
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
      if (!selection || busy) return;
      const { text, occurrenceIndex } = selection;
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

  useEffect(() => {
    setArticle(initialArticle);
    setSelectionState(null);
    setLastArticleId(initialArticle.id);
    const savedScrollY = useArticleStore.getState().articleScrollPositions[initialArticle.id] ?? 0;
    const restore = window.setTimeout(() => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(savedScrollY, maxY), behavior: 'auto' });
    }, 80);
    return () => window.clearTimeout(restore);
  }, [initialArticle, setLastArticleId]);

  useEffect(() => {
    const persist = () => {
      scrollSaveRef.current.timer = null;
      setArticleScrollPosition(article.id, scrollSaveRef.current.pendingY);
    };

    const onScroll = () => {
      scrollSaveRef.current.pendingY = window.scrollY;
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
      if (event.key === 'ArrowLeft') goTo(previous?.id);
      if (event.key === 'ArrowRight') goTo(next?.id);
      if (event.key === '1') void handleRate('irrelevant');
      if (event.key === '2') void handleRate('relevant');
      if (event.key === '3') void handleRate('high_relevant');
      if (event.key === 'Escape') router.push('/');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goTo, handleRate, next?.id, previous?.id, router]);

  return (
    <div className="min-h-screen pb-28">
      <header className="reader-surface-bar sticky top-0 z-20 border-b px-3 py-2 text-[var(--foreground)]">
        <div className="mx-auto max-w-[760px]">
          <div className="flex items-center gap-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Back" onClick={() => router.push('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold" title={article.frontmatter.title}>
                {article.frontmatter.title}
              </h1>
              <p className="truncate text-xs text-neutral-700 dark:text-neutral-400">
                {[article.frontmatter.source, typeof article.frontmatter.score === 'number' ? `Score ${article.frontmatter.score.toFixed(1)}` : undefined].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button type="button" size="icon" variant="secondary" onClick={() => goTo(previous?.id)} disabled={!previous} aria-label="Previous article">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="secondary" onClick={() => goTo(next?.id)} disabled={!next} aria-label="Next article">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {tags.length > 0 || priority > 0 ? (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 pl-[3.25rem]">
              {priority > 0 ? (
                <Badge className="shrink-0 border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">Priority {priority}</Badge>
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
          className="fixed left-1/2 top-24 z-40 flex -translate-x-1/2 gap-2 rounded-md border border-yellow-400 bg-yellow-50 p-2 text-neutral-950 shadow-lg dark:border-yellow-500 dark:bg-yellow-100"
          data-no-swipe
        >
          <Button type="button" variant="highlight" size="sm" onClick={handleHighlight} disabled={busy}>
            <Highlighter className="h-4 w-4" /> Highlight
          </Button>
          {selection.overlapsHighlight ? (
            <Button type="button" variant="secondary" size="sm" onClick={handleUnhighlight} disabled={busy}>
              <Eraser className="h-4 w-4" /> Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-md px-3 py-2 text-sm shadow-lg ${
            feedback.tone === 'success'
              ? 'bg-emerald-600 text-white'
              : feedback.tone === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-neutral-900 text-white dark:bg-neutral-200 dark:text-neutral-900'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <main className="mx-auto max-w-[760px] px-4 py-6" onMouseUp={captureSelection} onTouchEnd={() => window.setTimeout(captureSelection, 80)}>
        <SwipeContainer onNext={() => goTo(next?.id)} onPrev={() => goTo(previous?.id)}>
          <div ref={proseRef}>
            <MarkdownRenderer content={article.body} />
          </div>
          {article.frontmatter.url ? (
            <div className="mt-12 border-t border-neutral-300 pt-6 dark:border-neutral-800" data-no-swipe>
              <a
                href={article.frontmatter.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md bg-neutral-100 px-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
              >
                <ExternalLink className="h-4 w-4 shrink-0" />
                <span className="truncate">Open original source</span>
              </a>
              <p className="mt-2 break-all text-xs text-neutral-700 dark:text-neutral-400">{article.frontmatter.url}</p>
            </div>
          ) : null}
        </SwipeContainer>
      </main>

      <RatingActionBar currentStatus={article.frontmatter.reader_status} onRate={handleRate} disabled={busy} />
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
  const root = range.commonAncestorContainer;
  const startNode = range.startContainer;
  const endNode = range.endContainer;
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  let result = '';
  let started = false;
  let finished = false;

  const visit = (node: Node) => {
    if (finished) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;

      // If the range begins or ends inside this element, recurse into children.
      // But for math elements that are FULLY inside the range, take the source.
      const intersects = rangeIntersectsNode(range, element);
      if (!intersects) return;

      if (element.matches('.katex, .katex-display') || element.classList.contains('katex')) {
        // Emit math source only when entire element is contained in the range.
        const startsBefore = nodeContainsBefore(element, range.startContainer, range.startOffset);
        const endsAfter = nodeContainsAfter(element, range.endContainer, range.endOffset);
        if (startsBefore && endsAfter) {
          const source = mathSourceFor(element);
          if (started) result += source;
          else if (source) {
            result += source;
            started = true;
          }
          return;
        }
      }

      for (const child of Array.from(element.childNodes)) {
        if (finished) break;
        visit(child);
      }
      return;
    }

    if (node.nodeType !== Node.TEXT_NODE) return;
    // Skip text nodes inside katex (handled by the element branch).
    const parentEl = (node as Text).parentElement;
    if (parentEl?.closest('.katex, .katex-display')) return;

    const text = (node as Text).data;
    let from = 0;
    let to = text.length;
    if (node === startNode) {
      from = startOffset;
      started = true;
    } else if (!started) {
      // Haven't reached selection start yet.
      return;
    }
    if (node === endNode) {
      to = endOffset;
      finished = true;
    }
    if (to > from) result += text.slice(from, to);
  };

  visit(root);
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
