import React, { useMemo, useState } from 'react';
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
  getRuneMeta,
  getRuneStyleMeta,
} from '@/lib/lolDdragon';
import { countGroupMembersInMatch } from '@/lib/lolPerformanceEngine';
import { LolMatchHoverCard } from './LolMatchHoverCard';
import {
  LolChampionAvatar,
  LolItemRow,
  LolOutcomeBadge,
  LolPerformanceBadge,
  LolSpellsRunesBadge,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChevronDown, Eye, Swords, Users } from 'lucide-react';

export interface LolRecentMatchesListProps {
  matches: LolMatchSummary[];
  targetPuuid: string;
  groupPuuids: Set<string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  onSelectMatch: (matchId: string) => void;
}

type OutcomeFilter = 'all' | 'win' | 'loss' | 'ff';

interface HoveredParticipantInfo {
  participant: LolMatchParticipantSummary;
  match: LolMatchSummary;
  rect: { left: number; top: number; right: number; bottom: number };
}

const ParticipantHoverPortal: React.FC<{
  info: HoveredParticipantInfo;
  isInspectedUser: boolean;
  groupAccount: LolAccount | undefined;
  ddragonVersion: string;
}> = ({ info, isInspectedUser, groupAccount, ddragonVersion }) => {
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
      className="fixed z-[75] pointer-events-none rounded-md border border-white/15 bg-popover/95 backdrop-blur-xl p-2.5 text-popover-foreground shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/5 space-y-2 animate-in fade-in duration-100"
    >
      {/* Top identity */}
      <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-border/80">
        <div className="flex items-center gap-2 min-w-0">
          <LolChampionAvatar
            championName={participant.championName}
            level={participant.champLevel}
            version={ddragonVersion}
            size="sm"
            ring={isInspectedUser ? 'user' : groupAccount ? 'group' : participant.teamId === 100 ? 'team100' : 'team200'}
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
              {groupAccount && (
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
  matches,
  targetPuuid,
  groupPuuids,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectMatch,
}) => {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [onlyGroup, setOnlyGroup] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(15);

  const [hoveredParticipant, setHoveredParticipant] =
    useState<HoveredParticipantInfo | null>(null);
  const [hoveredMatchSummary, setHoveredMatchSummary] = useState<{
    match: LolMatchSummary;
    participant: LolMatchParticipantSummary;
    rect: { left: number; top: number; right: number; bottom: number };
  } | null>(null);

  const filteredRows = useMemo(() => {
    const out: Array<{
      match: LolMatchSummary;
      userPart: LolMatchParticipantSummary;
      groupCount: number;
    }> = [];

    for (const match of matches) {
      const userPart = match.participants.find((p) => p.puuid === targetPuuid);
      if (!userPart) continue;

      const groupCount = countGroupMembersInMatch(match, groupPuuids);
      if (onlyGroup && groupCount < 2) continue;

      if (outcomeFilter === 'win' && userPart.outcome !== 'win') continue;
      if (outcomeFilter === 'loss' && userPart.outcome !== 'loss') continue;
      if (
        outcomeFilter === 'ff' &&
        userPart.outcome !== 'ff' &&
        userPart.outcome !== 'remake'
      ) {
        continue;
      }

      out.push({ match, userPart, groupCount });
    }

    return out;
  }, [matches, targetPuuid, groupPuuids, outcomeFilter, onlyGroup]);

  const visibleRows = filteredRows.slice(0, visibleLimit);

  return (
    <Card>
      <CardHeader className="pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Partidas Recientes</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {filteredRows.length}
            </Badge>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'win', label: 'Victorias' },
                { id: 'loss', label: 'Derrotas' },
                { id: 'ff', label: 'FF / Remake' },
              ] as Array<{ id: OutcomeFilter; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setOutcomeFilter(opt.id);
                  setVisibleLimit(15);
                }}
                className={cn(
                  'px-2 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors',
                  outcomeFilter === opt.id
                    ? 'bg-primary/15 border-primary text-primary font-semibold'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setOnlyGroup((prev) => !prev);
                setVisibleLimit(15);
              }}
              className={cn(
                'px-2 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                onlyGroup
                  ? 'bg-primary/20 border-primary text-primary font-semibold'
                  : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="w-3 h-3" strokeWidth={1.75} />
              <span>Solo Grupo</span>
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-2.5">
        {visibleRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30">
            No hay partidas para los filtros seleccionados.
          </div>
        ) : (
          visibleRows.map(({ match, userPart, groupCount }) => {
            const mins = Math.max(1, match.gameDuration / 60);
            const team = match.teams.find((t) => t.teamId === userPart.teamId);
            const teamTotalDmg = Math.max(1, team?.totalDamageToChampions ?? 1);
            const dmgPct = Math.round((userPart.damageToChampions / teamTotalDmg) * 100);
            const runeMeta = userPart.primaryRuneId
              ? getRuneMeta(userPart.primaryRuneId)
              : null;
            const subStyleMeta = userPart.subStyleId
              ? getRuneStyleMeta(userPart.subStyleId)
              : null;

            const team100 = match.participants
              .filter((p) => p.teamId === 100)
              .slice(0, 5);
            const team200 = match.participants
              .filter((p) => p.teamId === 200)
              .slice(0, 5);

            const leftBorderClass =
              userPart.outcome === 'win'
                ? 'border-l-success'
                : userPart.outcome === 'ff'
                  ? 'border-l-warning'
                  : userPart.outcome === 'remake'
                    ? 'border-l-muted-foreground'
                    : 'border-l-destructive';

            const bgTintClass =
              userPart.outcome === 'win'
                ? 'bg-success/[0.04] hover:bg-success/[0.09]'
                : userPart.outcome === 'ff'
                  ? 'bg-warning/[0.04] hover:bg-warning/[0.09]'
                  : userPart.outcome === 'remake'
                    ? 'bg-muted/30 hover:bg-muted/50'
                    : 'bg-destructive/[0.04] hover:bg-destructive/[0.09]';

            return (
              <div
                key={match.matchId}
                role="button"
                tabIndex={0}
                onClick={() => onSelectMatch(match.matchId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMatch(match.matchId);
                  }
                }}
                className={cn(
                  'rounded-md border border-border border-l-4 p-3 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring',
                  leftBorderClass,
                  bgTintClass
                )}
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  {/* Col 1: Mode, Outcome, Duration, Relative Time */}
                  <div className="lg:col-span-2 flex lg:flex-col items-center lg:items-start justify-between gap-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <LolOutcomeBadge
                        outcome={userPart.outcome}
                        enemySurrendered={userPart.enemySurrendered}
                      />
                      {groupCount >= 2 && (
                        <Badge
                          variant="default"
                          className="px-1.5 py-0 text-[9px] font-mono"
                          title={`${groupCount} jugadores del grupo`}
                        >
                          <Users className="w-2.5 h-2.5" strokeWidth={1.75} />
                          {groupCount}
                        </Badge>
                      )}
                    </div>

                    <div className="text-left lg:space-y-0.5">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {formatQueueLabel(match.queueId, match.gameMode)}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {formatDuration(match.gameDuration)} ·{' '}
                        {formatRelativeTime(match.gameCreation)}
                      </p>
                    </div>
                  </div>

                  {/* Col 2: Larger User Champion + Spells/Runes + Items */}
                  <div className="lg:col-span-4 flex items-center gap-3 min-w-0">
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
                      size="md"
                      layout="grid"
                    />

                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-bold text-foreground truncate">
                          {userPart.championName}
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
                          {formatRoleLabel(userPart.performanceBreakdown.role)}
                        </Badge>
                      </div>

                      <LolItemRow
                        items={userPart.items}
                        version={ddragonVersion}
                        size="sm"
                      />

                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {runeMeta?.name || 'Runa'}
                        {subStyleMeta ? ` · ${subStyleMeta.name}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Col 3: KDA, Stats, Performance & Highlights */}
                  <div className="lg:col-span-3 flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono">
                        <span className="text-sm font-bold text-foreground">
                          {userPart.kills}
                          <span className="text-muted-foreground">/</span>
                          <span className="text-destructive">{userPart.deaths}</span>
                          <span className="text-muted-foreground">/</span>
                          {userPart.assists}
                        </span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">
                          {userPart.kda.toFixed(2)} KDA
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <LolPerformanceBadge
                          score={userPart.performanceScore}
                          grade={userPart.performanceGrade}
                          isMvp={userPart.isMvp}
                          isAce={userPart.isAce}
                          matchRank={userPart.matchRank}
                          isRemake={userPart.performanceBreakdown.isRemake}
                        />
                        <button
                          type="button"
                          title="Vista rápida"
                          aria-label="Vista rápida de la partida"
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setHoveredMatchSummary({
                              match,
                              participant: userPart,
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
                            onSelectMatch(match.matchId);
                          }}
                          className="p-1 rounded border border-border bg-background/60 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] font-mono text-muted-foreground">
                      <span>KP {Math.round(userPart.killParticipation * 100)}%</span>
                      <span>
                        {userPart.cs} CS ({userPart.csPerMin.toFixed(1)})
                      </span>
                      <span>
                        {formatCompactNumber(userPart.damageToChampions)} DMG ({dmgPct}%)
                      </span>
                      <span>
                        {userPart.visionScore} Vis ({(userPart.visionScore / mins).toFixed(1)}/m)
                      </span>
                    </div>

                    {userPart.highlights.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {userPart.highlights.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="px-1.5 py-0 text-[9px] font-mono bg-background/50"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Col 4: 2x5 Champion Grid (Blue row 1, Red row 2) with per-player hover */}
                  <div className="lg:col-span-3 space-y-1 shrink-0">
                    {[team100, team200].map((teamRoster, teamIdx) => (
                      <div
                        key={teamIdx}
                        className={cn(
                          'grid grid-cols-5 gap-1 p-1 rounded border bg-background/45',
                          teamIdx === 0
                            ? 'border-sky-500/25'
                            : 'border-rose-500/25'
                        )}
                      >
                        {teamRoster.map((p) => {
                          const isUser = p.puuid === targetPuuid;
                          const isGroup = !isUser && groupPuuids.has(p.puuid);
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
                                  'text-[8.5px] font-mono truncate max-w-full leading-none',
                                  isUser
                                    ? 'text-amber-300 font-bold'
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
          })
        )}

        {filteredRows.length > visibleLimit && (
          <div className="pt-2 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setVisibleLimit((prev) => prev + 15)}
            >
              <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
              <span>Mostrar más ({filteredRows.length - visibleLimit} restantes)</span>
            </Button>
          </div>
        )}
      </CardContent>

      {hoveredParticipant && (
        <ParticipantHoverPortal
          info={hoveredParticipant}
          isInspectedUser={hoveredParticipant.participant.puuid === targetPuuid}
          groupAccount={accountByPuuid.get(hoveredParticipant.participant.puuid)}
          ddragonVersion={ddragonVersion}
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
        />
      )}
    </Card>
  );
};
