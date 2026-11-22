import React, { useMemo, useState } from 'react';
import {
  LolGroupLeaderboardEntry,
  LolQueueCategory,
  LolRiftRoleKey,
  LolRoleLeaderboardByLane,
  LolRoleLeaderboardEntry,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatRoleLabel,
  getGradeColorClasses,
} from '@/lib/lolDdragon';
import { getGradeFromScore, RIFT_ROLE_KEYS } from '@/lib/lolPerformanceEngine';
import {
  LOL_STAT_GLOSSARY,
  LolAnimatedNumber,
  LolChampionAvatar,
  LolInfoTip,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Award,
  Compass,
  Crosshair,
  Flame,
  Heart,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';

export interface LolGroupLeaderboardProps {
  entries: LolGroupLeaderboardEntry[];
  roleLeaderboard: LolRoleLeaderboardByLane;
  selectedUserId: string | null;
  currentUserId?: string | null;
  queueFilter: LolQueueCategory;
  ddragonVersion?: string;
  onSelectPlayer: (userId: string) => void;
  onSelectChampion?: (userId: string, championName: string) => void;
}

const ChampionChipButton: React.FC<{
  userId: string;
  championName: string;
  version: string;
  onSelectChampion?: (userId: string, championName: string) => void;
}> = ({ userId, championName, version, onSelectChampion }) => {
  const inner = (
    <>
      <LolChampionAvatar
        championName={championName}
        version={version}
        size="xs"
        className="w-3.5 h-3.5 rounded-sm"
      />
      <span className="truncate">{championName}</span>
    </>
  );

  if (!onSelectChampion) {
    return <span className="inline-flex items-center gap-1 min-w-0">{inner}</span>;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelectChampion(userId, championName);
      }}
      title="Ver análisis con campeón"
      className="inline-flex items-center gap-1 min-w-0 text-left hover:text-primary transition-colors cursor-pointer"
    >
      {inner}
    </button>
  );
};

type LeaderboardViewMode = 'general' | 'role';
type LeaderboardSortKey = 'rankScore' | 'performance' | 'games' | 'winRate';
type LaneFilterSelection = 'ALL' | LolRiftRoleKey;

const ROLE_ICON_MAP: Record<LolRiftRoleKey, React.ReactNode> = {
  TOP: <Shield className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />,
  JUNGLE: <Compass className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />,
  MIDDLE: <Flame className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.75} />,
  BOTTOM: <Crosshair className="w-3.5 h-3.5 text-rose-400" strokeWidth={1.75} />,
  UTILITY: <Heart className="w-3.5 h-3.5 text-violet-400" strokeWidth={1.75} />,
};

export const LolGroupLeaderboard: React.FC<LolGroupLeaderboardProps> = ({
  entries,
  roleLeaderboard,
  selectedUserId,
  currentUserId,
  queueFilter,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectPlayer,
  onSelectChampion,
}) => {
  const [viewMode, setViewMode] = useState<LeaderboardViewMode>('general');
  const [sortBy, setSortBy] = useState<LeaderboardSortKey>('rankScore');
  const [selectedLane, setSelectedLane] = useState<LaneFilterSelection>('ALL');
  const yoUserId = currentUserId !== undefined ? currentUserId : selectedUserId;

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (sortBy === 'performance') {
        if (b.groupPerformanceAvg !== a.groupPerformanceAvg) {
          return b.groupPerformanceAvg - a.groupPerformanceAvg;
        }
        return b.groupGamesScored - a.groupGamesScored;
      }
      if (sortBy === 'games') {
        if (b.groupGamesTotal !== a.groupGamesTotal) {
          return b.groupGamesTotal - a.groupGamesTotal;
        }
        return b.groupRankScore - a.groupRankScore;
      }
      if (sortBy === 'winRate') {
        if (b.groupWinRate !== a.groupWinRate) {
          return b.groupWinRate - a.groupWinRate;
        }
        return b.groupGamesScored - a.groupGamesScored;
      }
      if (b.groupRankScore !== a.groupRankScore) {
        return b.groupRankScore - a.groupRankScore;
      }
      return b.groupGamesTotal - a.groupGamesTotal;
    });
  }, [entries, sortBy]);

  const activeLaneEntries: LolRoleLeaderboardEntry[] =
    selectedLane === 'ALL' ? [] : roleLeaderboard[selectedLane] || [];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Trophy className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
              <span>Top Jugadores</span>
            </CardTitle>
            <Badge variant="default" className="font-mono text-[10px] px-1.5 py-0">
              <Users className="w-2.5 h-2.5" strokeWidth={1.75} />
              ≥2
            </Badge>
            <LolInfoTip
              acronym="TOP"
              title="Ranking Grupal (≥2 miembros)"
              description="Solo cuenta partidas con al menos 2 miembros del grupo (sin remakes). Combina BG-PERF Bayesiano, volumen de partidas y WR."
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Mode Switcher: General vs Por Rol */}
            <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('general')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  viewMode === 'general'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setViewMode('role')}
                className={cn(
                  'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                  viewMode === 'role'
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Por Rol
              </button>
            </div>
          </div>
        </div>

        {/* Contextual Sub-controls */}
        {viewMode === 'general' ? (
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'rankScore', label: 'Score' },
                { id: 'performance', label: 'Perf' },
                { id: 'games', label: 'Partidas' },
                { id: 'winRate', label: 'WR%' },
              ] as Array<{ id: LeaderboardSortKey; label: string }>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortBy(opt.id)}
                className={cn(
                  'px-2 py-0.5 rounded border text-[10px] font-medium cursor-pointer transition-colors',
                  sortBy === opt.id
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedLane('ALL')}
              className={cn(
                'px-2 py-0.5 rounded border text-[10px] font-medium cursor-pointer transition-colors',
                selectedLane === 'ALL'
                  ? 'bg-primary/15 border-primary text-primary font-semibold'
                  : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
              )}
            >
              5 Líneas
            </button>
            {RIFT_ROLE_KEYS.map((lane) => (
              <button
                key={lane}
                type="button"
                onClick={() => setSelectedLane(lane)}
                className={cn(
                  'px-2 py-0.5 rounded border text-[10px] font-medium cursor-pointer transition-colors inline-flex items-center gap-1',
                  selectedLane === lane
                    ? 'bg-primary/15 border-primary text-primary font-semibold'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {ROLE_ICON_MAP[lane]}
                <span>{formatRoleLabel(lane)}</span>
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0 flex-1 min-h-0">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Vinculá al menos 2 cuentas de Riot en el grupo para generar el Top grupal.
          </div>
        ) : viewMode === 'general' ? (
          <div className="max-h-[380px] overflow-y-auto scroller-thin">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 px-2.5">#</TableHead>
                  <TableHead className="px-2">Jugador</TableHead>
                  <TableHead className="px-2">
                    <span className="inline-flex items-center gap-1">
                      Score
                      <LolInfoTip
                        acronym="Score"
                        title="Score Bayesiano"
                        description="Puntaje grupal (0-100) ponderado por cantidad de partidas compartidas y winrate."
                      />
                    </span>
                  </TableHead>
                  <TableHead className="px-2">
                    <span className="inline-flex items-center gap-1">
                      G / WR
                      <LolInfoTip {...LOL_STAT_GLOSSARY.wr} />
                    </span>
                  </TableHead>
                  <TableHead className="px-2.5 text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      KDA
                      <LolInfoTip {...LOL_STAT_GLOSSARY.kda} />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody key={`general-${sortBy}`}>
                {sortedEntries.map((entry, idx) => {
                  const isSelected = selectedUserId === entry.userId;
                  const isSelf = Boolean(yoUserId && yoUserId === entry.userId);
                  const grade = getGradeFromScore(entry.groupPerformanceAvg);
                  const version = entry.account.ddragonVersion || ddragonVersion;

                  return (
                    <TableRow
                      key={entry.userId}
                      style={{ animationDelay: `${idx * 40}ms` }}
                      onClick={() => onSelectPlayer(entry.userId)}
                      className={cn(
                        'cursor-pointer animate-lol-row-slide transition-colors',
                        isSelected && 'bg-primary/10 hover:bg-primary/15'
                      )}
                    >
                      <TableCell className="font-mono font-bold px-2.5 py-2">
                        {idx === 0 && entry.groupGamesScored > 0 ? (
                          <Trophy className="w-3.5 h-3.5 text-amber-400 animate-pulse" strokeWidth={1.75} />
                        ) : (
                          <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                        )}
                      </TableCell>

                      <TableCell className="px-2 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={entry.avatarUrl}
                            alt={entry.displayName}
                            className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-foreground truncate max-w-[110px]">
                                {entry.displayName}
                              </span>
                              {isSelf && (
                                <Badge variant="default" className="text-[9px] px-1 py-0">
                                  Yo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground truncate max-w-[155px]">
                              {entry.topGroupChampion ? (
                                <ChampionChipButton
                                  userId={entry.userId}
                                  championName={entry.topGroupChampion.championName}
                                  version={version}
                                  onSelectChampion={onSelectChampion}
                                />
                              ) : (
                                <span>
                                  {queueFilter === 'all' ? 'Sin partidas' : 'Sin en cola'}
                                </span>
                              )}
                              {entry.topDuoPartner && (
                                <span className="opacity-75 truncate">
                                  · c/ {entry.topDuoPartner.displayName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono px-2 py-2">
                        {entry.groupGamesScored > 0 ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <LolAnimatedNumber
                                value={entry.groupRankScore}
                                decimals={1}
                                durationMs={520}
                                className="font-bold text-primary"
                              />
                              <span
                                className={cn(
                                  'px-1 py-0 rounded border text-[9.5px] font-bold leading-tight',
                                  getGradeColorClasses(grade)
                                )}
                              >
                                {entry.groupPerformanceAvg.toFixed(1)} {grade}
                              </span>
                            </div>
                            <div className="h-1 w-20 rounded-full bg-secondary overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary animate-lol-bar-grow"
                                style={{
                                  width: `${Math.min(100, Math.max(0, entry.groupRankScore))}%`,
                                  animationDelay: `${idx * 40 + 60}ms`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span
                            className="text-[10px] text-muted-foreground"
                            title="0G en grupo"
                          >
                            Sin en grupo
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="font-mono text-[10.5px] px-2 py-2">
                        <div className="font-bold text-foreground whitespace-nowrap">
                          {entry.groupGamesTotal}G · {entry.groupWinRate}%
                        </div>
                        <div className="flex items-center gap-1 text-[9.5px]">
                          <span className="text-success">{entry.groupWins}V</span>
                          <span className="text-destructive">
                            {entry.groupLosses + entry.groupFfs}D
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-[10.5px] px-2.5 py-2 text-right">
                        <div className="font-semibold text-foreground">
                          {entry.groupKdaAvg.toFixed(2)}
                        </div>
                        <div className="text-[9.5px] text-muted-foreground inline-flex items-center justify-end gap-1.5">
                          <span className="text-amber-300">{entry.groupMvpCount}M</span>
                          <span className="inline-flex items-center gap-0.5 text-primary">
                            <Award className="w-2.5 h-2.5" strokeWidth={1.75} />
                            {entry.groupAceCount}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : selectedLane === 'ALL' ? (
          /* View: 5 Lanes Summary */
          <div className="p-3 pt-1 max-h-[380px] overflow-y-auto scroller-thin space-y-2">
            {RIFT_ROLE_KEYS.map((lane, lIdx) => {
              const laneList = roleLeaderboard[lane] || [];
              const leader = laneList[0] ?? null;

              return (
                <div
                  key={lane}
                  style={{ animationDelay: `${lIdx * 40}ms` }}
                  className="p-2 rounded-md border border-border bg-background/45 space-y-1.5 animate-lol-row-slide transition-colors hover:border-border/90"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {ROLE_ICON_MAP[lane]}
                      <span className="text-xs font-bold text-foreground">
                        {formatRoleLabel(lane)}
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
                        {laneList.length} jug.
                      </Badge>
                    </div>

                    {laneList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedLane(lane)}
                        className="text-[10px] font-mono text-primary hover:underline cursor-pointer"
                      >
                        Ver top →
                      </button>
                    )}
                  </div>

                  {!leader ? (
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Sin partidas grupales registradas en {formatRoleLabel(lane)}.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectPlayer(leader.userId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectPlayer(leader.userId);
                          }
                        }}
                        className={cn(
                          'w-full flex items-center justify-between gap-2 p-1.5 rounded border text-left transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring',
                          selectedUserId === leader.userId
                            ? 'bg-primary/15 border-primary'
                            : 'bg-background/60 border-border/80 hover:bg-muted/60'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" strokeWidth={1.75} />
                          <img
                            src={leader.avatarUrl}
                            alt={leader.displayName}
                            className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {leader.displayName}
                              </span>
                              {yoUserId === leader.userId && (
                                <Badge variant="default" className="text-[9px] px-1 py-0">
                                  Yo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground min-w-0">
                              {leader.topChampion ? (
                                <ChampionChipButton
                                  userId={leader.userId}
                                  championName={leader.topChampion.championName}
                                  version={leader.account.ddragonVersion || ddragonVersion}
                                  onSelectChampion={onSelectChampion}
                                />
                              ) : (
                                <span className="truncate">{leader.account.gameName}</span>
                              )}
                              <span className="shrink-0">
                                · {leader.games}G · {leader.avgKda.toFixed(1)} KDA
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          <div className="text-xs font-bold text-primary">
                            {leader.roleRankScore.toFixed(1)}
                            <span
                              className={cn(
                                'ml-1.5 px-1 py-0 rounded border text-[9px]',
                                getGradeColorClasses(getGradeFromScore(leader.avgPerformance))
                              )}
                            >
                              {getGradeFromScore(leader.avgPerformance)}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {leader.winRate}% WR
                          </div>
                        </div>
                      </div>

                      {laneList.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {laneList.slice(1, 4).map((runner, rIdx) => (
                            <button
                              key={runner.userId}
                              type="button"
                              onClick={() => onSelectPlayer(runner.userId)}
                              className="px-1.5 py-0.5 rounded border border-border bg-background/40 hover:bg-muted/60 text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                            >
                              #{rIdx + 2} {runner.displayName} ({runner.roleRankScore.toFixed(0)} · {runner.games}G)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* View: Specific Lane Table */
          <div className="max-h-[380px] overflow-y-auto scroller-thin">
            {activeLaneEntries.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Sin partidas grupales en {formatRoleLabel(selectedLane)}.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8 px-2.5">#</TableHead>
                    <TableHead className="px-2">Jugador</TableHead>
                    <TableHead className="px-2">Score / Perf</TableHead>
                    <TableHead className="px-2.5 text-right">Partidas / KDA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody key={`lane-${selectedLane}`}>
                  {activeLaneEntries.map((entry, idx) => {
                    const grade = getGradeFromScore(entry.avgPerformance);
                    const isSelected = selectedUserId === entry.userId;
                    const isSelf = Boolean(yoUserId && yoUserId === entry.userId);
                    return (
                      <TableRow
                        key={entry.userId}
                        style={{ animationDelay: `${idx * 40}ms` }}
                        onClick={() => onSelectPlayer(entry.userId)}
                        className={cn(
                          'cursor-pointer animate-lol-row-slide',
                          isSelected && 'bg-primary/10 hover:bg-primary/15'
                        )}
                      >
                        <TableCell className="font-mono font-bold px-2.5 py-2">
                          {idx === 0 ? (
                            <Trophy className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                          ) : (
                            <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={entry.avatarUrl}
                              alt={entry.displayName}
                              className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-semibold text-foreground truncate">
                                  {entry.displayName}
                                </span>
                                {isSelf && (
                                  <Badge variant="default" className="text-[9px] px-1 py-0">
                                    Yo
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground min-w-0">
                                {entry.topChampion ? (
                                  <ChampionChipButton
                                    userId={entry.userId}
                                    championName={entry.topChampion.championName}
                                    version={entry.account.ddragonVersion || ddragonVersion}
                                    onSelectChampion={onSelectChampion}
                                  />
                                ) : (
                                  <span className="truncate">{entry.account.gameName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono px-2 py-2">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-bold text-primary">
                              {entry.roleRankScore.toFixed(1)}
                            </span>
                            <span
                              className={cn(
                                'px-1 py-0 rounded border text-[9.5px] font-bold',
                                getGradeColorClasses(grade)
                              )}
                            >
                              {entry.avgPerformance.toFixed(1)} {grade}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[10.5px] px-2.5 py-2 text-right">
                          <div className="font-bold text-foreground">
                            {entry.games}G · {entry.winRate}% · {entry.avgKda.toFixed(2)} KDA
                          </div>
                          <div className="inline-flex items-center gap-1 text-[9.5px]">
                            <span className="text-success">{entry.wins}V</span>
                            <span className="text-destructive">{entry.losses + entry.ffs}D</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
