'use client';

import { Star, X, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { ReaderStatus } from '@/types/article';

interface Props {
  currentStatus?: ReaderStatus;
  disabled?: boolean;
  onRate: (status: Exclude<ReaderStatus, 'unrated'>) => void;
}

export function RatingActionBar({ currentStatus, disabled, onRate }: Props): React.ReactElement {
  return (
    <div className="reader-safe-bottom reader-surface-bar fixed inset-x-0 bottom-0 z-30 border-t px-3 pt-3 text-[var(--foreground)]">
      <div className="mx-auto grid max-w-[760px] grid-cols-3 gap-2">
        <Button
          type="button"
          variant={currentStatus === 'irrelevant' ? 'destructive' : 'secondary'}
          disabled={disabled}
          onClick={() => onRate('irrelevant')}
          aria-label="Irrelevant"
        >
          <X className="h-4 w-4" /> Irrelevant
        </Button>
        <Button
          type="button"
          variant={currentStatus === 'relevant' ? 'positive' : 'secondary'}
          disabled={disabled}
          onClick={() => onRate('relevant')}
          aria-label="Relevant"
        >
          <Check className="h-4 w-4" /> Relevant
        </Button>
        <Button
          type="button"
          variant={currentStatus === 'high_relevant' ? 'default' : 'secondary'}
          disabled={disabled}
          onClick={() => onRate('high_relevant')}
          aria-label="High Relevant"
        >
          <Star className="h-4 w-4" /> High
        </Button>
      </div>
    </div>
  );
}
