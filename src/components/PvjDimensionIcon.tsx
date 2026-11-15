import React from 'react';
import {
  BookOpen,
  Brain,
  Gem,
  Handshake,
  type LucideIcon,
  Palette,
  Puzzle,
  Sparkles,
  Swords,
} from 'lucide-react';
import { PvjClassificationType, PvjDimensionKey } from '@/types/domain';
import { PVJ_DIMENSION_MAP } from '@/lib/playerCategorizationEngine';

export const PVJ_DIMENSION_ICONS: Record<PvjDimensionKey, LucideIcon> = {
  D1_agonia: Swords,
  D2_ingenio: Brain,
  D3_expresion: Palette,
  D4_narrativa: BookOpen,
  D5_acumulacion: Gem,
  D6_sinergia: Handshake,
};

export const PvjDimensionIcon: React.FC<{
  dimension: PvjDimensionKey;
  color?: string;
  className?: string;
}> = ({ dimension, color, className = 'w-3.5 h-3.5 shrink-0' }) => {
  const Icon = PVJ_DIMENSION_ICONS[dimension];
  const resolvedColor = color ?? PVJ_DIMENSION_MAP.get(dimension)?.color;
  return (
    <Icon
      className={className}
      strokeWidth={1.85}
      style={resolvedColor ? { color: resolvedColor } : undefined}
      aria-hidden="true"
    />
  );
};

export interface PvjArchetypeIconProps {
  hasData?: boolean;
  type?: PvjClassificationType;
  primaryDimension?: PvjDimensionKey;
  secondaryDimension?: PvjDimensionKey | null;
  iconClassName?: string;
  secondaryIconClassName?: string;
}

export const PvjArchetypeIcon: React.FC<PvjArchetypeIconProps> = ({
  hasData = true,
  type,
  primaryDimension,
  secondaryDimension,
  iconClassName = 'w-3.5 h-3.5 shrink-0',
  secondaryIconClassName,
}) => {
  if (!hasData || !primaryDimension) {
    return <Puzzle className={iconClassName} strokeWidth={1.75} aria-hidden="true" />;
  }

  if (type === 'POLYMATH') {
    return (
      <Sparkles
        className={`${iconClassName} text-success`}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    );
  }

  if (secondaryDimension && secondaryDimension !== primaryDimension) {
    return (
      <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
        <PvjDimensionIcon dimension={primaryDimension} className={iconClassName} />
        <PvjDimensionIcon
          dimension={secondaryDimension}
          className={secondaryIconClassName ?? iconClassName}
        />
      </span>
    );
  }

  return <PvjDimensionIcon dimension={primaryDimension} className={iconClassName} />;
};
