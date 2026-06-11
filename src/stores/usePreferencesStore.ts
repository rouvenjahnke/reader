'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ArticleSortMode, PapersVisibility, ReaderStatus } from '@/types/article';

export type FontSize = 'S' | 'M' | 'L' | 'XL';

/** App-wide design theme. 'preprint' is the default LaTeX look. */
export type DesignTheme = 'preprint' | 'terminal' | 'legibility';

export interface ReaderPreferences {
  pinPriorityOnTop: boolean;
  /** Visual theme applied via html[data-design]. */
  designTheme: DesignTheme;
  /** How articles from the optional papers folder are shown. */
  papersVisibility: PapersVisibility;
  autoSyncOnOpen: boolean;
  bodyPrefetch: boolean;
  syncIntervalMinutes: number;
  fontSize: FontSize;
  defaultSortMode: ArticleSortMode;
  defaultStatuses: ReaderStatus[];
  showContinueReading: boolean;
  showReadingProgress: boolean;
  confirmIrrelevant: boolean;
  /** Obsidian vault name for deep links; empty disables the button. */
  obsidianVault: string;
  /** Pipeline folder relative to the vault root, e.g. "00_inbox/reader-pipeline". */
  obsidianPipelinePath: string;
  /** ISO timestamp of the last time the app was opened — used to flag "new since…". */
  lastOpenedAt?: string;
}

export const defaultPreferences: ReaderPreferences = {
  pinPriorityOnTop: true,
  designTheme: 'preprint',
  papersVisibility: 'shown',
  autoSyncOnOpen: true,
  bodyPrefetch: true,
  syncIntervalMinutes: 30,
  fontSize: 'M',
  defaultSortMode: 'newest',
  defaultStatuses: ['unrated'],
  showContinueReading: true,
  showReadingProgress: true,
  confirmIrrelevant: false,
  obsidianVault: '',
  obsidianPipelinePath: ''
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
      version: 4,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // v1 → v2: pinPriorityOnTop renamed to pinGaloisOnTop.
          if (typeof state.pinPriorityOnTop === 'boolean' && typeof state.pinGaloisOnTop === 'undefined') {
            state.pinGaloisOnTop = state.pinPriorityOnTop;
          }
          delete state.pinPriorityOnTop;
        }
        // v2 → v3: obsidianVault / obsidianPipelinePath added; defaults fill in.
        if (version < 4) {
          // v3 → v4: priority applies to all sources again; rename back to pinPriorityOnTop.
          if (typeof state.pinGaloisOnTop === 'boolean' && typeof state.pinPriorityOnTop === 'undefined') {
            state.pinPriorityOnTop = state.pinGaloisOnTop;
          }
          delete state.pinGaloisOnTop;
        }
        return state as never;
      }
    }
  )
);
