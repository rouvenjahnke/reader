'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Highlighter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { RatingActionBar } from '@/components/RatingActionBar';
import { SwipeContainer } from '@/components/SwipeContainer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { flushPendingQueues } from '@/lib/cache';
import { filterAndSortArticles, nextUnratedAfter, priorityValue } from '@/lib/filters';
import { highlightFirstOccurrence } from '@/lib/frontmatter';
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
  const [selectedText, setSelectedText] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const scrollSaveRef = useRef<{ timer: number | null; pendingY: number }>({ timer: null, pendingY: 0 });
  const syncTimerRef = useRef<number | null>(null);
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
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectedText('');
      return;
    }
    const text = selection.toString().trim();
    const markdownSource = selectedMarkdownSource(selection);
    const highlightText = markdownSource || text;
    setSelectedText(highlightText.length > 1 ? highlightText : '');
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

  const handleHighlight = useCallback(async () => {
    const text = selectedText.trim();
    if (!text || busy) return;
    window.getSelection()?.removeAllRanges();
    setSelectedText('');

    let optimisticBody: string;
    try {
      optimisticBody = highlightFirstOccurrence(article.body, text);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      appendSyncLog('error', `Highlight not found in markdown: ${article.path} (${message})`);
      setFeedback({ tone: 'error', message: 'Selection could not be located in the markdown.' });
      return;
    }

    setArticle((current) => ({ ...current, body: optimisticBody }));
    await updateCachedBody(article.id, optimisticBody);

    if (navigator.onLine) {
      try {
        const response = await fetch(`/api/articles/${article.id}/highlight`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text })
        });
        if (!response.ok) throw new Error(await response.text());
        const saved = (await response.json()) as Article;
        setArticle(saved);
        await saveArticle(saved);
        appendSyncLog('info', `Highlight saved: ${article.path}`);
        setFeedback({ tone: 'success', message: 'Highlight saved to Nextcloud.' });
        return;
      } catch (error) {
        appendSyncLog('error', `Highlight upload failed, queued instead: ${article.path}`);
      }
    }

    await queueHighlight({
      id: `${article.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      articleId: article.id,
      path: article.path,
      text,
      createdAt: new Date().toISOString()
    });
    setFeedback({ tone: 'info', message: 'Highlight queued — will sync when online.' });
    scheduleDeferredSync();
  }, [article, busy, scheduleDeferredSync, selectedText]);

  useEffect(() => {
    setArticle(initialArticle);
    setSelectedText('');
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

      {selectedText ? (
        <div
          className="fixed left-1/2 top-24 z-40 -translate-x-1/2 rounded-md border border-yellow-400 bg-yellow-50 p-2 text-neutral-950 shadow-lg dark:border-yellow-500 dark:bg-yellow-100"
          data-no-swipe
        >
          <Button type="button" variant="highlight" size="sm" onClick={handleHighlight} disabled={busy}>
            <Highlighter className="h-4 w-4" /> Highlight
          </Button>
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
          <MarkdownRenderer content={article.body} />
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

function selectedMarkdownSource(selection: Selection): string {
  if (selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);
  const start = closestElement(range.startContainer);
  const end = closestElement(range.endContainer);

  const startAncestor = ancestorWithSource(start);
  const endAncestor = ancestorWithSource(end);

  if (startAncestor && startAncestor === endAncestor) {
    return startAncestor.getAttribute('data-md-source') ?? '';
  }

  const startKatex = katexMarkdownSource(start);
  const endKatex = katexMarkdownSource(end);
  if (startKatex && startKatex === endKatex) return startKatex;

  return '';
}

function ancestorWithSource(element: Element | null): Element | null {
  return element?.closest('[data-md-source]') ?? null;
}

function closestElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function katexMarkdownSource(element: Element | null): string {
  const katex = element?.closest('.katex, .katex-display');
  if (!katex) return '';
  const annotation = katex.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
  if (!annotation) return '';
  const display = Boolean(katex.closest('.katex-display'));
  return display ? `$$${annotation}$$` : `$${annotation}$`;
}
