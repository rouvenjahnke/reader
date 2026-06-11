import * as React from 'react';

import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-11 w-full rounded-sm border border-hairline bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-mutedink focus:border-accent',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';
