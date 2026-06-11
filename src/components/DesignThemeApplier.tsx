'use client';

import { useEffect } from 'react';

import { usePreferencesStore } from '@/stores/usePreferencesStore';

/** Applies the design theme preference as html[data-design]; 'preprint' means no attribute. */
export function DesignThemeApplier(): null {
  const designTheme = usePreferencesStore((state) => state.designTheme);

  useEffect(() => {
    if (designTheme && designTheme !== 'preprint') {
      document.documentElement.dataset.design = designTheme;
    } else {
      delete document.documentElement.dataset.design;
    }
  }, [designTheme]);

  return null;
}
