import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  LolAccount,
  LolMatchOutcome,
  LolMatchParticipantSummary,
  LolMatchSummary,
  LolViewMode,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatCompactNumber,
  formatDuration,
  formatQueueLabel,
  formatRelativeTime,
  formatRoleLabel,
  getRuneMeta,
  getRuneStyleMeta,
} from '@/lib/lolDdragon';
import {
  countGroupMembersInMatch,
  getGradeFromScore,
  resolveGroupMatchOutcome,
} from '@/lib/lolPerformanceEngine';
import { LolMatchHoverCard } from './LolMatchHoverCard';
import {
  LolChampionAvatar,
  LolItemRow,
  LolOutcomeBadge,
  LolPerformanceBadge,
  LolSpellsRunesBadge,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Eye, Swords, Users } from 'lucide-react';

export interface LolRecentMatchesListProps {
  mode: LolViewMode;
  matches: LolMatchSummary[];
  targetPuuid: string;
  targetPuuids?: ReadonlySet<string>;
  groupPuuids: Set<string>;
  puuidToUserId?: ReadonlyMap<string, string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  onSelectMatch: (matchId: string, initialPuuid?: string) => void;
  onSelectChampion?: (userId: string, championName: string) => void;
}

type OutcomeFilter = 'all' | 'win' | 'loss' | 'ff';

interface HoveredParticipantInfo {
  participant: LolMatchParticipantSummary;
  match: LolMatchSummary;
  rect: { left: number; top: number; right: number; bottom: number };
}

interface MatchListRow {
  match: LolMatchSummary;
  outcome: LolMatchOutcome;
  enemySurrendered: boolean;
  groupCount: number;
  userPart: LolMatchParticipantSummary | null;
  groupParticipants: LolMatchParticipantSummary[];
  representative: LolMatchParticipantSummary | null;
  avgPerformance: number;
  selectPuuid: string | undefined;
}

const ParticipantHoverPortal: React.FC<{
  info: HoveredParticipantInfo;
  isInspectedUser: boolean;
  groupAccount: LolAccount | undefined;
  ddragonVersion: string;
  hideGroupInfo?: boolean;
}> = ({
  info,
  isInspectedUser,
  groupAccount,
  ddragonVersion,
  hideGroupInfo = false,
}) => {
  const { participant, match, rect } = info;
  const mins = Math.max(1, match.gameDuration / 60);
  const width = 310;
  const estHeight = 220;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = rect.left - width - 10;
  if (left < 12) {
    left = Math.min(vw - width - 12, rect.right + 10);
  }
  let top = rect.top - 16;
  if (top + estHeight > vh - 12) {
    top = Math.max(12, vh - estHeight - 12);
  }
  if (top < 12) top = 12;

  const runeName = participant.primaryRuneId
    ? getRuneMeta(participant.primaryRuneId)?.name
    : null;
  const subName = participant.subStyleId
    ? getRuneStyleMeta(participant.subStyleId)?.name
    : null;

  const card = (
    <div
      style={{ left: `${left}px`, top: `${top}px`, width: `${width}px` }}
      className="fixed z-[75] pointer-events-none rounded-md border border-white/15 bg-popover/95 backdrop-blur-xl p-2.5 text-popover-foreground shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/5 space-y-2 animate-lol-popover-in"
    >
      {/* Top identity */}
      <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-border/80">
        <div className="flex items-center gap-2 min-w-0">
          <LolChampionAvatar
            championName={participant.championName}
            level={participant.champLevel}
            version={ddragonVersion}
            size="sm"
            ring={
              isInspectedUser
                ? 'user'
                : !hideGroupInfo && groupAccount
                  ? 'group'
                  : participant.teamId === 100
                    ? 'team100'
                    : 'team200'
            }
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">
                {participant.riotIdGameName || participant.summonerName || 'Invocador'}
              </span>
              {participant.riotIdTagLine && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  #{participant.riotIdTagLine}
                </span>
              )}
              {!hideGroupInfo && groupAccount && (
                <Badge variant="default" className="px-1 py-0 text-[9px]">
                  Grupo
                </Badge>
              )}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5">
              <span>{participant.championName}</span>
              <span>·</span>
              <span>{formatRoleLabel(participant.performanceBreakdown.role)}</span>
              <span
                className={
                  participant.teamId === 100 ? 'text-sky-400' : 'text-rose-400'
                }
              >
                {participant.teamId === 100 ? 'Azul' : 'Rojo'}
              </span>
            </div>
          </div>
        </div>

        <LolPerformanceBadge
          score={participant.performanceScore}
          grade={participant.performanceGrade}
          isMvp={participant.isMvp}
          isAce={participant.isAce}
          matchRank={participant.matchRank}
          isRemake={participant.performanceBreakdown.isRemake}
          compact
        />
      </div>

      {/* Spells + Runes + KDA */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <LolSpellsRunesBadge
            summoner1Id={participant.summoner1Id}
            summoner2Id={participant.summoner2Id}
            primaryRuneId={participant.primaryRuneId}
            subStyleId={participant.subStyleId}
            version={ddragonVersion}
            size="sm"
            layout="row"
          />
          {(runeName || subName) && (
            <span className="text-[10px] text-muted-foreground truncate">
              {runeName || subName}
            </span>
          )}
        </div>

        <div className="text-xs font-mono font-bold text-foreground shrink-0">
          {participant.kills}/{participant.deaths}/{participant.assists}
          <span className="text-[10px] text-muted-foreground ml-1">
            ({participant.kda.toFixed(1)})
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-1 text-center font-mono text-[10px] p-1.5 rounded bg-background/55 border border-border">
        <div>
          <span className="text-muted-foreground block">CS</span>
          <strong className="text-foreground">
            {participant.cs} ({participant.csPerMin.toFixed(1)})
          </strong>
        </div>
        <div>
          <span className="text-muted-foreground block">Daño</span>
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

      {/* Items */}
      <div className="flex items-center justify-between gap-2">
        <LolItemRow items={participant.items} version={ddragonVersion} size="xs" />
        <span className="text-[10px] font-mono text-muted-foreground">
          #{participant.matchRank || '—'} · KP {Math.round(participant.killParticipation * 100)}%
        </span>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return card;
  return createPortal(card, document.body);
};

export const LolRecentMatchesList: React.FC<LolRecentMatchesListProps> = ({
  mode,
  matches,
  targetPuuid,
  targetPuuids,
  groupPuuids,
  puuidToUserId,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectMatch,
  onSelectChampion,
}) => {
  const isPersonal = mode === 'personal';
  const effectiveTargetPuuids = useMemo(
    () =>
      targetPuuids && targetPuuids.size > 0
        ? targetPuuids
        : targetPuuid
          ? new Set([targetPuuid])
          : new Set<string>(),
    [targetPuuids, targetPuuid]
  );
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');

  const [hoveredParticipant, setHoveredParticipant] =
    useState<HoveredParticipantInfo | null>(null);
  const [hoveredMatchSummary, setHoveredMatchSummary] = useState<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);

  useEffect(() => {
    setHoveredParticipant(null);
    setHoveredMatchSummary(null);
  }, [mode, targetPuuid]);

  const matchesOutcomeFilter = (outcome: LolMatchOutcome): boolean => {
    if (outcomeFilter === 'win') return outcome === 'win';
    if (outcomeFilter === 'loss') return outcome === 'loss';
    if (outcomeFilter === 'ff') return outcome === 'ff' || outcome === 'remake';
    return true;
  };

  const filteredRows = useMemo<MatchListRow[]>(() => {
    const out: MatchListRow[] = [];

    for (const match of matches) {
      if (mode === 'personal') {
        const userPart = match.participants.find((p) => effectiveTargetPuuids.has(p.puuid));
        if (!userPart) continue;
        if (!matchesOutcomeFilter(userPart.outcome)) continue;

        out.push({
          match,
          outcome: userPart.outcome,
          enemySurrendered: userPart.enemySurrendered,
          groupCount: 0,
          userPart,
          groupParticipants: [],
          representative: userPart,
          avgPerformance: userPart.performanceScore,
          selectPuuid: userPart.puuid,
        });
      } else {
        if (match.participants.length === 0) continue;
        const groupCount = countGroupMembersInMatch(match, groupPuuids, puuidToUserId);
        if (groupCount < 2) continue;

        const resolved = resolveGroupMatchOutcome(match, groupPuuids);
        if (resolved.groupParticipants.length === 0) continue;
        if (!matchesOutcomeFilter(resolved.outcome)) continue;

        const sortedGroupParticipants = [...resolved.groupParticipants].sort(
          (a, b) => b.performanceScore - a.performanceScore || b.kda - a.kda
        );

        out.push({
          match,
          outcome: resolved.outcome,
          enemySurrendered: resolved.enemySurrendered,
          groupCount,
          userPart: null,
          groupParticipants: sortedGroupParticipants,
          representative: resolved.representative,
          avgPerformance: resolved.avgPerformance,
          selectPuuid: resolved.representative?.puuid,
        });
      }
    }

    return out;
  }, [mode, matches, effectiveTargetPuuids, groupPuuids, puuidToUserId, outcomeFilter]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Swords className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>{isPersonal ? 'Partidas Recientes' : 'Partidas del Grupo'}</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {filteredRows.length}
            </Badge>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'win', label: 'Wins' },
                { id: 'loss', label: 'Derrotas' },
                { id: 'ff', label: 'FF' },
              ] as Array<{ id: OutcomeFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setOutcomeFilter(opt.id)}
                className={cn(
                  'px-2 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition-colors',
                  outcomeFilter === opt.id
                    ? opt.id === 'ff'
                      ? 'bg-[#4C0519]/90 border-[#9F1239] text-[#FDA4AF] font-semibold'
                      : 'bg-primary/15 border-primary text-primary font-semibold'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-1 flex-1 min-h-0">
        {filteredRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30 animate-lol-card-pop">
            No hay partidas para los filtros seleccionados.
          </div>
        ) : (
          <div
            key={`${mode}-${isPersonal ? targetPuuid : 'group'}-${outcomeFilter}`}
            className="max-h-[396px] overflow-y-auto scroller-thin pr-1 space-y-2"
          >
            {filteredRows.map((row, idx) => {
              const {
                match,
                outcome,
                enemySurrendered,
                groupCount,
                userPart,
                groupParticipants,
                representative,
                avgPerformance,
                selectPuuid,
              } = row;
              const mins = Math.max(1, match.gameDuration / 60);

              const team100 = match.participants
                .filter((p) => p.teamId === 100)
                .slice(0, 5);
              const team200 = match.participants
                .filter((p) => p.teamId === 200)
                .slice(0, 5);

              const leftBorderClass =
                outcome === 'win'
                  ? 'border-l-success'
                  : outcome === 'ff'
                    ? 'border-l-[#881337] border-[#9F1239]/55'
                    : outcome === 'remake'
                      ? 'border-l-muted-foreground'
                      : 'border-l-destructive';

              const bgTintClass =
                outcome === 'win'
                  ? 'bg-success/[0.04] hover:bg-success/[0.09]'
                  : outcome === 'ff'
                    ? 'bg-[#4C0519]/40 hover:bg-[#4C0519]/60'
                    : outcome === 'remake'
                      ? 'bg-muted/30 hover:bg-muted/50'
                      : 'bg-destructive/[0.04] hover:bg-destructive/[0.09]';

              return (
                <div
                  key={match.matchId}
                  role="button"
                  tabIndex={0}
                  style={{ animationDelay: `${Math.min(idx, 12) * 35}ms` }}
                  onClick={() => onSelectMatch(match.matchId, selectPuuid)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectMatch(match.matchId, selectPuuid);
                    }
                  }}
                  className={cn(
                    'rounded-md border border-border border-l-4 p-2.5 transition-all duration-150 hover:translate-x-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring animate-lol-row-slide',
                    leftBorderClass,
                    bgTintClass
                  )}
                >
                  {/* Top Meta Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-border/50">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <LolOutcomeBadge
                        outcome={outcome}
                        enemySurrendered={enemySurrendered}
                        compact
                      />
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {formatQueueLabel(match.queueId, match.gameMode)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {formatDuration(match.gameDuration)} · {formatRelativeTime(match.gameCreation)}
                      </span>
                      {!isPersonal && groupCount >= 2 && (
                        <Badge
                          variant="default"
                          className="px-1.5 py-0 text-[9px] font-mono"
                          title={`${groupCount} jugadores del grupo`}
                        >
                          <Users className="w-2.5 h-2.5" strokeWidth={1.75} />
                          Grupo ({groupCount})
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isPersonal && userPart ? (
                        <LolPerformanceBadge
                          score={userPart.performanceScore}
                          grade={userPart.performanceGrade}
                          isMvp={userPart.isMvp}
                          isAce={userPart.isAce}
                          matchRank={userPart.matchRank}
                          isRemake={userPart.performanceBreakdown.isRemake}
                          compact
                        />
                      ) : (
                        <LolPerformanceBadge
                          score={avgPerformance}
                          grade={getGradeFromScore(avgPerformance)}
                          isRemake={outcome === 'remake'}
                          compact
                        />
                      )}
                      {representative && (
                        <button
                          type="button"
                          title="Vista rápida"
                          aria-label="Vista rápida de la partida"
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setHoveredMatchSummary({
                              match,
                              participant: representative,
                              rect: {
                                left: r.left,
                                top: r.top,
                                right: r.right,
                                bottom: r.bottom,
                              },
                            });
                          }}
                          onMouseLeave={() => setHoveredMatchSummary(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMatch(match.matchId, selectPuuid);
                          }}
                          className="p-1 rounded border border-border bg-background/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Eye className="w-3 h-3" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Main Body: Left (Personal detail or Group members list) | Right (2x5 Grid) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {isPersonal && userPart ? (
                      (() => {
                        const team = match.teams.find((t) => t.teamId === userPart.teamId);
                        const teamTotalDmg = Math.max(1, team?.totalDamageToChampions ?? 1);
                        const dmgPct = Math.round((userPart.damageToChampions / teamTotalDmg) * 100);
                        const runeMeta = userPart.primaryRuneId
                          ? getRuneMeta(userPart.primaryRuneId)
                          : null;
                        const subStyleMeta = userPart.subStyleId
                          ? getRuneStyleMeta(userPart.subStyleId)
                          : null;

                        return (
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <LolChampionAvatar
                              championName={userPart.championName}
                              level={userPart.champLevel}
                              version={ddragonVersion}
                              size="lg"
                              ring="user"
                            />

                            <LolSpellsRunesBadge
                              summoner1Id={userPart.summoner1Id}
                              summoner2Id={userPart.summoner2Id}
                              primaryRuneId={userPart.primaryRuneId}
                              subStyleId={userPart.subStyleId}
                              version={ddragonVersion}
                              size="sm"
                              layout="grid"
                            />

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-bold text-foreground truncate">
                                    {userPart.championName}
                                  </span>
                                  <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
                                    {formatRoleLabel(userPart.performanceBreakdown.role)}
                                  </Badge>
                                </div>

                                <div className="font-mono text-xs shrink-0">
                                  <span className="font-bold text-foreground">
                                    {userPart.kills}
                                    <span className="text-muted-foreground">/</span>
                                    <span className="text-destructive">{userPart.deaths}</span>
                                    <span className="text-muted-foreground">/</span>
                                    {userPart.assists}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    ({userPart.kda.toFixed(1)})
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <LolItemRow
                                  items={userPart.items}
                                  version={ddragonVersion}
                                  size="xs"
                                />
                                {userPart.highlights.slice(0, 2).map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="outline"
                                    className="px-1 py-0 text-[9px] font-mono bg-background/50"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
                                <span>KP {Math.round(userPart.killParticipation * 100)}%</span>
                                <span>{userPart.csPerMin.toFixed(1)} CS/m</span>
                                <span>
                                  {formatCompactNumber(userPart.damageToChampions)} DMG ({dmgPct}%)
                                </span>
                                <span>{(userPart.visionScore / mins).toFixed(1)} Vis/m</span>
                                {(runeMeta?.name || subStyleMeta?.name) && (
                                  <span className="truncate opacity-80">
                                    {runeMeta?.name || subStyleMeta?.name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex-1 min-w-0 space-y-1">
                        {groupParticipants.map((p) => {
                          const acc = accountByPuuid.get(p.puuid);
                          const playerName =
                            acc?.gameName || p.riotIdGameName || p.summonerName || 'Jugador';
                          const pickUserId = acc?.userId;
                          const canSelectChamp = Boolean(onSelectChampion && pickUserId);

                          const rowBody = (
                            <>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <LolChampionAvatar
                                  championName={p.championName}
                                  level={p.champLevel}
                                  version={ddragonVersion}
                                  size="xs"
                                  ring="group"
                                />
                                <span className="text-[11px] font-semibold text-foreground truncate max-w-[92px]">
                                  {playerName}
                                </span>
                                <span
                                  className={cn(
                                    'text-[10.5px] text-muted-foreground truncate',
                                    canSelectChamp && 'group-hover/pick:text-primary'
                                  )}
                                >
                                  {p.championName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[8.5px] font-mono px-1 py-0 shrink-0"
                                >
                                  {formatRoleLabel(p.performanceBreakdown.role)}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono text-[10.5px] font-bold text-foreground">
                                  {p.kills}
                                  <span className="text-muted-foreground">/</span>
                                  <span className="text-destructive">{p.deaths}</span>
                                  <span className="text-muted-foreground">/</span>
                                  {p.assists}
                                </span>
                                <LolPerformanceBadge
                                  score={p.performanceScore}
                                  grade={p.performanceGrade}
                                  isMvp={p.isMvp}
                                  isAce={p.isAce}
                                  isRemake={p.performanceBreakdown.isRemake}
                                  compact
                                />
                              </div>
                            </>
                          );

                          if (canSelectChamp && pickUserId) {
                            return (
                              <button
                                key={`${p.puuid}-${p.participantId}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectChampion?.(pickUserId, p.championName);
                                }}
                                title={`Ver análisis de ${playerName} con ${p.championName}`}
                                className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded border border-border/70 bg-background/45 hover:bg-primary/10 hover:border-primary/45 transition-colors text-left cursor-pointer group/pick"
                              >
                                {rowBody}
                              </button>
                            );
                          }

                          return (
                            <div
                              key={`${p.puuid}-${p.participantId}`}
                              className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded border border-border/70 bg-background/45 text-left"
                            >
                              {rowBody}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Right: Compact 2x5 Champion Grid */}
                    <div className="sm:w-[196px] shrink-0 space-y-1">
                      {[team100, team200].map((teamRoster, teamIdx) => (
                        <div
                          key={teamIdx}
                          className={cn(
                            'grid grid-cols-5 gap-1 p-1 rounded border bg-background/45',
                            teamIdx === 0 ? 'border-sky-500/25' : 'border-rose-500/25'
                          )}
                        >
                          {teamRoster.map((p) => {
                            const isUser = isPersonal && effectiveTargetPuuids.has(p.puuid);
                            const isGroup = !isPersonal && groupPuuids.has(p.puuid);
                            return (
                              <div
                                key={`${p.puuid}-${p.participantId}`}
                                onMouseEnter={(e) => {
                                  const r = e.currentTarget.getBoundingClientRect();
                                  setHoveredParticipant({
                                    participant: p,
                                    match,
                                    rect: {
                                      left: r.left,
                                      top: r.top,
                                      right: r.right,
                                      bottom: r.bottom,
                                    },
                                  });
                                }}
                                onMouseLeave={() => setHoveredParticipant(null)}
                                className="flex flex-col items-center gap-0.5 min-w-0 group"
                              >
                                <LolChampionAvatar
                                  championName={p.championName}
                                  version={ddragonVersion}
                                  size="xs"
                                  ring={isUser ? 'user' : isGroup ? 'group' : 'none'}
                                  className="w-6 h-6 transition-transform group-hover:scale-110"
                                />
                                <span
                                  className={cn(
                                    'text-[8px] font-mono truncate max-w-full leading-none',
                                    isUser
                                      ? 'text-cyan-300 font-bold'
                                      : isGroup
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground'
                                  )}
                                >
                                  {p.riotIdGameName || p.championName}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {hoveredParticipant && (
        <ParticipantHoverPortal
          info={hoveredParticipant}
          isInspectedUser={
            isPersonal && effectiveTargetPuuids.has(hoveredParticipant.participant.puuid)
          }
          groupAccount={accountByPuuid.get(hoveredParticipant.participant.puuid)}
          ddragonVersion={ddragonVersion}
          hideGroupInfo={isPersonal}
        />
      )}

      {hoveredMatchSummary && (
        <LolMatchHoverCard
          match={hoveredMatchSummary.match}
          participant={hoveredMatchSummary.participant}
          anchorRect={hoveredMatchSummary.rect}
          groupPuuids={groupPuuids}
          accountByPuuid={accountByPuuid}
          ddragonVersion={ddragonVersion}
          hideGroupInfo={isPersonal}
        />
      )}
    </Card>
  );
};
