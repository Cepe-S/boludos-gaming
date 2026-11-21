import React from 'react';
import { LolAccount, LolMatchSummary } from '@/types/lol';
import { PlayerProfile } from '@/types/domain';
import {
  DEFAULT_DDRAGON_VERSION,
  getChampionIconUrl,
  getProfileIconUrl,
} from '@/lib/lolDdragon';
import { Swords } from 'lucide-react';

export function collectLolCriticalImageUrls(params: {
  accounts: LolAccount[];
  matches: LolMatchSummary[];
  members: Array<Pick<PlayerProfile, 'id' | 'avatarUrl'>>;
  ddragonVersion?: string;
}): string[] {
  const version = params.ddragonVersion || DEFAULT_DDRAGON_VERSION;
  const urls = new Set<string>();

  for (const member of params.members) {
    if (member.avatarUrl) {
      urls.add(member.avatarUrl);
    }
  }

  for (const acc of params.accounts) {
    const ver = acc.ddragonVersion || version;
    urls.add(getProfileIconUrl(acc.profileIconId, ver));
  }

  const recentSlice = params.matches.slice(0, 8);
  for (const match of recentSlice) {
    for (const part of match.participants) {
      if (part.championName) {
        urls.add(getChampionIconUrl(part.championName, version));
      }
      if (urls.size >= 36) break;
    }
    if (urls.size >= 36) break;
  }

  return Array.from(urls);
}

export async function preloadLolImages(
  urls: string[],
  timeoutMs = 1100
): Promise<void> {
  if (
    typeof window === 'undefined' ||
    typeof Image === 'undefined' ||
    urls.length === 0
  ) {
    return;
  }

  const imagePromises = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        img.onload = finish;
        img.onerror = finish;
        img.src = url;
        if (img.complete) {
          finish();
        }
      })
  );

  await Promise.race([
    Promise.all(imagePromises).then(() => undefined),
    new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
  ]);
}

export const LolLoadingScreen: React.FC = () => {
  return (
    <div
      className="min-h-[70vh] w-full flex flex-col items-center justify-center gap-4 py-10 px-4 animate-in fade-in duration-200"
      role="status"
      aria-live="polite"
      aria-label="Cargando League of Legends"
    >
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/60 animate-spin" />
        <div className="relative z-10 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-primary">
          <Swords className="w-4 h-4 animate-pulse" strokeWidth={1.75} />
        </div>
      </div>

      <span className="text-xs font-mono font-medium text-muted-foreground tracking-wider uppercase animate-pulse">
        Cargando League of Legends...
      </span>
    </div>
  );
};
