'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultFilters } from '@/lib/filters';
import type { ArticleFilters, ArticleSummary, ReaderStatus } from '@/types/article';

interface ArticleStore {
  articles: ArticleSummary[];
  filters: ArticleFilters;
  setArticles: (articles: ArticleSummary[]) => void;
  setSortMode: (sortMode: ArticleFilters['sortMode']) => void;
  setQuery: (query: string) => void;
  toggleStatus: (status: ReaderStatus) => void;
  toggleSource: (source: string) => void;
  updateSummary: (article: ArticleSummary) => void;
}

export const useArticleStore = create<ArticleStore>()(
  persist(
    (set) => ({
      articles: [],
      filters: defaultFilters,
      setArticles: (articles) => set({ articles }),
      setSortMode: (sortMode) => set((state) => ({ filters: { ...state.filters, sortMode } })),
      setQuery: (query) => set((state) => ({ filters: { ...state.filters, query } })),
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
      updateSummary: (article) =>
        set((state) => ({
          articles: state.articles.map((item) => (item.id === article.id ? article : item))
        }))
    }),
    {
      name: 'reader-state',
      partialize: (state) => ({ filters: state.filters })
    }
  )
);
