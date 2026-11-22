import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  LolAccount,
  LolMatchParticipantSummary,
  LolMatchSummary,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatCompactNumber,
  formatDuration,
  formatQueueLabel,
  formatRelativeTime,
  formatRoleLabel,
} from '@/lib/lolDdragon';
import {
  LolChampionAvatar,
  LolItemRow,
  LolOutcomeBadge,
  LolPerformanceBadge,
  LolPillarBars,
  LolSpellsRunesBadge,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';

export interface LolMatchHoverCardProps {
  match: LolMatchSummary;
  participant: LolMatchParticipantSummary;
  anchorRect: { left: number; top: number; right: number; bottom: number };
  groupPuuids: Set<string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  hideGroupInfo?: boolean;
  showOutcomeDiffs?: boolean;
}

function formatSignedDiff(val: number, compact = false): string {
  if (val === 0) return '0';
  const sign = val > 0 ? '+' : '-';
  const abs = Math.abs(val);
  return `${sign}${compact ? formatCompactNumber(abs) : abs}`;
}

export const LolMatchHoverCard: React.FC<LolMatchHoverCardProps> = ({
  match,
  participant,
  anchorRect,
  groupPuuids,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  hideGroupInfo = false,
  showOutcomeDiffs = false,
}) => {
  const cardWidth = 370;
  const estimatedHeight = showOutcomeDiffs ? 420 : 365;

  const position = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: anchorRect.right + 10, top: anchorRect.top };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.right + 12;
    if (left + cardWidth > vw - 12) {
      left = anchorRect.left - cardWidth - 12;
    }
    if (left < 12) {
      left = Math.max(12, Math.min(vw - cardWidth - 12, anchorRect.left));
    }

    let top = anchorRect.top - 24;
    if (top + estimatedHeight > vh - 12) {
      top = Math.max(12, vh - estimatedHeight - 12);
    }
    if (top < 12) top = 12;

    return { left, top };
  }, [anchorRect]);

  const mins = Math.max(1, match.gameDuration / 60);
  const team100 = match.participants.filter((p) => p.teamId === 100).slice(0, 5);
  const team200 = match.participants.filter((p) => p.teamId === 200).slice(0, 5);
  const team100Summary = match.teams.find((t) => t.teamId === 100);
  const team200Summary = match.teams.find((t) => t.teamId === 200);

  const outcomeTeamDiffs = useMemo(() => {
    const allyParts = match.participants.filter((p) => p.teamId === participant.teamId);
    const enemyParts = match.participants.filter(
      (p) => p.teamId !== participant.teamId && (p.teamId === 100 || p.teamId === 200)
    );
    const allySummary = match.teams.find((t) => t.teamId === participant.teamId);
    const enemySummary = match.teams.find(
      (t) => t.teamId !== participant.teamId && (t.teamId === 100 || t.teamId === 200)
    );

    const allyGold =
      allySummary?.totalGold ?? allyParts.reduce((s, p) => s + p.goldEarned, 0);
    const enemyGold =
      enemySummary?.totalGold ?? enemyParts.reduce((s, p) => s + p.goldEarned, 0);
    const allyKills =
      allySummary?.totalKills ?? allyParts.reduce((s, p) => s + p.kills, 0);
    const enemyKills =
      enemySummary?.totalKills ?? enemyParts.reduce((s, p) => s + p.kills, 0);
    const allyTowers =
      allySummary?.objectives?.tower?.kills ??
      allyParts.reduce((s, p) => s + (p.rawParticipant?.turretKills ?? 0), 0);
    const enemyTowers =
      enemySummary?.objectives?.tower?.kills ??
      enemyParts.reduce((s, p) => s + (p.rawParticipant?.turretKills ?? 0), 0);

    return {
      allyGold,
      enemyGold,
      goldDiff: allyGold - enemyGold,
      allyKills,
      enemyKills,
      killsDiff: allyKills - enemyKills,
      allyTowers,
      enemyTowers,
      towersDiff: allyTowers - enemyTowers,
    };
  }, [match, participant.teamId]);

  const outcomeMomentLabel =
    participant.outcome === 'win'
      ? participant.enemySurrendered
        ? 'AL MOMENTO DEL WIN (FF RIVAL)'
        : 'AL MOMENTO DEL WIN'
      : participant.outcome === 'ff'
        ? 'AL MOMENTO DEL FF'
        : 'AL MOMENTO DE LA DERROTA';

  const eventMs =
    match.gameEndTimestamp && match.gameEndTimestamp > 0
      ? match.gameEndTimestamp
      : (match.gameStartTimestamp > 0 ? match.gameStartTimestamp : match.gameCreation) +
        match.gameDuration * 1000;
  const eventTimeLabel =
    Number.isFinite(eventMs) && eventMs > 0
      ? (() => {
          const d = new Date(eventMs);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          return `${dd}/${mm} ${hh}:${min}hs`;
        })()
      : '';

  const groupMates = hideGroupInfo
    ? []
    : match.participants.filter((p) => groupPuuids.has(p.puuid));

  const content = (
    <div
      style={{ left: `${position.left}px`, top: `${position.top}px`, width: `${cardWidth}px` }}
      className="fixed z-[70] pointer-events-none rounded-md border border-white/15 bg-popover/95 backdrop-blur-xl p-3 text-popover-foreground shadow-[0_20px_56px_-10px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/5 space-y-2.5 animate-lol-popover-in"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <LolOutcomeBadge
            outcome={participant.outcome}
            enemySurrendered={participant.enemySurrendered}
            compact
          />
          <span className="text-xs font-semibold text-foreground truncate">
            {formatQueueLabel(match.queueId, match.gameMode)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground shrink-0">
          <span>Min {Math.round(match.gameDuration / 60)} ({formatDuration(match.gameDuration)})</span>
          {eventTimeLabel && (
            <>
              <span>·</span>
              <span className="text-foreground font-semibold">{eventTimeLabel}</span>
            </>
          )}
          <span>·</span>
          <span>{formatRelativeTime(match.gameCreation)}</span>
        </div>
      </div>

      {/* Player Summary */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <LolChampionAvatar
            championName={participant.championName}
            level={participant.champLevel}
            version={ddragonVersion}
            size="md"
            ring="user"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-foreground truncate">
                {participant.championName}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {formatRoleLabel(participant.performanceBreakdown.role)}
              </span>
            </div>
            <LolSpellsRunesBadge
              summoner1Id={participant.summoner1Id}
              summoner2Id={participant.summoner2Id}
              primaryRuneId={participant.primaryRuneId}
              subStyleId={participant.subStyleId}
              version={ddragonVersion}
              size="sm"
              layout="row"
            />
          </div>
        </div>

        <div className="text-right space-y-1 shrink-0">
          <LolPerformanceBadge
            score={participant.performanceScore}
            grade={participant.performanceGrade}
            isMvp={participant.isMvp}
            isAce={participant.isAce}
            matchRank={participant.matchRank}
            isRemake={participant.performanceBreakdown.isRemake}
            compact
          />
          <div className="text-xs font-mono font-bold text-foreground">
            {participant.kills}/{participant.deaths}/{participant.assists}
            <span className="text-[10px] text-muted-foreground ml-1">
              ({participant.kda.toFixed(1)})
            </span>
          </div>
        </div>
      </div>

      {/* Items + Key Metrics */}
      <div className="flex items-center justify-between gap-2">
        <LolItemRow items={participant.items} version={ddragonVersion} size="xs" />
        <span className="text-[10px] font-mono text-muted-foreground">
          KP {Math.round(participant.killParticipation * 100)}%
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[10px] p-1.5 rounded bg-background/55 border border-border">
        <div>
          <span className="text-muted-foreground block">CS</span>
          <strong className="text-foreground">
            {participant.cs} ({participant.csPerMin.toFixed(1)})
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground block">DMG</span>
          <strong className="text-foreground">
            {formatCompactNumber(participant.damageToChampions)}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground block">Oro</span>
          <strong className="text-foreground">
            {formatCompactNumber(participant.goldEarned)}
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground block">Visión</span>
          <strong className="text-foreground">
            {participant.visionScore} ({(participant.visionScore / mins).toFixed(1)}/m)
          </strong>
        </div>
      </div>

      {/* 6 Pillars */}
      <LolPillarBars pillars={participant.performanceBreakdown.pillars} compact showInfo={false} />

      {/* Team Diffs at Moment of Win / FF / Loss */}
      {showOutcomeDiffs && (
        <div className="rounded bg-background/70 border border-white/10 p-1.5 space-y-1 font-mono">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground tracking-wider">
            <span className="font-bold text-foreground/90">{outcomeMomentLabel}</span>
            <span>EQUIPO VS RIVAL</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
            <div className="rounded bg-background/60 border border-border/70 py-1 px-1">
              <span className="text-[9px] text-muted-foreground block">Δ ORO</span>
              <strong
                className={cn(
                  'text-[11px] font-bold block',
                  outcomeTeamDiffs.goldDiff > 0
                    ? 'text-emerald-400'
                    : outcomeTeamDiffs.goldDiff < 0
                      ? 'text-rose-400'
                      : 'text-foreground'
                )}
              >
                {formatSignedDiff(outcomeTeamDiffs.goldDiff, true)}
              </strong>
              <span className="text-[8.5px] text-muted-foreground block">
                {formatCompactNumber(outcomeTeamDiffs.allyGold)} vs{' '}
                {formatCompactNumber(outcomeTeamDiffs.enemyGold)}
              </span>
            </div>

            <div className="rounded bg-background/60 border border-border/70 py-1 px-1">
              <span className="text-[9px] text-muted-foreground block">Δ KILLS</span>
              <strong
                className={cn(
                  'text-[11px] font-bold block',
                  outcomeTeamDiffs.killsDiff > 0
                    ? 'text-emerald-400'
                    : outcomeTeamDiffs.killsDiff < 0
                      ? 'text-rose-400'
                      : 'text-foreground'
                )}
              >
                {formatSignedDiff(outcomeTeamDiffs.killsDiff)}
              </strong>
              <span className="text-[8.5px] text-muted-foreground block">
                {outcomeTeamDiffs.allyKills} vs {outcomeTeamDiffs.enemyKills}
              </span>
            </div>

            <div className="rounded bg-background/60 border border-border/70 py-1 px-1">
              <span className="text-[9px] text-muted-foreground block">Δ TORRES</span>
              <strong
                className={cn(
                  'text-[11px] font-bold block',
                  outcomeTeamDiffs.towersDiff > 0
                    ? 'text-emerald-400'
                    : outcomeTeamDiffs.towersDiff < 0
                      ? 'text-rose-400'
                      : 'text-foreground'
                )}
              >
                {formatSignedDiff(outcomeTeamDiffs.towersDiff)}
              </strong>
              <span className="text-[8.5px] text-muted-foreground block">
                {outcomeTeamDiffs.allyTowers} vs {outcomeTeamDiffs.enemyTowers}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Team Score + Objectives + Group Mates */}
      <div className="pt-1.5 border-t border-border/70 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-sky-400">
            Azul: {team100Summary?.totalKills ?? 0}K ·{' '}
            {team100Summary?.objectives?.tower?.kills ?? 0}T ·{' '}
            {team100Summary?.objectives?.dragon?.kills ?? 0}D ·{' '}
            {team100Summary?.objectives?.baron?.kills ?? 0}B
          </span>
          <span className="text-rose-400">
            Rojo: {team200Summary?.totalKills ?? 0}K ·{' '}
            {team200Summary?.objectives?.tower?.kills ?? 0}T ·{' '}
            {team200Summary?.objectives?.dragon?.kills ?? 0}D ·{' '}
            {team200Summary?.objectives?.baron?.kills ?? 0}B
          </span>
        </div>

        {/* Mini 2x5 strip */}
        <div className="grid grid-cols-5 gap-1">
          {[...team100, ...team200].map((p) => {
            const isTarget = p.puuid === participant.puuid;
            const isGroup = !hideGroupInfo && groupPuuids.has(p.puuid);
            return (
              <div
                key={`${p.puuid}-${p.participantId}`}
                className={cn(
                  'flex items-center gap-1 px-1 py-0.5 rounded border text-[9px] truncate',
                  isTarget
                    ? 'border-cyan-400/75 bg-cyan-400/15 text-cyan-200'
                    : isGroup
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-border/70 bg-background/40 text-muted-foreground'
                )}
              >
                <LolChampionAvatar
                  championName={p.championName}
                  version={ddragonVersion}
                  size="xs"
                  className="w-4 h-4 rounded-sm"
                />
                <span className="truncate font-mono">
                  {p.kills}/{p.deaths}/{p.assists}
                </span>
              </div>
            );
          })}
        </div>

        {!hideGroupInfo && groupMates.length >= 2 && (
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <Badge variant="default" className="px-1.5 py-0 text-[9px]">
              <Users className="w-2.5 h-2.5" strokeWidth={1.75} />
              Grupo ({groupMates.length})
            </Badge>
            {groupMates.map((gm) => {
              const acc = accountByPuuid.get(gm.puuid);
              return (
                <span key={gm.puuid} className="font-mono text-muted-foreground">
                  {acc?.gameName || gm.riotIdGameName}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
};
