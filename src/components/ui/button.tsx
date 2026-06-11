import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-paper',
  {
    variants: {
      variant: {
        default: 'bg-ink text-paper shadow-sm hover:opacity-85',
        secondary: 'border border-hairline bg-surface text-ink hover:border-hairline-strong hover:bg-surface-muted',
        ghost: 'text-ink hover:bg-surface-muted',
        destructive: 'bg-[#8c1d18] text-white hover:bg-[#a32722]',
        positive: 'bg-[#1e5c34] text-white hover:bg-[#27713f]',
        highlight: 'bg-yellow-300 text-neutral-950 hover:bg-yellow-400 dark:bg-yellow-400 dark:hover:bg-yellow-300'
      },
      size: {
        default: 'h-11',
        sm: 'h-9 px-3',
        icon: 'h-11 w-11 p-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = 'Button';
