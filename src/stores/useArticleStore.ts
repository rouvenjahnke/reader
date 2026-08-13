'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultArticleFilters, defaultPaperFilters } from '@/lib/filters';
import type { ArticleFilters, ArticleSummary, ContentMode, PaperStatus, ReaderStatus } from '@/types/article';

interface ArticleStore {
  articles: ArticleSummary[];
  contentMode: ContentMode;
  filters: ArticleFilters;
  articleFilters: ArticleFilters;
  paperFilters: ArticleFilters;
  lastArticleId?: string;
  articleScrollPositions: Record<string, number>;
  hydrated: boolean;
  /** IDs that were newly observed in the current app session (since lastOpenedAt). */
  sessionNewIds: string[];
  setArticles: (articles: ArticleSummary[]) => void;
  hydrateArticles: (articles: ArticleSummary[]) => void;
  setLastArticleId: (id: string) => void;
  setArticleScrollPosition: (id: string, y: number) => void;
  setContentMode: (mode: ContentMode) => void;
  setSortMode: (sortMode: ArticleFilters['sortMode']) => void;
  setQuery: (query: string) => void;
  toggleGaloisOnly: () => void;
  toggleNewTodayOnly: () => void;
  toggleShowDuplicates: () => void;
  toggleStatus: (status: ReaderStatus) => void;
  togglePaperStatus: (status: PaperStatus) => void;
  toggleSource: (source: string) => void;
  toggleTag: (tag: string) => void;
  toggleFolder: (folder: string) => void;
  toggleWatchedAuthor: (author: string) => void;
  toggleWatchedTopic: (topic: string) => void;
  resetFilters: (filters: ArticleFilters) => void;
  updateSummary: (article: ArticleSummary) => void;
  noteSessionNew: (ids: string[]) => void;
  clearSessionNew: () => void;
}

export const useArticleStore = create<ArticleStore>()(
  persist(
    (set) => ({
      articles: [],
      contentMode: 'articles',
      filters: cloneFilters(defaultArticleFilters),
      articleFilters: cloneFilters(defaultArticleFilters),
      paperFilters: cloneFilters(defaultPaperFilters),
      articleScrollPositions: {},
      hydrated: false,
      sessionNewIds: [],
      setArticles: (articles) => set({ articles, hydrated: true }),
      hydrateArticles: (articles) =>
        set((state) => (state.hydrated ? state : { articles, hydrated: true })),
      setLastArticleId: (id) => set({ lastArticleId: id }),
      setArticleScrollPosition: (id, y) =>
        set((state) => ({
          articleScrollPositions: {
            ...state.articleScrollPositions,
            [id]: Math.max(0, Math.round(y))
          }
        })),
      setContentMode: (mode) =>
        set((state) => {
          if (state.contentMode === mode) return state;
          const articleFilters = state.contentMode === 'articles' ? state.filters : state.articleFilters;
          const paperFilters = state.contentMode === 'papers' ? state.filters : state.paperFilters;
          return {
            contentMode: mode,
            articleFilters,
            paperFilters,
            filters: cloneFilters(mode === 'papers' ? paperFilters : articleFilters)
          };
        }),
      setSortMode: (sortMode) => set((state) => updateActiveFilters(state, { ...state.filters, sortMode })),
      setQuery: (query) => set((state) => updateActiveFilters(state, { ...state.filters, query })),
      toggleGaloisOnly: () => set((state) => updateActiveFilters(state, { ...state.filters, galoisOnly: !state.filters.galoisOnly })),
      toggleNewTodayOnly: () => set((state) => updateActiveFilters(state, { ...state.filters, newTodayOnly: !state.filters.newTodayOnly })),
      toggleShowDuplicates: () => set((state) => updateActiveFilters(state, { ...state.filters, showDuplicates: !state.filters.showDuplicates })),
      toggleStatus: (status) =>
        set((state) => {
          const exists = state.filters.statuses.includes(status);
          const statuses = exists ? state.filters.statuses.filter((item) => item !== status) : [...state.filters.statuses, status];
          return updateActiveFilters(state, { ...state.filters, statuses });
        }),
      togglePaperStatus: (status) =>
        set((state) => {
          const statuses = state.filters.paperStatuses ?? [];
          const exists = statuses.includes(status);
          const paperStatuses = exists ? statuses.filter((item) => item !== status) : [...statuses, status];
          return updateActiveFilters(state, { ...state.filters, paperStatuses });
        }),
      toggleSource: (source) =>
        set((state) => {
          const exists = state.filters.sources.includes(source);
          const sources = exists ? state.filters.sources.filter((item) => item !== source) : [...state.filters.sources, source];
          return updateActiveFilters(state, { ...state.filters, sources });
        }),
      toggleTag: (tag) =>
        set((state) => {
          const tags = state.filters.tags ?? [];
          const exists = tags.includes(tag);
          const nextTags = exists ? tags.filter((item) => item !== tag) : [...tags, tag];
          return updateActiveFilters(state, { ...state.filters, tags: nextTags });
        }),
      toggleFolder: (folder) =>
        set((state) => {
          const folders = state.filters.folders ?? [];
          const exists = folders.includes(folder);
          const nextFolders = exists ? folders.filter((item) => item !== folder) : [...folders, folder];
          return updateActiveFilters(state, { ...state.filters, folders: nextFolders });
        }),
      toggleWatchedAuthor: (author) =>
        set((state) => {
          const watchedAuthors = state.filters.watchedAuthors ?? [];
          const exists = watchedAuthors.includes(author);
          const nextAuthors = exists ? watchedAuthors.filter((item) => item !== author) : [...watchedAuthors, author];
          return updateActiveFilters(state, { ...state.filters, watchedAuthors: nextAuthors });
        }),
      toggleWatchedTopic: (topic) =>
        set((state) => {
          const watchedTopics = state.filters.watchedTopics ?? [];
          const exists = watchedTopics.includes(topic);
          const nextTopics = exists ? watchedTopics.filter((item) => item !== topic) : [...watchedTopics, topic];
          return updateActiveFilters(state, { ...state.filters, watchedTopics: nextTopics });
        }),
      resetFilters: (filters) => set((state) => updateActiveFilters(state, cloneFilters(filters))),
      updateSummary: (article) =>
        set((state) => ({
          articles: state.articles.map((item) => (item.id === article.id ? article : item))
        })),
      noteSessionNew: (ids) =>
        set((state) => {
          if (ids.length === 0) return state;
          const merged = new Set(state.sessionNewIds);
          for (const id of ids) merged.add(id);
          return { sessionNewIds: Array.from(merged) };
        }),
      clearSessionNew: () => set({ sessionNewIds: [] })
    }),
    {
      name: 'reader-state',
      version: 4,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const filters = (state.filters ?? {}) as Record<string, unknown>;
          if (typeof filters.priorityOnly === 'boolean') {
            filters.galoisOnly = filters.priorityOnly;
            delete filters.priorityOnly;
          }
          filters.newTodayOnly = false;
          filters.showDuplicates = false;
          filters.folders = [];
          state.filters = filters;
        }
        if (version < 3) {
          const legacy = { ...defaultArticleFilters, ...((state.filters ?? {}) as Partial<ArticleFilters>) };
          legacy.paperStatuses = [];
          state.contentMode = 'articles';
          state.articleFilters = legacy;
          state.paperFilters = cloneFilters(defaultPaperFilters);
          state.filters = legacy;
        }
        if (version < 4) {
          for (const key of ['filters', 'articleFilters', 'paperFilters']) {
            const filters = state[key] as (Record<string, unknown> & { watchlist?: unknown }) | undefined;
            if (!filters) continue;
            // The former mixed author/topic selection cannot be split reliably.
            delete filters.watchlist;
            filters.watchedAuthors = [];
            filters.watchedTopics = [];
          }
        }
        return state as never;
      },
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ArticleStore> | undefined;
        const contentMode = persistedState?.contentMode === 'papers' ? 'papers' : 'articles';
        const articleFilters = mergeFilters(defaultArticleFilters, persistedState?.articleFilters ?? persistedState?.filters);
        const paperFilters = mergeFilters(defaultPaperFilters, persistedState?.paperFilters);
        return {
          ...current,
          ...persistedState,
          contentMode,
          articles: current.articles,
          hydrated: current.hydrated,
          sessionNewIds: current.sessionNewIds,
          articleFilters,
          paperFilters,
          filters: cloneFilters(contentMode === 'papers' ? paperFilters : articleFilters),
          articleScrollPositions: persistedState?.articleScrollPositions ?? current.articleScrollPositions
        };
      },
      partialize: (state) => ({
        filters: state.filters,
        contentMode: state.contentMode,
        articleFilters: state.contentMode === 'articles' ? state.filters : state.articleFilters,
        paperFilters: state.contentMode === 'papers' ? state.filters : state.paperFilters,
        lastArticleId: state.lastArticleId,
        articleScrollPositions: state.articleScrollPositions
      })
    }
  )
);

function cloneFilters(filters: ArticleFilters): ArticleFilters {
  return {
    ...filters,
    statuses: [...filters.statuses],
    paperStatuses: [...(filters.paperStatuses ?? [])],
    sources: [...filters.sources],
    tags: [...(filters.tags ?? [])],
    folders: [...(filters.folders ?? [])],
    watchedAuthors: [...(filters.watchedAuthors ?? [])],
    watchedTopics: [...(filters.watchedTopics ?? [])]
  };
}

function mergeFilters(defaults: ArticleFilters, persisted: Partial<ArticleFilters> | undefined): ArticleFilters {
  const legacySafe = persisted as (Partial<ArticleFilters> & { watchlist?: string[] }) | undefined;
  const { watchlist: _legacyWatchlist, ...current } = legacySafe ?? {};
  return cloneFilters({ ...defaults, ...current });
}

function updateActiveFilters(state: ArticleStore, filters: ArticleFilters): Partial<ArticleStore> {
  return state.contentMode === 'papers'
    ? { filters, paperFilters: filters }
    : { filters, articleFilters: filters };
}
