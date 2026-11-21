import React from 'react';
import { LolAccount, LolMatchSummary } from '@/types/lol';
import { PlayerProfile } from '@/types/domain';
import {
  DEFAULT_DDRAGON_VERSION,
  getChampionIconUrl,
  getProfileIconUrl,
} from '@/lib/lolDdragon';
import { LolAnimatedNumber } from './LolPrimitives';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Database,
  Image as ImageIcon,
  Loader2,
  Shield,
  Swords,
} from 'lucide-react';

export type LolBootPhaseState = 'pending' | 'loading' | 'done';

export interface LolBootPhases {
  ddragon: LolBootPhaseState;
  edge: LolBootPhaseState;
  matches: LolBootPhaseState;
  assets: LolBootPhaseState;
}

export interface LolLoadingScreenProps {
  progress: number;
  phases: LolBootPhases;
  groupName?: string | null;
  isDemoMode?: boolean;
}

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

  // Preload champion icons from the most recent matches so initial viewport renders with zero pop-in
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
  timeoutMs = 1100,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  if (
    typeof window === 'undefined' ||
    typeof Image === 'undefined' ||
    urls.length === 0
  ) {
    onProgress?.(1, 1);
    return;
  }

  const total = urls.length;
  let loaded = 0;

  const notify = () => {
    loaded = Math.min(total, loaded + 1);
    onProgress?.(loaded, total);
  };

  const imagePromises = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          notify();
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

export const LolLoadingScreen: React.FC<LolLoadingScreenProps> = ({
  progress,
  phases,
  groupName,
  isDemoMode = false,
}) => {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));

  const phaseItems: Array<{
    key: keyof LolBootPhases;
    label: string;
    state: LolBootPhaseState;
    icon: React.ReactNode;
  }> = [
    {
      key: 'ddragon',
      label: 'Data Dragon',
      state: phases.ddragon,
      icon: <Database className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
    {
      key: 'edge',
      label: isDemoMode ? 'Demo Core' : 'Riot Edge',
      state: phases.edge,
      icon: <Shield className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
    {
      key: 'matches',
      label: 'Telemetría',
      state: phases.matches,
      icon: <Swords className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
    {
      key: 'assets',
      label: 'Assets CDN',
      state: phases.assets,
      icon: <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.75} />,
    },
  ];

  return (
    <div
      className="min-h-[70vh] w-full flex items-center justify-center py-10 px-4 animate-in fade-in duration-200"
      role="status"
      aria-live="polite"
      aria-label="Cargando League of Legends"
    >
      <Card className="w-full max-w-md border-border bg-card/85 backdrop-blur-xl shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85)] overflow-hidden relative">
        {/* Top subtle accent line */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />

        <CardContent className="p-6 flex flex-col items-center text-center space-y-5">
          {/* Animated Tactical Emblem */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            {/* Outer rotating dashed ring */}
            <div className="absolute inset-0 rounded-full border border-dashed border-primary/45 animate-lol-orbit" />

            {/* Middle counter-rotating arc ring */}
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-primary border-b-cyan-400/70 animate-lol-orbit-reverse" />

            {/* Inner breathing glow */}
            <div className="absolute inset-4 rounded-full bg-primary/15 border border-primary/40 animate-pulse" />

            {/* Center Icon */}
            <div className="relative z-10 w-10 h-10 rounded-full bg-background/90 border border-primary/60 flex items-center justify-center text-primary shadow-[0_0_18px_rgba(88,101,242,0.45)]">
              <Swords className="w-5 h-5" strokeWidth={1.75} />
            </div>
          </div>

          {/* Concise Header & Live Percentage */}
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
                League of Legends
              </h2>
              {groupName && (
                <span className="px-1.5 py-0.5 rounded border border-border bg-background/60 text-[10px] font-mono text-muted-foreground">
                  {groupName}
                </span>
              )}
            </div>
            <div className="text-2xl font-mono font-black text-primary tracking-tight">
              <LolAnimatedNumber value={safeProgress} suffix="%" durationMs={220} />
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full space-y-1.5">
            <div className="h-2 w-full rounded-full bg-background/80 border border-border overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary via-cyan-400 to-primary animate-lol-shimmer transition-all duration-300 ease-out"
                style={{ width: `${safeProgress}%` }}
              />
            </div>
          </div>

          {/* 4-Stage Pipeline Pills (Icon-First, Concise 1-2 Word Labels) */}
          <div className="grid grid-cols-2 gap-2 w-full pt-1">
            {phaseItems.map((item, idx) => {
              const isDone = item.state === 'done';
              const isLoading = item.state === 'loading';
              return (
                <div
                  key={item.key}
                  style={{ animationDelay: `${idx * 45}ms` }}
                  className={cn(
                    'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-[11px] font-mono transition-all duration-200 animate-lol-card-pop',
                    isDone
                      ? 'border-success/40 bg-success/10 text-foreground'
                      : isLoading
                        ? 'border-primary/60 bg-primary/15 text-foreground'
                        : 'border-border/70 bg-background/40 text-muted-foreground'
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <span
                      className={cn(
                        isDone
                          ? 'text-success'
                          : isLoading
                            ? 'text-primary'
                            : 'text-muted-foreground'
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>

                  <span className="shrink-0">
                    {isDone ? (
                      <CheckCircle2
                        className="w-3.5 h-3.5 text-success animate-in zoom-in-75 duration-150"
                        strokeWidth={2}
                      />
                    ) : isLoading ? (
                      <Loader2
                        className="w-3.5 h-3.5 text-primary animate-spin"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <span className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
