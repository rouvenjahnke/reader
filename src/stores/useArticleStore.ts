'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultFilters } from '@/lib/filters';
import type { ArticleFilters, ArticleSummary, ReaderStatus } from '@/types/article';

interface ArticleStore {
  articles: ArticleSummary[];
  filters: ArticleFilters;
  lastArticleId?: string;
  articleScrollPositions: Record<string, number>;
  hydrated: boolean;
  /** IDs that were newly observed in the current app session (since lastOpenedAt). */
  sessionNewIds: string[];
  setArticles: (articles: ArticleSummary[]) => void;
  hydrateArticles: (articles: ArticleSummary[]) => void;
  setLastArticleId: (id: string) => void;
  setArticleScrollPosition: (id: string, y: number) => void;
  setSortMode: (sortMode: ArticleFilters['sortMode']) => void;
  setQuery: (query: string) => void;
  toggleGaloisOnly: () => void;
  toggleNewTodayOnly: () => void;
  toggleShowDuplicates: () => void;
  toggleStatus: (status: ReaderStatus) => void;
  toggleSource: (source: string) => void;
  toggleTag: (tag: string) => void;
  toggleFolder: (folder: string) => void;
  resetFilters: (filters: ArticleFilters) => void;
  updateSummary: (article: ArticleSummary) => void;
  noteSessionNew: (ids: string[]) => void;
  clearSessionNew: () => void;
}

export const useArticleStore = create<ArticleStore>()(
  persist(
    (set) => ({
      articles: [],
      filters: defaultFilters,
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
      setSortMode: (sortMode) => set((state) => ({ filters: { ...state.filters, sortMode } })),
      setQuery: (query) => set((state) => ({ filters: { ...state.filters, query } })),
      toggleGaloisOnly: () => set((state) => ({ filters: { ...state.filters, galoisOnly: !state.filters.galoisOnly } })),
      toggleNewTodayOnly: () => set((state) => ({ filters: { ...state.filters, newTodayOnly: !state.filters.newTodayOnly } })),
      toggleShowDuplicates: () => set((state) => ({ filters: { ...state.filters, showDuplicates: !state.filters.showDuplicates } })),
      toggleStatus: (status) =>
        set((state) => {
          const exists = state.filters.statuses.includes(status);
          const statuses = exists ? state.filters.statuses.filter((item) => item !== status) : [...state.filters.statuses, status];
          return { filters: { ...state.filters, statuses } };
        }),
      toggleSource: (source) =>
        set((state) => {
          const exists = state.filters.sources.includes(source);
          const sources = exists ? state.filters.sources.filter((item) => item !== source) : [...state.filters.sources, source];
          return { filters: { ...state.filters, sources } };
        }),
      toggleTag: (tag) =>
        set((state) => {
          const tags = state.filters.tags ?? [];
          const exists = tags.includes(tag);
          const nextTags = exists ? tags.filter((item) => item !== tag) : [...tags, tag];
          return { filters: { ...state.filters, tags: nextTags } };
        }),
      toggleFolder: (folder) =>
        set((state) => {
          const folders = state.filters.folders ?? [];
          const exists = folders.includes(folder);
          const nextFolders = exists ? folders.filter((item) => item !== folder) : [...folders, folder];
          return { filters: { ...state.filters, folders: nextFolders } };
        }),
      resetFilters: (filters) => set({ filters }),
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
      version: 2,
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
        return state as never;
      },
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ArticleStore> | undefined;
        return {
          ...current,
          ...persistedState,
          articles: current.articles,
          hydrated: current.hydrated,
          sessionNewIds: current.sessionNewIds,
          filters: { ...defaultFilters, ...(persistedState?.filters ?? {}) },
          articleScrollPositions: persistedState?.articleScrollPositions ?? current.articleScrollPositions
        };
      },
      partialize: (state) => ({
        filters: state.filters,
        lastArticleId: state.lastArticleId,
        articleScrollPositions: state.articleScrollPositions
      })
    }
  )
);
