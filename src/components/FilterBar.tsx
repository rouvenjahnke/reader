'use client';

import { Clock, Command, Layers, LibraryBig, ListChecks, RefreshCw, Search, Settings, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectSources, collectTags, isGalois, PRIORITY_SOURCE } from '@/lib/filters';
import { useArticleStore } from '@/stores/useArticleStore';
import type { ArticleSummary, ReaderStatus } from '@/types/article';

const statuses: Array<{ value: ReaderStatus; label: string }> = [
  { value: 'unrated', label: 'Unrated' },
  { value: 'relevant', label: 'Relevant' },
  { value: 'high_relevant', label: 'High' },
  { value: 'irrelevant', label: 'Irrelevant' }
];

export interface FilterBarMeta {
  syncing: boolean;
  offline: boolean;
  lastSyncAt?: string;
  duplicateCount: number;
  prefetch?: { done: number; total: number };
  sessionNewCount: number;
  pendingCount: number;
  unratedCount: number;
}

interface Props {
  articles: ArticleSummary[];
  onRefresh: () => void;
  meta: FilterBarMeta;
}

export function FilterBar({ articles, onRefresh, meta }: Props): React.ReactElement {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const filters = useArticleStore((state) => state.filters);
  const setSortMode = useArticleStore((state) => state.setSortMode);
  const setQuery = useArticleStore((state) => state.setQuery);
  const toggleGaloisOnly = useArticleStore((state) => state.toggleGaloisOnly);
  const toggleNewTodayOnly = useArticleStore((state) => state.toggleNewTodayOnly);
  const toggleShowDuplicates = useArticleStore((state) => state.toggleShowDuplicates);
  const toggleStatus = useArticleStore((state) => state.toggleStatus);
  const toggleSource = useArticleStore((state) => state.toggleSource);
  const toggleTag = useArticleStore((state) => state.toggleTag);
  const sources = collectSources(articles);
  const tags = collectTags(articles);
  const selectedTags = filters.tags ?? [];
  const hasGalois = articles.some(isGalois);

  return (
    <div className="reader-surface-bar sticky top-0 z-20 border-b px-3 py-3 text-ink">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden select-none font-heading text-lg font-bold italic sm:block" aria-hidden="true">
            Reader
          </span>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedink" />
            <Input
              className="pl-9"
              placeholder="Search title, body, tag"
              value={filters.query}
              data-search-input
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => window.dispatchEvent(new CustomEvent('reader:open-palette'))}
            aria-label="Command palette"
            title="Command palette (Ctrl+K)"
            className="hidden sm:inline-flex"
          >
            <Command className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="secondary" onClick={onRefresh} disabled={meta.syncing} aria-label="Sync">
            <RefreshCw className={`h-4 w-4 ${meta.syncing ? 'animate-spin' : ''}`} />
          </Button>
          <Link
            href="/triage"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted"
            aria-label="Triage mode"
            title="Triage unrated articles (t)"
          >
            <ListChecks className="h-4 w-4" />
            {meta.unratedCount > 0 ? (
              <span className="theorem-label absolute -right-1 -top-1 rounded-sm border border-hairline bg-paper px-1 text-mutedink">
                {meta.unratedCount > 99 ? '99+' : meta.unratedCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/library"
            className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted"
            aria-label="Library"
            title="Library of rated articles (b)"
          >
            <LibraryBig className="h-4 w-4" />
          </Link>
          <Link
            href="/settings"
            className="inline-flex h-11 w-11 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <SyncStatusLine meta={meta} />

        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button type="button" size="sm" variant={filters.sortMode === 'newest' ? 'default' : 'secondary'} onClick={() => setSortMode('newest')}>
            Newest
          </Button>
          <Button type="button" size="sm" variant={filters.sortMode === 'score' ? 'default' : 'secondary'} onClick={() => setSortMode('score')}>
            Score
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filters.newTodayOnly ? 'default' : 'secondary'}
            onClick={toggleNewTodayOnly}
            aria-pressed={filters.newTodayOnly}
            title="Only articles first observed in the last 24 hours"
          >
            <Sparkles className="h-3.5 w-3.5" /> Today{meta.sessionNewCount > 0 ? ` · ${meta.sessionNewCount}` : ''}
          </Button>
          {hasGalois ? (
            <Button
              type="button"
              size="sm"
              variant={filters.galoisOnly ? 'default' : 'secondary'}
              onClick={toggleGaloisOnly}
              aria-pressed={filters.galoisOnly}
              title={`Only ${PRIORITY_SOURCE} articles`}
            >
              Galois
            </Button>
          ) : null}
          {statuses.map((status) => (
            <Button
              key={status.value}
              type="button"
              size="sm"
              variant={filters.statuses.includes(status.value) ? 'default' : 'secondary'}
              onClick={() => toggleStatus(status.value)}
            >
              {status.label}
            </Button>
          ))}
          <Button type="button" size="sm" variant={filters.sources.length > 0 ? 'default' : 'secondary'} onClick={() => setSourcesOpen(true)}>
            Sources{filters.sources.length > 0 ? ` (${filters.sources.length})` : ''}
          </Button>
          <Button type="button" size="sm" variant={selectedTags.length > 0 ? 'default' : 'secondary'} onClick={() => setTagsOpen(true)}>
            Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
          </Button>
          {meta.duplicateCount > 0 ? (
            <Button
              type="button"
              size="sm"
              variant={filters.showDuplicates ? 'default' : 'secondary'}
              onClick={toggleShowDuplicates}
              title="Show duplicate articles inline"
            >
              <Layers className="h-3.5 w-3.5" /> Duplicates · {meta.duplicateCount}
            </Button>
          ) : null}
        </div>
      </div>
      {sourcesOpen ? (
        <FilterDialog title="Sources" count={sources.length} onClose={() => setSourcesOpen(false)}>
          {sources.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No sources</p> : null}
          {sources.map((source) => (
            <label key={source} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={filters.sources.includes(source)} onChange={() => toggleSource(source)} />
              <span className="min-w-0 flex-1 truncate">{source}</span>
            </label>
          ))}
        </FilterDialog>
      ) : null}
      {tagsOpen ? (
        <FilterDialog title="Tags" count={tags.length} onClose={() => setTagsOpen(false)}>
          {tags.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No tags</p> : null}
          {tags.map((tag) => (
            <label key={tag} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} />
              <span className="min-w-0 flex-1 truncate">{tag}</span>
            </label>
          ))}
        </FilterDialog>
      ) : null}
    </div>
  );
}

function FilterDialog({
  title,
  count,
  onClose,
  children
}: {
  title: string;
  count: number;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 px-3 py-20 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${title} filter`}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label={`Close ${title} filter`} onClick={onClose} />
      <div className="relative mx-auto flex max-h-[min(70vh,520px)] max-w-[560px] flex-col rounded-sm border border-hairline bg-surface text-ink shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div>
            <h2 className="font-heading text-base font-bold">{title}</h2>
            <p className="font-meta text-[11px] text-mutedink">{count} available</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-2">{children}</div>
      </div>
    </div>
  );
}

function SyncStatusLine({ meta }: { meta: FilterBarMeta }): React.ReactElement | null {
  const items: string[] = [];

  if (meta.offline) items.push('offline');
  if (meta.prefetch && meta.prefetch.total > 0 && meta.prefetch.done < meta.prefetch.total) {
    items.push(`prefetch ${meta.prefetch.done}/${meta.prefetch.total}`);
  } else if (meta.lastSyncAt) {
    items.push(`synced ${formatRelative(meta.lastSyncAt)}`);
  }
  if (meta.pendingCount > 0) items.push(`${meta.pendingCount} pending`);
  if (meta.unratedCount > 0) items.push(`${meta.unratedCount} unrated`);

  if (items.length === 0) return null;

  return (
    <div className="flex items-center gap-2 font-meta text-[11px] text-mutedink">
      <Clock className="h-3 w-3 shrink-0" />
      <span className="truncate">{items.join(' · ')}</span>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86_400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(ts).toLocaleString();
}
