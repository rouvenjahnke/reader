'use client';

import { RefreshCw, Search, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectSources } from '@/lib/filters';
import { useArticleStore } from '@/stores/useArticleStore';
import type { ArticleSummary, ReaderStatus } from '@/types/article';

const statuses: Array<{ value: ReaderStatus; label: string }> = [
  { value: 'unrated', label: 'Unrated' },
  { value: 'relevant', label: 'Relevant' },
  { value: 'high_relevant', label: 'High' },
  { value: 'irrelevant', label: 'Irrelevant' }
];

export function FilterBar({ articles, onRefresh, syncing }: { articles: ArticleSummary[]; onRefresh: () => void; syncing: boolean }): React.ReactElement {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const filters = useArticleStore((state) => state.filters);
  const setSortMode = useArticleStore((state) => state.setSortMode);
  const setQuery = useArticleStore((state) => state.setQuery);
  const togglePriorityOnly = useArticleStore((state) => state.togglePriorityOnly);
  const toggleStatus = useArticleStore((state) => state.toggleStatus);
  const toggleSource = useArticleStore((state) => state.toggleSource);
  const sources = collectSources(articles);

  return (
    <div className="sticky top-0 z-20 border-b border-neutral-200 bg-[var(--background)]/95 px-3 py-3 backdrop-blur dark:border-neutral-800">
      <div className="mx-auto flex max-w-[720px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <Input className="pl-9" placeholder="Search" value={filters.query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <Button type="button" size="icon" variant="secondary" onClick={onRefresh} disabled={syncing} aria-label="Sync">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>
          <Link
            href="/settings"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-neutral-100 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button type="button" size="sm" variant={filters.sortMode === 'newest' ? 'default' : 'secondary'} onClick={() => setSortMode('newest')}>
            Newest
          </Button>
          <Button type="button" size="sm" variant={filters.sortMode === 'score' ? 'default' : 'secondary'} onClick={() => setSortMode('score')}>
            Score
          </Button>
          <Button type="button" size="sm" variant={filters.priorityOnly ? 'default' : 'secondary'} onClick={togglePriorityOnly}>
            Priority
          </Button>
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
        </div>
      </div>
      {sourcesOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30 px-3 py-20 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Source filter">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close source filter" onClick={() => setSourcesOpen(false)} />
          <div className="relative mx-auto flex max-h-[min(70vh,520px)] max-w-[560px] flex-col rounded-md border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <div>
                <h2 className="text-sm font-semibold">Sources</h2>
                <p className="text-xs text-neutral-500">{sources.length} available</p>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setSourcesOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="overflow-y-auto p-2">
              {sources.length === 0 ? <p className="px-3 py-8 text-center text-sm text-neutral-500">No sources</p> : null}
              {sources.map((source) => (
                <label key={source} className="flex min-h-11 items-center gap-3 rounded px-3 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900">
                  <input type="checkbox" checked={filters.sources.includes(source)} onChange={() => toggleSource(source)} />
                  <span className="min-w-0 flex-1 truncate">{source}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
