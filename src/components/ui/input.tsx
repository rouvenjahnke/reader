import * as React from 'react';

import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none transition focus:border-neutral-500 dark:border-neutral-800 dark:bg-neutral-950',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';
