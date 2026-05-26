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
  setArticles: (articles: ArticleSummary[]) => void;
  hydrateArticles: (articles: ArticleSummary[]) => void;
  setLastArticleId: (id: string) => void;
  setArticleScrollPosition: (id: string, y: number) => void;
  setSortMode: (sortMode: ArticleFilters['sortMode']) => void;
  setQuery: (query: string) => void;
  togglePriorityOnly: () => void;
  toggleStatus: (status: ReaderStatus) => void;
  toggleSource: (source: string) => void;
  toggleTag: (tag: string) => void;
  resetFilters: (filters: ArticleFilters) => void;
  updateSummary: (article: ArticleSummary) => void;
}

export const useArticleStore = create<ArticleStore>()(
  persist(
    (set) => ({
      articles: [],
      filters: defaultFilters,
      articleScrollPositions: {},
      hydrated: false,
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
      togglePriorityOnly: () => set((state) => ({ filters: { ...state.filters, priorityOnly: !state.filters.priorityOnly } })),
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
      resetFilters: (filters) => set({ filters }),
      updateSummary: (article) =>
        set((state) => ({
          articles: state.articles.map((item) => (item.id === article.id ? article : item))
        }))
    }),
    {
      name: 'reader-state',
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<ArticleStore> | undefined;
        return {
          ...current,
          ...persistedState,
          articles: current.articles,
          hydrated: current.hydrated,
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
