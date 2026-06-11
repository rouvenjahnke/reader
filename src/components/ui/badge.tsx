import * as React from 'react';

import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement {
  return (
    <span
      className={cn('theorem-label inline-flex items-center rounded-sm border border-hairline px-1.5 py-0.5 text-mutedink', className)}
      {...props}
    />
  );
}
