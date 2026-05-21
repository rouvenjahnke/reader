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
  const scrollSaveRef = useRef({ frame: 0, lastSavedAt: 0 });
  const syncTimerRef = useRef<number | null>(null);
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const updateSummary = useArticleStore((state) => state.updateSummary);
  const savedScrollY = useArticleStore((state) => state.articleScrollPositions[initialArticle.id] ?? 0);
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
    const text = selection?.toString().trim() ?? '';
    const markdownSource = selection ? selectedMarkdownSource(selection) : '';
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

    try {
      const optimisticBody = highlightFirstOccurrence(article.body, text);
      setArticle((current) => ({ ...current, body: optimisticBody }));
      await updateCachedBody(article.id, optimisticBody);
      await queueHighlight({
        id: `${article.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        articleId: article.id,
        path: article.path,
        text,
        createdAt: new Date().toISOString()
      });
      appendSyncLog('info', `Highlight queued locally: ${article.path}`);
      scheduleDeferredSync();
    } catch {
      appendSyncLog('error', `Could not create local highlight: ${article.path}`);
    }
  }, [article, busy, scheduleDeferredSync, selectedText]);

  useEffect(() => {
    setArticle(initialArticle);
    setSelectedText('');
    setLastArticleId(initialArticle.id);
    const restore = window.setTimeout(() => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: Math.min(savedScrollY, maxY), behavior: 'auto' });
    }, 80);
    return () => window.clearTimeout(restore);
  }, [initialArticle, savedScrollY, setLastArticleId]);

  useEffect(() => {
    const save = (force = false) => {
      const now = Date.now();
      if (!force && now - scrollSaveRef.current.lastSavedAt < 300) return;
      scrollSaveRef.current.lastSavedAt = now;
      window.cancelAnimationFrame(scrollSaveRef.current.frame);
      scrollSaveRef.current.frame = window.requestAnimationFrame(() => setArticleScrollPosition(article.id, window.scrollY));
    };

    const onScroll = () => save();
    const onPageHide = () => save(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);
    return () => {
      save(true);
      void flushPendingQueues();
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
      window.cancelAnimationFrame(scrollSaveRef.current.frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [article.id, setArticleScrollPosition]);

  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection);
    return () => document.removeEventListener('selectionchange', captureSelection);
  }, [captureSelection]);

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
      <header className="sticky top-0 z-20 border-b border-neutral-300 bg-[var(--background)]/95 px-3 py-2 text-neutral-950 backdrop-blur dark:border-neutral-800 dark:text-neutral-50">
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
        <div className="fixed left-1/2 top-24 z-40 -translate-x-1/2 rounded-md border border-yellow-300 bg-yellow-100 p-2 text-neutral-950 shadow-lg dark:border-yellow-700 dark:bg-yellow-950 dark:text-neutral-50" data-no-swipe>
          <Button type="button" variant="highlight" size="sm" onClick={handleHighlight} disabled={busy}>
            <Highlighter className="h-4 w-4" /> Highlight
          </Button>
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
  const common = closestElement(range.commonAncestorContainer);
  const startSource = markdownSourceForElement(start);
  const endSource = markdownSourceForElement(end);
  const commonSource = markdownSourceForElement(common);

  if (startSource && startSource === endSource) return startSource;
  if (startSource && !endSource) return startSource;
  if (endSource && !startSource) return endSource;
  if (commonSource) return commonSource;
  return katexMarkdownSource(start) || katexMarkdownSource(end) || katexMarkdownSource(common);
}

function closestElement(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement;
}

function markdownSourceForElement(element: Element | null): string {
  const direct = element?.closest('[data-md-source]')?.getAttribute('data-md-source');
  if (direct) return direct;
  const nested = element?.querySelector('[data-md-source]')?.getAttribute('data-md-source');
  return nested ?? '';
}

function katexMarkdownSource(element: Element | null): string {
  const katex = element?.closest('.katex, .katex-display');
  const annotation = katex?.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ?? element?.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
  if (!annotation) return '';
  const display = Boolean(katex?.closest('.katex-display'));
  return display ? `$$${annotation}$$` : `$${annotation}$`;
}
