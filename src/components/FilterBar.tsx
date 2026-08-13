'use client';

import { CheckCheck, ChevronDown, ChevronUp, CircleOff, Clock, Command, FileText, Layers, LibraryBig, ListChecks, Newspaper, RefreshCw, Search, Settings, SlidersHorizontal, Sparkles, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { collectFolders, collectSources, collectTags, collectWatchedAuthors, collectWatchedTopics, defaultArticleFilters, defaultPaperFilters, isGalois, PRIORITY_SOURCE } from '@/lib/filters';
import { useArticleStore } from '@/stores/useArticleStore';
import type { ArticleFilters, ArticleSummary, ContentMode, PaperStatus, ReaderStatus } from '@/types/article';

const statuses: Array<{ value: ReaderStatus; label: string }> = [
  { value: 'unrated', label: 'Unrated' },
  { value: 'relevant', label: 'Relevant' },
  { value: 'high_relevant', label: 'High' },
  { value: 'irrelevant', label: 'Irrelevant' }
];

const paperStatuses: Array<{ value: PaperStatus; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'skimmed', label: 'Skimmed' },
  { value: 'reading', label: 'Reading' },
  { value: 'reference', label: 'Reference' },
  { value: 'dismissed', label: 'Dismissed' }
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [authorsOpen, setAuthorsOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [folderQuery, setFolderQuery] = useState('');
  const [authorQuery, setAuthorQuery] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const filters = useArticleStore((state) => state.filters);
  const contentMode = useArticleStore((state) => state.contentMode);
  const setContentMode = useArticleStore((state) => state.setContentMode);
  const setSortMode = useArticleStore((state) => state.setSortMode);
  const setQuery = useArticleStore((state) => state.setQuery);
  const toggleGaloisOnly = useArticleStore((state) => state.toggleGaloisOnly);
  const toggleNewTodayOnly = useArticleStore((state) => state.toggleNewTodayOnly);
  const toggleShowDuplicates = useArticleStore((state) => state.toggleShowDuplicates);
  const toggleStatus = useArticleStore((state) => state.toggleStatus);
  const togglePaperStatus = useArticleStore((state) => state.togglePaperStatus);
  const toggleSource = useArticleStore((state) => state.toggleSource);
  const toggleTag = useArticleStore((state) => state.toggleTag);
  const toggleFolder = useArticleStore((state) => state.toggleFolder);
  const toggleWatchedAuthor = useArticleStore((state) => state.toggleWatchedAuthor);
  const toggleWatchedTopic = useArticleStore((state) => state.toggleWatchedTopic);
  const resetFilters = useArticleStore((state) => state.resetFilters);
  const sources = collectSources(articles);
  const tags = collectTags(articles);
  const folders = collectFolders(articles);
  const watchedAuthors = collectWatchedAuthors(articles);
  const watchedTopics = collectWatchedTopics(articles);
  const filteredSources = filterOptions(sources, sourceQuery);
  const filteredTags = filterOptions(tags, tagQuery);
  const filteredFolders = filterOptions(folders, folderQuery);
  const filteredAuthors = filterOptions(watchedAuthors, authorQuery);
  const filteredTopics = filterOptions(watchedTopics, topicQuery);
  const sourceCounts = countOptions(articles, (article) => (article.frontmatter.source ? [article.frontmatter.source] : []));
  const tagCounts = countOptions(articles, (article) => article.frontmatter.tags ?? []);
  const folderCounts = countOptions(articles, (article) => (article.pipelineFolder ? [article.pipelineFolder] : []));
  const authorCounts = countOptions(articles, (article) => article.frontmatter.matched_authors ?? []);
  const topicCounts = countOptions(articles, (article) => article.frontmatter.matched_topics ?? []);
  const selectedTags = filters.tags ?? [];
  const selectedFolders = filters.folders ?? [];
  const selectedAuthors = filters.watchedAuthors ?? [];
  const selectedTopics = filters.watchedTopics ?? [];
  const hasGalois = articles.some(isGalois);
  const hasActiveFilters = isFiltering(filters, contentMode);
  const allStatuses = statuses.map((status) => status.value);
  const allStatusesSelected = allStatuses.every((status) => filters.statuses.includes(status));
  const allPaperStatuses = paperStatuses.map((status) => status.value);
  const allPaperStatusesSelected = allPaperStatuses.every((status) => filters.paperStatuses.includes(status));

  return (
    <div className="reader-surface-bar sticky top-0 z-20 border-b px-2 py-2 text-ink shadow-[0_1px_0_var(--border)] sm:px-3 sm:py-3">
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
          <Button
            type="button"
            size="icon"
            variant={hasActiveFilters ? 'default' : 'secondary'}
            onClick={() => setMobileFiltersOpen((open) => !open)}
            aria-label={mobileFiltersOpen ? 'Hide filters' : 'Show filters'}
            aria-expanded={mobileFiltersOpen}
            aria-controls="mobile-filter-controls"
            className="relative sm:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {mobileFiltersOpen ? <ChevronUp className="absolute right-1 top-1 h-3 w-3" /> : <ChevronDown className="absolute right-1 top-1 h-3 w-3" />}
            {hasActiveFilters ? <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
          </Button>
          <Button type="button" size="icon" variant="secondary" onClick={onRefresh} disabled={meta.syncing} aria-label="Sync">
            <RefreshCw className={`h-4 w-4 ${meta.syncing ? 'animate-spin' : ''}`} />
          </Button>
          {contentMode === 'articles' ? (
            <>
              <Link
                href="/triage"
                className="relative hidden h-11 w-11 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted sm:inline-flex"
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
                className="hidden h-11 w-11 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted sm:inline-flex"
                aria-label="Library"
                title="Library of rated articles (b)"
              >
                <LibraryBig className="h-4 w-4" />
              </Link>
            </>
          ) : null}
          <Link
            href="/settings"
            className="hidden h-11 w-11 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted sm:inline-flex"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid h-9 grid-cols-2 rounded-sm border border-hairline bg-surface p-0.5" aria-label="Reader content type">
          <ModeButton mode="articles" current={contentMode} onClick={setContentMode} icon={<Newspaper className="h-3.5 w-3.5" />}>
            Articles
          </ModeButton>
          <ModeButton mode="papers" current={contentMode} onClick={setContentMode} icon={<FileText className="h-3.5 w-3.5" />}>
            Papers
          </ModeButton>
        </div>

        <div
          id="mobile-filter-controls"
          className={`${mobileFiltersOpen ? 'flex' : 'hidden'} max-h-[calc(100dvh-4.75rem)] flex-col gap-2.5 overflow-y-auto overscroll-contain sm:flex sm:max-h-none sm:overflow-visible`}
        >
          <div className="flex items-center gap-2 border-t border-hairline pt-2 sm:hidden">
            {contentMode === 'articles' ? (
              <>
                <Link
                  href="/triage"
                  className="relative inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-hairline bg-surface px-2 text-sm font-medium text-ink transition hover:bg-surface-muted"
                >
                  <ListChecks className="h-4 w-4" /> Triage
                  {meta.unratedCount > 0 ? <span className="font-meta text-[10px] text-mutedink">{meta.unratedCount > 99 ? '99+' : meta.unratedCount}</span> : null}
                </Link>
                <Link
                  href="/library"
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-hairline bg-surface px-2 text-sm font-medium text-ink transition hover:bg-surface-muted"
                >
                  <LibraryBig className="h-4 w-4" /> Library
                </Link>
              </>
            ) : null}
            <Link
              href="/settings"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-hairline bg-surface text-ink transition hover:bg-surface-muted"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SyncStatusLine meta={meta} contentMode={contentMode} />
          <span className="font-meta text-[11px] tabular-nums text-mutedink">
            {meta.resultCount} of {meta.totalCount} {contentMode === 'papers' ? 'papers' : 'articles'}
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
          <span className="theorem-label w-14 shrink-0 pt-2.5 text-mutedink">{contentMode === 'papers' ? 'Stage' : 'Status'}</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {contentMode === 'papers' ? (
              <Button
                type="button"
                size="sm"
                variant={allPaperStatusesSelected ? 'default' : 'secondary'}
                onClick={() => resetFilters({ ...filters, paperStatuses: allPaperStatusesSelected ? [] : allPaperStatuses })}
                aria-pressed={allPaperStatusesSelected}
              >
                All stages
              </Button>
            ) : (
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
            )}
            {(contentMode === 'papers' ? paperStatuses : statuses).map((status) => {
              const selected = contentMode === 'papers'
                ? filters.paperStatuses.includes(status.value as PaperStatus)
                : filters.statuses.includes(status.value as ReaderStatus);
              return (
                <Button
                  key={status.value}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'secondary'}
                  onClick={() => contentMode === 'papers' ? togglePaperStatus(status.value as PaperStatus) : toggleStatus(status.value as ReaderStatus)}
                  aria-pressed={selected}
                >
                  {status.label}
                </Button>
              );
            })}
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
          {contentMode === 'articles' && hasGalois ? (
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
          <Button type="button" size="sm" variant={filters.sources.length > 0 ? 'default' : 'secondary'} onClick={() => setSourcesOpen(true)}>
            Sources{filters.sources.length > 0 ? ` (${filters.sources.length})` : ''}
          </Button>
          <Button type="button" size="sm" variant={selectedTags.length > 0 ? 'default' : 'secondary'} onClick={() => setTagsOpen(true)}>
            Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
          </Button>
          <Button type="button" size="sm" variant={selectedFolders.length > 0 ? 'default' : 'secondary'} onClick={() => setFoldersOpen(true)}>
            Folders{selectedFolders.length > 0 ? ` (${selectedFolders.length})` : ''}
          </Button>
          {contentMode === 'papers' && watchedAuthors.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant={selectedAuthors.length > 0 ? 'default' : 'secondary'}
              onClick={() => setAuthorsOpen(true)}
              title="Filter by people from the watched-author workflow"
            >
              <UserRound className="h-3.5 w-3.5" /> Authors{selectedAuthors.length > 0 ? ` (${selectedAuthors.length})` : ''}
            </Button>
          ) : null}
          {contentMode === 'papers' && watchedTopics.length > 0 ? (
            <Button type="button" size="sm" variant={selectedTopics.length > 0 ? 'default' : 'secondary'} onClick={() => setTopicsOpen(true)}>
              Topics{selectedTopics.length > 0 ? ` (${selectedTopics.length})` : ''}
            </Button>
          ) : null}
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
                const defaults = contentMode === 'papers' ? defaultPaperFilters : defaultArticleFilters;
                resetFilters({ ...defaults, statuses: [...defaults.statuses], paperStatuses: [...defaults.paperStatuses], sortMode: filters.sortMode });
              }}
              title="Reset search and filters"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}
          </div>
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
      {authorsOpen ? (
        <FilterDialog
          title="Watched authors"
          count={watchedAuthors.length}
          visibleCount={filteredAuthors.length}
          searchValue={authorQuery}
          searchPlaceholder="Search people"
          onSearchChange={setAuthorQuery}
          onClose={() => setAuthorsOpen(false)}
          selectedCount={selectedAuthors.length}
          selectedVisibleCount={filteredAuthors.filter((author) => selectedAuthors.includes(author)).length}
          allVisibleSelected={filteredAuthors.length > 0 && filteredAuthors.every((author) => selectedAuthors.includes(author))}
          onSelectAll={() => resetFilters({ ...filters, watchedAuthors: mergeOptions(selectedAuthors, filteredAuthors) })}
          onDeselectAll={() => resetFilters({ ...filters, watchedAuthors: removeOptions(selectedAuthors, filteredAuthors) })}
        >
          {watchedAuthors.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No watched authors in these papers</p> : null}
          {watchedAuthors.length > 0 && filteredAuthors.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No matching people</p> : null}
          {filteredAuthors.map((author) => (
            <label key={author} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--accent)]" checked={selectedAuthors.includes(author)} onChange={() => toggleWatchedAuthor(author)} />
              <span className="min-w-0 flex-1 truncate">{author}</span>
              <span className="font-meta text-[11px] tabular-nums text-mutedink">{authorCounts.get(author) ?? 0}</span>
            </label>
          ))}
        </FilterDialog>
      ) : null}
      {topicsOpen ? (
        <FilterDialog
          title="Watched topics"
          count={watchedTopics.length}
          visibleCount={filteredTopics.length}
          searchValue={topicQuery}
          searchPlaceholder="Search watched topics"
          onSearchChange={setTopicQuery}
          onClose={() => setTopicsOpen(false)}
          selectedCount={selectedTopics.length}
          selectedVisibleCount={filteredTopics.filter((topic) => selectedTopics.includes(topic)).length}
          allVisibleSelected={filteredTopics.length > 0 && filteredTopics.every((topic) => selectedTopics.includes(topic))}
          onSelectAll={() => resetFilters({ ...filters, watchedTopics: mergeOptions(selectedTopics, filteredTopics) })}
          onDeselectAll={() => resetFilters({ ...filters, watchedTopics: removeOptions(selectedTopics, filteredTopics) })}
        >
          {watchedTopics.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No watched topics in these papers</p> : null}
          {watchedTopics.length > 0 && filteredTopics.length === 0 ? <p className="px-3 py-8 text-center text-sm text-mutedink">No matching topics</p> : null}
          {filteredTopics.map((topic) => (
            <label key={topic} className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm hover:bg-surface-muted">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--accent)]" checked={selectedTopics.includes(topic)} onChange={() => toggleWatchedTopic(topic)} />
              <span className="min-w-0 flex-1 truncate">{topic}</span>
              <span className="font-meta text-[11px] tabular-nums text-mutedink">{topicCounts.get(topic) ?? 0}</span>
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
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/30 pt-12 backdrop-blur-sm sm:block sm:px-3 sm:py-20"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} filter`}
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label={`Close ${title} filter`} onClick={onClose} />
      <div
        className="relative flex max-h-[calc(100dvh-3rem)] w-full min-w-0 flex-col rounded-t-sm border border-hairline bg-surface pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl sm:mx-auto sm:max-h-[min(70vh,520px)] sm:max-w-[560px] sm:rounded-sm sm:pb-0"
        data-filter-sheet
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
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
        <div className="shrink-0 border-b border-hairline p-3 sm:p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedink" />
            <Input className="h-9 pl-9" placeholder={searchPlaceholder} value={searchValue} onChange={(event) => onSearchChange(event.target.value)} />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="min-w-[8rem] flex-1 sm:flex-none" variant={allVisibleSelected ? 'default' : 'secondary'} onClick={onSelectAll} disabled={visibleCount === 0}>
              <CheckCheck className="h-3.5 w-3.5" /> {searchValue.trim() ? 'Select shown' : 'Select all'}
            </Button>
            <Button type="button" size="sm" className="min-w-[8rem] flex-1 sm:flex-none" variant="secondary" onClick={onDeselectAll} disabled={selectedVisibleCount === 0}>
              <CircleOff className="h-3.5 w-3.5" /> {searchValue.trim() ? 'Deselect shown' : 'Deselect all'}
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-2 pb-16 pt-2 sm:p-2">{children}</div>
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

function isFiltering(filters: ArticleFilters, mode: ContentMode): boolean {
  return (
    filters.query.trim().length > 0 ||
    (mode === 'papers'
      ? filters.paperStatuses.length !== defaultPaperFilters.paperStatuses.length ||
        filters.paperStatuses.some((status, index) => status !== defaultPaperFilters.paperStatuses[index])
      : filters.statuses.length !== 1 || filters.statuses[0] !== 'unrated') ||
    filters.sources.length > 0 ||
    (filters.tags ?? []).length > 0 ||
    (filters.folders ?? []).length > 0 ||
    (filters.watchedAuthors ?? []).length > 0 ||
    (filters.watchedTopics ?? []).length > 0 ||
    filters.galoisOnly ||
    filters.newTodayOnly ||
    filters.showDuplicates
  );
}

function ModeButton({
  mode,
  current,
  onClick,
  icon,
  children
}: {
  mode: ContentMode;
  current: ContentMode;
  onClick: (mode: ContentMode) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const active = mode === current;
  return (
    <button
      type="button"
      className={`inline-flex min-w-0 items-center justify-center gap-2 rounded-[2px] px-3 text-xs font-medium transition-colors ${
        active ? 'bg-ink text-paper' : 'text-mutedink hover:bg-surface-muted hover:text-ink'
      }`}
      onClick={() => onClick(mode)}
      aria-pressed={active}
    >
      {icon}
      {children}
    </button>
  );
}

function SyncStatusLine({ meta, contentMode }: { meta: FilterBarMeta; contentMode: ContentMode }): React.ReactElement | null {
  const items: string[] = [];

  if (meta.offline) items.push('offline');
  if (meta.prefetch && meta.prefetch.total > 0 && meta.prefetch.done < meta.prefetch.total) {
    items.push(`prefetch ${meta.prefetch.done}/${meta.prefetch.total}`);
  } else if (meta.lastSyncAt) {
    items.push(`synced ${formatRelative(meta.lastSyncAt)}`);
  }
  if (meta.pendingCount > 0) items.push(`${meta.pendingCount} pending`);
  if (meta.unratedCount > 0) items.push(`${meta.unratedCount} ${contentMode === 'papers' ? 'inbox' : 'unrated'}`);

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
