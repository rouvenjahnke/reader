'use client';

import { CheckCheck, CircleOff, Clock, Command, Layers, LibraryBig, ListChecks, RefreshCw, Search, Settings, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectFolders, collectSources, collectTags, defaultFilters, isGalois, PRIORITY_SOURCE } from '@/lib/filters';
import { useArticleStore } from '@/stores/useArticleStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import type { ArticleFilters, ArticleSummary, ReaderStatus } from '@/types/article';

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
  resultCount: number;
  totalCount: number;
}

interface Props {
  articles: ArticleSummary[];
  onRefresh: () => void;
  meta: FilterBarMeta;
}

export function FilterBar({ articles, onRefresh, meta }: Props): React.ReactElement {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [folderQuery, setFolderQuery] = useState('');
  const filters = useArticleStore((state) => state.filters);
  const setSortMode = useArticleStore((state) => state.setSortMode);
  const setQuery = useArticleStore((state) => state.setQuery);
  const toggleGaloisOnly = useArticleStore((state) => state.toggleGaloisOnly);
  const toggleNewTodayOnly = useArticleStore((state) => state.toggleNewTodayOnly);
  const toggleShowDuplicates = useArticleStore((state) => state.toggleShowDuplicates);
  const toggleStatus = useArticleStore((state) => state.toggleStatus);
  const toggleSource = useArticleStore((state) => state.toggleSource);
  const toggleTag = useArticleStore((state) => state.toggleTag);
  const toggleFolder = useArticleStore((state) => state.toggleFolder);
  const resetFilters = useArticleStore((state) => state.resetFilters);
  const sources = collectSources(articles);
  const tags = collectTags(articles);
  const folders = collectFolders(articles);
  const filteredSources = filterOptions(sources, sourceQuery);
  const filteredTags = filterOptions(tags, tagQuery);
  const filteredFolders = filterOptions(folders, folderQuery);
  const sourceCounts = countOptions(articles, (article) => (article.frontmatter.source ? [article.frontmatter.source] : []));
  const tagCounts = countOptions(articles, (article) => article.frontmatter.tags ?? []);
  const folderCounts = countOptions(articles, (article) => (article.pipelineFolder ? [article.pipelineFolder] : []));
  const selectedTags = filters.tags ?? [];
  const selectedFolders = filters.folders ?? [];
  const hasGalois = articles.some(isGalois);
  const papersVisibility = usePreferencesStore((state) => state.papersVisibility);
  const setPreference = usePreferencesStore((state) => state.setPreference);
  const hasPapers = articles.some((article) => article.collection === 'papers');
  const hasActiveFilters = isFiltering(filters, papersVisibility);
  const allStatuses = statuses.map((status) => status.value);
  const allStatusesSelected = allStatuses.every((status) => filters.statuses.includes(status));

  return (
    <div className="reader-surface-bar sticky top-0 z-20 border-b px-3 py-3 text-ink shadow-[0_1px_0_var(--border)]">
      <div className="mx-auto flex max-w-[880px] flex-col gap-2.5">
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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SyncStatusLine meta={meta} />
          <span className="font-meta text-[11px] tabular-nums text-mutedink">
            {meta.resultCount} of {meta.totalCount} articles
          </span>
          <div className="ml-auto inline-flex rounded-sm border border-hairline bg-surface p-0.5" aria-label="Sort articles">
            <button
              type="button"
              className={`h-8 rounded-[2px] px-3 text-xs font-medium transition-colors ${filters.sortMode === 'newest' ? 'bg-ink text-paper' : 'text-mutedink hover:bg-surface-muted hover:text-ink'}`}
              onClick={() => setSortMode('newest')}
              aria-pressed={filters.sortMode === 'newest'}
            >
              Added
            </button>
            <button
              type="button"
              className={`h-8 rounded-[2px] px-3 text-xs font-medium transition-colors ${filters.sortMode === 'score' ? 'bg-ink text-paper' : 'text-mutedink hover:bg-surface-muted hover:text-ink'}`}
              onClick={() => setSortMode('score')}
              aria-pressed={filters.sortMode === 'score'}
            >
              Score
            </button>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-hairline pt-2.5">
          <span className="theorem-label w-14 shrink-0 pt-2.5 text-mutedink">Status</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={allStatusesSelected ? 'default' : 'secondary'}
              onClick={() => resetFilters({ ...filters, statuses: allStatusesSelected ? [] : allStatuses })}
              aria-pressed={allStatusesSelected}
              title={allStatusesSelected ? 'Deselect all rating statuses' : 'Select all rating statuses'}
            >
              All statuses
            </Button>
            {statuses.map((status) => (
              <Button
                key={status.value}
                type="button"
                size="sm"
                variant={filters.statuses.includes(status.value) ? 'default' : 'secondary'}
                onClick={() => toggleStatus(status.value)}
                aria-pressed={filters.statuses.includes(status.value)}
              >
                {status.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <span className="theorem-label flex w-14 shrink-0 items-center gap-1 pt-2.5 text-mutedink">
            <SlidersHorizontal className="h-3 w-3" /> Filter
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
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
          {hasPapers ? (
            <Button
              type="button"
              size="sm"
              variant={papersVisibility === 'only' ? 'default' : 'secondary'}
              onClick={() => setPreference('papersVisibility', papersVisibility === 'only' ? 'shown' : 'only')}
              aria-pressed={papersVisibility === 'only'}
              title="Only articles from the papers folder"
            >
              Papers
            </Button>
          ) : null}
          <Button type="button" size="sm" variant={filters.sources.length > 0 ? 'default' : 'secondary'} onClick={() => setSourcesOpen(true)}>
            Sources{filters.sources.length > 0 ? ` (${filters.sources.length})` : ''}
          </Button>
          <Button type="button" size="sm" variant={selectedTags.length > 0 ? 'default' : 'secondary'} onClick={() => setTagsOpen(true)}>
            Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
          </Button>
          <Button type="button" size="sm" variant={selectedFolders.length > 0 ? 'default' : 'secondary'} onClick={() => setFoldersOpen(true)}>
            Folders{selectedFolders.length > 0 ? ` (${selectedFolders.length})` : ''}
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
          {hasActiveFilters ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                resetFilters({ ...defaultFilters, statuses: [...defaultFilters.statuses], sortMode: filters.sortMode });
                setPreference('papersVisibility', 'shown');
              }}
              title="Reset search and filters"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
          </div>
        </div>
      </div>
      {sourcesOpen ? (
        <FilterDialog
          title="Sources"
          count={sources.length}
          visibleCount={filteredSources.length}
          searchValue={sourceQuery}
          searchPlaceholder="Search sources"
          onSearchChange={setSourceQuery}
          onClose={() => setSourcesOpen(false)}
          selectedCount={filters.sources.length}
          selectedVisibleCount={filteredSources.filter((source) => filters.sources.includes(source)).length}
          allVisibleSelected={filteredSources.length > 0 && filteredSources.every((source) => filters.sources.includes(source))}
          onSelectAll={() => resetFilters({ ...filters, sources: mergeOptions(filters.sources, filteredSources) })}
          onDeselectAll={() => resetFilters({ ...filters, sources: removeOptions(filters.sources, filteredSources) })}
        >
          {sources.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No sources</p> : null}
          {sources.length > 0 && filteredSources.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No matching sources</p> : null}
          {filteredSources.map((source) => (
            <label key={source} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={filters.sources.includes(source)} onChange={() => toggleSource(source)} />
              <span className="min-w-0 flex-1 truncate">{source}</span>
              <span className="font-meta text-[11px] tabular-nums text-mutedink">{sourceCounts.get(source) ?? 0}</span>
            </label>
          ))}
        </FilterDialog>
      ) : null}
      {tagsOpen ? (
        <FilterDialog
          title="Tags"
          count={tags.length}
          visibleCount={filteredTags.length}
          searchValue={tagQuery}
          searchPlaceholder="Search tags"
          onSearchChange={setTagQuery}
          onClose={() => setTagsOpen(false)}
          selectedCount={selectedTags.length}
          selectedVisibleCount={filteredTags.filter((tag) => selectedTags.includes(tag)).length}
          allVisibleSelected={filteredTags.length > 0 && filteredTags.every((tag) => selectedTags.includes(tag))}
          onSelectAll={() => resetFilters({ ...filters, tags: mergeOptions(selectedTags, filteredTags) })}
          onDeselectAll={() => resetFilters({ ...filters, tags: removeOptions(selectedTags, filteredTags) })}
        >
          {tags.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No tags</p> : null}
          {tags.length > 0 && filteredTags.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No matching tags</p> : null}
          {filteredTags.map((tag) => (
            <label key={tag} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={selectedTags.includes(tag)} onChange={() => toggleTag(tag)} />
              <span className="min-w-0 flex-1 truncate">{tag}</span>
              <span className="font-meta text-[11px] tabular-nums text-mutedink">{tagCounts.get(tag) ?? 0}</span>
            </label>
          ))}
        </FilterDialog>
      ) : null}
      {foldersOpen ? (
        <FilterDialog
          title="Folders"
          count={folders.length}
          visibleCount={filteredFolders.length}
          searchValue={folderQuery}
          searchPlaceholder="Search folders"
          onSearchChange={setFolderQuery}
          onClose={() => setFoldersOpen(false)}
          selectedCount={selectedFolders.length}
          selectedVisibleCount={filteredFolders.filter((folder) => selectedFolders.includes(folder)).length}
          allVisibleSelected={filteredFolders.length > 0 && filteredFolders.every((folder) => selectedFolders.includes(folder))}
          onSelectAll={() => resetFilters({ ...filters, folders: mergeOptions(selectedFolders, filteredFolders) })}
          onDeselectAll={() => resetFilters({ ...filters, folders: removeOptions(selectedFolders, filteredFolders) })}
        >
          {folders.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No folders</p> : null}
          {folders.length > 0 && filteredFolders.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No matching folders</p> : null}
          {filteredFolders.map((folder) => (
            <label key={folder} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="accent-[var(--accent)]" checked={selectedFolders.includes(folder)} onChange={() => toggleFolder(folder)} />
              <span className="min-w-0 flex-1 truncate">{folder}</span>
              <span className="font-meta text-[11px] tabular-nums text-mutedink">{folderCounts.get(folder) ?? 0}</span>
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
  visibleCount,
  searchValue,
  searchPlaceholder,
  selectedCount,
  selectedVisibleCount,
  allVisibleSelected,
  onSelectAll,
  onDeselectAll,
  onSearchChange,
  onClose,
  children
}: {
  title: string;
  count: number;
  visibleCount: number;
  searchValue: string;
  searchPlaceholder: string;
  selectedCount: number;
  selectedVisibleCount: number;
  allVisibleSelected: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSearchChange: (value: string) => void;
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
            <p className="font-meta text-[11px] text-mutedink">
              {selectedCount} selected · {count} available{searchValue.trim() ? ` · ${visibleCount} shown` : ''}
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="border-b border-hairline p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedink" />
            <Input className="h-9 pl-9" placeholder={searchPlaceholder} value={searchValue} onChange={(event) => onSearchChange(event.target.value)} />
          </div>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant={allVisibleSelected ? 'default' : 'secondary'} onClick={onSelectAll} disabled={visibleCount === 0}>
              <CheckCheck className="h-3.5 w-3.5" /> {searchValue.trim() ? 'Select shown' : 'Select all'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onDeselectAll} disabled={selectedVisibleCount === 0}>
              <CircleOff className="h-3.5 w-3.5" /> {searchValue.trim() ? 'Deselect shown' : 'Deselect all'}
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto p-2">{children}</div>
      </div>
    </div>
  );
}

function filterOptions(options: string[], query: string): string[] {
  const needle = normalizeFilterSearch(query);
  if (!needle) return options;
  return options.filter((option) => normalizeFilterSearch(option).includes(needle));
}

function normalizeFilterSearch(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function mergeOptions(selected: string[], options: string[]): string[] {
  return Array.from(new Set([...selected, ...options]));
}

function removeOptions(selected: string[], options: string[]): string[] {
  const removed = new Set(options);
  return selected.filter((option) => !removed.has(option));
}

function countOptions(articles: ArticleSummary[], getOptions: (article: ArticleSummary) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const option of new Set(getOptions(article))) counts.set(option, (counts.get(option) ?? 0) + 1);
  }
  return counts;
}

function isFiltering(filters: ArticleFilters, papersVisibility: string): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.statuses.length !== 1 ||
    filters.statuses[0] !== 'unrated' ||
    filters.sources.length > 0 ||
    (filters.tags ?? []).length > 0 ||
    (filters.folders ?? []).length > 0 ||
    filters.galoisOnly ||
    filters.newTodayOnly ||
    filters.showDuplicates ||
    papersVisibility !== 'shown'
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
