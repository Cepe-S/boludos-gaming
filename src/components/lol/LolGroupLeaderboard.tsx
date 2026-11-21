import React, { useMemo, useState } from 'react';
import { LolGroupLeaderboardEntry, LolQueueCategory } from '@/types/lol';
import { DEFAULT_DDRAGON_VERSION, getGradeColorClasses } from '@/lib/lolDdragon';
import { getGradeFromScore } from '@/lib/lolPerformanceEngine';
import { LolChampionAvatar } from './LolPrimitives';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Award, Crown, HelpCircle, Trophy, Users } from 'lucide-react';

export interface LolGroupLeaderboardProps {
  entries: LolGroupLeaderboardEntry[];
  selectedUserId: string | null;
  queueFilter: LolQueueCategory;
  ddragonVersion?: string;
  onSelectPlayer: (userId: string) => void;
}

type LeaderboardSortKey = 'rankScore' | 'performance' | 'games' | 'winRate';

export const LolGroupLeaderboard: React.FC<LolGroupLeaderboardProps> = ({
  entries,
  selectedUserId,
  queueFilter,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectPlayer,
}) => {
  const [sortBy, setSortBy] = useState<LeaderboardSortKey>('rankScore');

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

  return (
    <Card>
      <CardHeader className="pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
              <span>Top Jugadores del Grupo</span>
            </CardTitle>
            <Badge variant="default" className="font-mono text-[10px]">
              <Users className="w-3 h-3" strokeWidth={1.75} />
              ≥2 del grupo
            </Badge>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Fórmula del Top Grupal"
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Solo cuenta partidas con ≥2 jugadores del grupo (excluye remakes). Combina
                Performance Bayesiano (k=5) + bonus por volumen de partidas grupales + Winrate.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1">
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
                  'px-2 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition-colors',
                  sortBy === opt.id
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-x-auto">
        {sortedEntries.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Vinculá al menos 2 cuentas de Riot en el grupo para generar el Top grupal.
          </div>
        ) : (
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Jugador</TableHead>
                <TableHead>Score Grupo</TableHead>
                <TableHead>Perf. Grupo</TableHead>
                <TableHead>Partidas (≥2)</TableHead>
                <TableHead>KDA / MVP</TableHead>
                <TableHead>Main &amp; Dúo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.map((entry, idx) => {
                const isSelected = selectedUserId === entry.userId;
                const grade = getGradeFromScore(entry.groupPerformanceAvg);
                const version = entry.account.ddragonVersion || ddragonVersion;

                return (
                  <TableRow
                    key={entry.userId}
                    onClick={() => onSelectPlayer(entry.userId)}
                    className={cn(
                      'cursor-pointer',
                      isSelected && 'bg-primary/10 hover:bg-primary/15'
                    )}
                  >
                    <TableCell className="font-mono font-bold">
                      {idx === 0 && entry.groupGamesScored > 0 ? (
                        <Crown className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
                      ) : (
                        <span className="text-muted-foreground">#{idx + 1}</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <img
                          src={entry.avatarUrl}
                          alt={entry.displayName}
                          className="w-7 h-7 rounded-full object-cover border border-border shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {entry.displayName}
                            </span>
                            {isSelected && (
                              <Badge variant="default" className="text-[9px] px-1 py-0">
                                Activo
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {entry.account.gameName}#{entry.account.tagLine}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono">
                      {entry.groupGamesScored > 0 ? (
                        <div className="space-y-1 max-w-[110px]">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-primary">{entry.groupRankScore.toFixed(1)}</span>
                            <span className="text-[10px] text-muted-foreground">/100</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.min(100, Math.max(0, entry.groupRankScore))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono">
                      {entry.groupGamesScored > 0 ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold',
                            getGradeColorClasses(grade)
                          )}
                        >
                          {entry.groupPerformanceAvg.toFixed(1)} {grade}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          Global: {entry.personalPerformanceAvg.toFixed(1)}
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-[11px]">
                      <div className="font-bold text-foreground">
                        {entry.groupGamesTotal}G · {entry.groupWinRate}% WR
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        <span className="text-success">{entry.groupWins}V</span> /{' '}
                        <span className="text-destructive">{entry.groupLosses}D</span> /{' '}
                        <span className="text-warning">{entry.groupFfs}FF</span>
                      </div>
                    </TableCell>

                    <TableCell className="font-mono text-[11px]">
                      <div className="font-semibold text-foreground">
                        {entry.groupKdaAvg.toFixed(2)} KDA
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <span className="text-amber-300">{entry.groupMvpCount} MVP</span>
                        <span className="inline-flex items-center gap-0.5 text-primary">
                          <Award className="w-3 h-3" strokeWidth={1.75} />
                          {entry.groupAceCount}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        {entry.topGroupChampion ? (
                          <LolChampionAvatar
                            championName={entry.topGroupChampion.championName}
                            version={version}
                            size="xs"
                          />
                        ) : null}
                        <div className="text-[10px] font-mono min-w-0">
                          <span className="text-foreground font-semibold block truncate">
                            {entry.topGroupChampion
                              ? `${entry.topGroupChampion.championName} (${entry.topGroupChampion.games}G)`
                              : queueFilter === 'all'
                                ? 'Sin partidas'
                                : 'Sin en cola'}
                          </span>
                          {entry.topDuoPartner && (
                            <span className="text-muted-foreground block truncate">
                              Dúo: {entry.topDuoPartner.displayName} ({entry.topDuoPartner.gamesTogether}G · {entry.topDuoPartner.winRateTogether}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
