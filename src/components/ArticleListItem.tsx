'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { priorityValue } from '@/lib/filters';
import type { ArticleSummary, ReaderStatus } from '@/types/article';

interface Props {
  article: ArticleSummary;
  isNew?: boolean;
  style?: React.CSSProperties;
}

export function ArticleListItem({ article, isNew, style }: Props): React.ReactElement {
  const fm = article.frontmatter;
  const status = fm.reader_status ?? 'unrated';
  const priority = priorityValue(article);
  const duplicateCount = article.duplicates?.length ?? 0;

  const metaLine = [fm.source, fm.author, relativeDate(article.firstSeenAt ?? fm.fetched ?? article.lastModified ?? fm.published)].filter(Boolean).join(' · ');

  return (
    <div style={style} className="px-4">
      <Link
        href={`/article/${article.id}`}
        className="flex h-full flex-col justify-center gap-1.5 border-b border-hairline px-1 transition-colors hover:bg-surface-muted"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="line-clamp-2 font-heading text-[1.08rem] font-bold leading-snug">{fm.title}</h2>
          <span className="shrink-0 font-meta text-xs tabular-nums text-mutedink" title="Pipeline score">
            {typeof fm.score === 'number' ? fm.score.toFixed(1) : '—'}
          </span>
        </div>
        <p className="truncate font-meta text-[11px] text-mutedink">{metaLine}</p>
        <div className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap">
          {article.collection === 'papers' ? <Badge className="border-[var(--accent)] text-[var(--accent)]">paper</Badge> : null}
          {article.pipelineFolder ? <Badge>{article.pipelineFolder}</Badge> : null}
          {isNew ? <Badge className="border-[var(--positive)] text-[var(--positive)]">new</Badge> : null}
          {priority > 0 ? <Badge className="border-amber-600/60 text-amber-700 dark:border-amber-400/60 dark:text-amber-300">prio {priority}</Badge> : null}
          {duplicateCount > 0 ? (
            <Badge title={article.duplicates?.map((dup) => dup.path).join('\n')}>+{duplicateCount} dup</Badge>
          ) : null}
          {status !== 'unrated' ? <Badge className={statusClass(status)}>{statusLabel(status)}</Badge> : null}
          {fm.tags?.slice(0, 3).map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      </Link>
    </div>
  );
}

function statusLabel(status: ReaderStatus): string {
  if (status === 'irrelevant') return 'irrelevant';
  if (status === 'relevant') return 'relevant';
  if (status === 'high_relevant') return 'high';
  return 'unrated';
}

function statusClass(status: ReaderStatus): string {
  if (status === 'irrelevant') return 'border-[var(--destructive)] text-[var(--destructive)]';
  if (status === 'relevant') return 'border-[var(--positive)] text-[var(--positive)]';
  if (status === 'high_relevant') return 'border-amber-500 text-amber-700 dark:text-amber-300';
  return '';
}

function relativeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const days = Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
