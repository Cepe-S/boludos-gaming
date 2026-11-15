import React from 'react';
import { cn } from '@/lib/utils';

export interface BrandWordmarkProps {
  className?: string;
}

export const BrandWordmark: React.FC<BrandWordmarkProps> = ({ className }) => {
  return (
    <span
      className={cn(
        'flex items-baseline justify-center gap-1 w-full select-none',
        className
      )}
    >
      <span className="text-[22px] font-black uppercase tracking-[-0.04em] text-foreground leading-none">
        BOLUDOS
      </span>
      <span className="text-[13px] font-bold uppercase tracking-[0.06em] text-primary leading-none">
        GAMING
      </span>
    </span>
  );
};
