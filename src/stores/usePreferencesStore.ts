'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ArticleSortMode, ReaderStatus } from '@/types/article';

export type FontSize = 'S' | 'M' | 'L' | 'XL';

export interface ReaderPreferences {
  pinGaloisOnTop: boolean;
  autoSyncOnOpen: boolean;
  bodyPrefetch: boolean;
  syncIntervalMinutes: number;
  fontSize: FontSize;
  defaultSortMode: ArticleSortMode;
  defaultStatuses: ReaderStatus[];
  showContinueReading: boolean;
  showReadingProgress: boolean;
  confirmIrrelevant: boolean;
  /** ISO timestamp of the last time the app was opened — used to flag "new since…". */
  lastOpenedAt?: string;
}

export const defaultPreferences: ReaderPreferences = {
  pinGaloisOnTop: true,
  autoSyncOnOpen: true,
  bodyPrefetch: true,
  syncIntervalMinutes: 30,
  fontSize: 'M',
  defaultSortMode: 'newest',
  defaultStatuses: ['unrated'],
  showContinueReading: true,
  showReadingProgress: true,
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
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // v1 → v2: pinPriorityOnTop renamed to pinGaloisOnTop.
          if (typeof state.pinPriorityOnTop === 'boolean' && typeof state.pinGaloisOnTop === 'undefined') {
            state.pinGaloisOnTop = state.pinPriorityOnTop;
          }
          delete state.pinPriorityOnTop;
        }
        return state as never;
      }
    }
  )
);
