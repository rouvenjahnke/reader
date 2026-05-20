'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Highlighter } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { RatingActionBar } from '@/components/RatingActionBar';
import { SwipeContainer } from '@/components/SwipeContainer';
import { Button } from '@/components/ui/button';
import { filterAndSortArticles, nextUnratedAfter } from '@/lib/filters';
import { highlightFirstOccurrence } from '@/lib/frontmatter';
import { queueHighlight, queueRating, saveArticle, updateCachedBody, updateCachedRating } from '@/lib/cache';
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
  const articles = useArticleStore((state) => state.articles);
  const filters = useArticleStore((state) => state.filters);
  const updateSummary = useArticleStore((state) => state.updateSummary);
  const ordered = useMemo(() => filterAndSortArticles(articles, filters), [articles, filters]);
  const currentIndex = ordered.findIndex((item) => item.id === article.id);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : undefined;
  const next = currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : undefined;

  const goTo = useCallback(
    (id: string | undefined) => {
      if (id) router.push(`/article/${id}`);
    },
    [router]
  );

  const captureSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    setSelectedText(text.length > 1 ? text : '');
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
    setBusy(true);
    try {
      const optimisticBody = highlightFirstOccurrence(article.body, text);
      setArticle((current) => ({ ...current, body: optimisticBody }));
      await updateCachedBody(article.id, optimisticBody);

      if (!navigator.onLine) throw new Error('offline');
      const response = await fetch(`/api/articles/${article.id}/highlight`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error(await response.text());
      const saved = (await response.json()) as Article;
      setArticle(saved);
      await saveArticle(saved);
    } catch {
      await queueHighlight({ id: article.id, path: article.path, text, createdAt: new Date().toISOString() });
    } finally {
      window.getSelection()?.removeAllRanges();
      setSelectedText('');
      setBusy(false);
    }
  }, [article, busy, selectedText]);

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
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-[var(--background)]/95 px-3 py-2 backdrop-blur dark:border-neutral-800">
        <div className="mx-auto flex max-w-[760px] items-center gap-2">
          <Button type="button" size="icon" variant="ghost" aria-label="Zurueck" onClick={() => router.push('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold" title={article.frontmatter.title}>
              {article.frontmatter.title}
            </h1>
            <p className="truncate text-xs text-neutral-500">
              {[article.frontmatter.source, typeof article.frontmatter.score === 'number' ? `Score ${article.frontmatter.score.toFixed(1)}` : undefined].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Button type="button" size="icon" variant="secondary" onClick={() => goTo(previous?.id)} disabled={!previous} aria-label="Vorheriger Artikel">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="secondary" onClick={() => goTo(next?.id)} disabled={!next} aria-label="Naechster Artikel">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {selectedText ? (
        <div className="fixed left-1/2 top-20 z-40 -translate-x-1/2 rounded-md border border-yellow-300 bg-yellow-100 p-2 shadow-lg dark:border-yellow-700 dark:bg-yellow-950">
          <Button type="button" variant="highlight" size="sm" onClick={handleHighlight} disabled={busy}>
            <Highlighter className="h-4 w-4" /> Markieren
          </Button>
        </div>
      ) : null}

      <main className="mx-auto max-w-[760px] px-4 py-6" onMouseUp={captureSelection} onTouchEnd={() => window.setTimeout(captureSelection, 80)}>
        <SwipeContainer onNext={() => goTo(next?.id)} onPrev={() => goTo(previous?.id)}>
          <MarkdownRenderer content={article.body} />
        </SwipeContainer>
      </main>

      <RatingActionBar currentStatus={article.frontmatter.reader_status} onRate={handleRate} disabled={busy} />
    </div>
  );
}
