import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { getDeterministicGradient, getGroupInitials } from './groupViewHelpers';

export interface GroupAvatarBadgeProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  seed?: string;
}

export const GroupAvatarBadge: React.FC<GroupAvatarBadgeProps> = ({
  name,
  avatarUrl,
  size = 'md',
  seed,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  const sizeClass =
    size === 'sm'
      ? 'w-9 h-9 text-xs rounded-md'
      : size === 'lg'
        ? 'w-12 h-12 text-base rounded-md'
        : 'w-10 h-10 text-sm rounded-md';

  if (avatarUrl && avatarUrl.trim() && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        className={cn(
          sizeClass,
          'object-cover border border-border shrink-0 bg-background'
        )}
      />
    );
  }

  const gradient = getDeterministicGradient(seed || name);
  return (
    <div
      className={cn(
        sizeClass,
        'bg-gradient-to-br flex items-center justify-center font-bold text-white border border-white/10 shrink-0 select-none',
        gradient
      )}
    >
      {getGroupInitials(name)}
    </div>
  );
};
