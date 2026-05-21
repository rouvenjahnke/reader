'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { priorityValue } from '@/lib/filters';
import type { ArticleSummary, ReaderStatus } from '@/types/article';

export function ArticleListItem({ article, style }: { article: ArticleSummary; style?: React.CSSProperties }): React.ReactElement {
  const fm = article.frontmatter;
  const status = fm.reader_status ?? 'unrated';
  const priority = priorityValue(article);

  return (
    <div style={style} className="px-3 py-2">
      <Link
        href={`/article/${article.id}`}
        className="block rounded-md border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-600"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="line-clamp-2 text-lg font-semibold leading-snug">{fm.title}</h2>
          <div className="flex shrink-0 items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-sm dark:bg-neutral-800">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-500" />
            {typeof fm.score === 'number' ? fm.score.toFixed(1) : '-'}
          </div>
        </div>
        <p className="mt-2 truncate text-sm text-neutral-600 dark:text-neutral-400">
          {[fm.source, fm.author, relativeDate(fm.published ?? fm.fetched ?? article.lastModified)].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {priority > 0 ? <Badge className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">Priorität {priority}</Badge> : null}
          {fm.tags?.slice(0, 3).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
          {status !== 'unrated' ? <Badge className={statusClass(status)}>{statusLabel(status)}</Badge> : null}
        </div>
      </Link>
    </div>
  );
}

function statusLabel(status: ReaderStatus): string {
  if (status === 'irrelevant') return 'x irrelevant';
  if (status === 'relevant') return '✓ relevant';
  if (status === 'high_relevant') return '★ high relevant';
  return 'unrated';
}

function statusClass(status: ReaderStatus): string {
  if (status === 'irrelevant') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200';
  if (status === 'relevant') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (status === 'high_relevant') return 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200';
  return '';
}

function relativeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const days = Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return 'heute';
  if (days === 1) return 'vor 1 Tag';
  return `vor ${days} Tagen`;
}
