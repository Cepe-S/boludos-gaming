import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-primary/40 bg-primary/15 text-primary',
        secondary: 'border-border bg-secondary text-secondary-foreground',
        outline: 'border-border bg-transparent text-muted-foreground',
        destructive: 'border-destructive/40 bg-destructive/15 text-destructive',
        success: 'border-success/40 bg-success/15 text-success',
        warning: 'border-warning/40 bg-warning/15 text-warning',
        purple: 'border-primary/40 bg-primary/15 text-primary',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
