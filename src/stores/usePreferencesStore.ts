'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ArticleSortMode, ReaderStatus } from '@/types/article';

export type FontSize = 'S' | 'M' | 'L' | 'XL';

export interface ReaderPreferences {
  pinPriorityOnTop: boolean;
  autoSyncOnOpen: boolean;
  syncIntervalMinutes: number;
  fontSize: FontSize;
  defaultSortMode: ArticleSortMode;
  defaultStatuses: ReaderStatus[];
  showContinueReading: boolean;
  confirmIrrelevant: boolean;
}

export const defaultPreferences: ReaderPreferences = {
  pinPriorityOnTop: true,
  autoSyncOnOpen: true,
  syncIntervalMinutes: 30,
  fontSize: 'M',
  defaultSortMode: 'newest',
  defaultStatuses: ['unrated'],
  showContinueReading: true,
  confirmIrrelevant: false
};

interface PreferencesStore extends ReaderPreferences {
  setPreference: <K extends keyof ReaderPreferences>(key: K, value: ReaderPreferences[K]) => void;
  resetPreferences: () => void;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      ...defaultPreferences,
      setPreference: (key, value) => set({ [key]: value } as Pick<ReaderPreferences, typeof key>),
      resetPreferences: () => set({ ...defaultPreferences })
    }),
    {
      name: 'reader-preferences',
      version: 1
    }
  )
);
