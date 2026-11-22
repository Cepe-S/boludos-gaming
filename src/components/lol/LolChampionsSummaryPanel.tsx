import React, { useMemo, useState } from 'react';
import {
  LolChampionSummary,
  LolGroupPickEntry,
  LolGroupPicksResult,
  LolViewMode,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatRoleLabel,
  getGradeColorClasses,
} from '@/lib/lolDdragon';
import { getGradeFromScore } from '@/lib/lolPerformanceEngine';
import {
  LOL_STAT_GLOSSARY,
  LolChampionAvatar,
  LolInfoTip,
  LolPickScoreTooltip,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Award, Swords, TrendingDown, TrendingUp } from 'lucide-react';

export type LolChampionsSummaryPanelProps =
  | {
      mode: Extract<LolViewMode, 'personal'>;
      champions: LolChampionSummary[];
      ddragonVersion?: string;
      onSelectChampion: (championName: string) => void;
      onOpenModal: () => void;
    }
  | {
      mode: Extract<LolViewMode, 'group'>;
      picksResult: LolGroupPicksResult;
      ddragonVersion?: string;
      onSelectPick: (userId: string, championName: string) => void;
      onOpenModal: (initialTab?: 'all' | 'best' | 'worst') => void;
    };

type PersonalSortKey = 'games' | 'performance' | 'winRate' | 'kda';

const PERSONAL_SORT_OPTIONS: Array<{ id: PersonalSortKey; label: string }> = [
  { id: 'games', label: 'Partidas' },
  { id: 'performance', label: 'Perf' },
  { id: 'winRate', label: 'WR%' },
  { id: 'kda', label: 'KDA' },
];

const RecordSplitChips: React.FC<{
  wins: number;
  losses: number;
  ffs: number;
}> = ({ wins, losses, ffs }) => (
  <div className="flex items-center gap-1 text-[9.5px] font-mono">
    <span className="text-success">{wins}V</span>
    <span className="text-destructive">{losses + ffs}D</span>
  </div>
);

interface GroupPicksTableProps {
  title: string;
  tone: 'best' | 'worst';
  icon: React.ReactNode;
  picks: LolGroupPickEntry[];
  minGames: number;
  ddragonVersion: string;
  onSelectPick: (userId: string, championName: string) => void;
  onOpenMore: () => void;
}

const GroupPicksTable: React.FC<GroupPicksTableProps> = ({
  title,
  tone,
  icon,
  picks,
  minGames,
  ddragonVersion,
  onSelectPick,
  onOpenMore,
}) => {
  return (
    <div className="rounded-md border border-border bg-background/40 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/70 bg-background/45">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="text-xs font-semibold text-foreground truncate">{title}</span>
          <Badge
            variant={tone === 'best' ? 'success' : 'destructive'}
            className="font-mono text-[10px] px-1.5 py-0"
          >
            {picks.length}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onOpenMore}
          title={`Ver más ${title.toLowerCase()}`}
        >
          Ver más
        </Button>
      </div>

      {picks.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          {tone === 'worst'
            ? `Se necesitan al menos 2 picks calificados (≥${minGames}G) para mostrar el ranking inferior.`
            : `Sin picks calificados (≥${minGames}G).`}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 px-2.5">#</TableHead>
              <TableHead className="px-2">Jugador × Campeón</TableHead>
              <TableHead className="px-2">
                <span className="inline-flex items-center gap-1">
                  Perf / Score
                  <LolInfoTip {...LOL_STAT_GLOSSARY.pickScore} />
                </span>
              </TableHead>
              <TableHead className="px-2">Partidas / WR</TableHead>
              <TableHead className="px-2.5 text-right">KDA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {picks.map((pick, idx) => {
              const grade = getGradeFromScore(pick.avgPerformance);
              const champVersion = pick.account.ddragonVersion || ddragonVersion;
              return (
                <TableRow
                  key={pick.pickKey}
                  style={{ animationDelay: `${idx * 35}ms` }}
                  onClick={() => onSelectPick(pick.userId, pick.championName)}
                  className="cursor-pointer animate-lol-row-slide"
                >
                  <TableCell className="font-mono font-bold px-2.5 py-2 text-xs text-muted-foreground">
                    #{idx + 1}
                  </TableCell>

                  <TableCell className="px-2 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {pick.avatarUrl ? (
                        <img
                          src={pick.avatarUrl}
                          alt={pick.displayName}
                          className="w-6 h-6 rounded-full object-cover border border-border shrink-0"
                        />
                      ) : (
                        <span className="w-6 h-6 rounded-full border border-border bg-secondary/70 flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">
                          {pick.displayName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <LolChampionAvatar
                        championName={pick.championName}
                        version={champVersion}
                        size="xs"
                        className="w-6 h-6"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate block max-w-[140px]">
                          {pick.displayName}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground truncate block max-w-[140px]">
                          {pick.championName} · {formatRoleLabel(pick.primaryRole)}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="font-mono px-2 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1 py-0 rounded border text-[10px] font-bold leading-tight',
                        getGradeColorClasses(grade)
                      )}
                    >
                      {pick.avgPerformance.toFixed(1)} {grade}
                    </span>
                    <LolPickScoreTooltip pick={pick} tone={tone}>
                      <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                        <span>Pick</span>
                        <span
                          className={cn(
                            'font-bold',
                            tone === 'best' ? 'text-success' : 'text-destructive'
                          )}
                        >
                          {pick.pickScore.toFixed(1)}
                        </span>
                      </div>
                    </LolPickScoreTooltip>
                  </TableCell>

                  <TableCell className="font-mono text-[10.5px] px-2 py-2">
                    <div className="font-bold text-foreground whitespace-nowrap">
                      {pick.games}G · {pick.winRate}%
                    </div>
                    <RecordSplitChips
                      wins={pick.wins}
                      losses={pick.losses}
                      ffs={pick.ffs}
                    />
                  </TableCell>

                  <TableCell className="font-mono text-[10.5px] px-2.5 py-2 text-right">
                    <div className="font-semibold text-foreground">
                      {pick.avgKda.toFixed(2)}
                    </div>
                    <div className="text-[9.5px] text-muted-foreground whitespace-nowrap">
                      {pick.avgKills.toFixed(1)}/{pick.avgDeaths.toFixed(1)}/{pick.avgAssists.toFixed(1)}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};

const PersonalChampionsSummary: React.FC<{
  champions: LolChampionSummary[];
  ddragonVersion: string;
  onSelectChampion: (championName: string) => void;
  onOpenModal: () => void;
}> = ({ champions, ddragonVersion, onSelectChampion, onOpenModal }) => {
  const [sortBy, setSortBy] = useState<PersonalSortKey>('games');

  const sortedChampions = useMemo(() => {
    return [...champions].sort((a, b) => {
      if (sortBy === 'performance') {
        return (
          b.avgPerformance - a.avgPerformance ||
          b.games - a.games ||
          b.winRate - a.winRate
        );
      }
      if (sortBy === 'winRate') {
        return (
          b.winRate - a.winRate ||
          b.games - a.games ||
          b.avgPerformance - a.avgPerformance
        );
      }
      if (sortBy === 'kda') {
        return (
          b.avgKda - a.avgKda ||
          b.games - a.games ||
          b.avgPerformance - a.avgPerformance
        );
      }
      return (
        b.games - a.games ||
        b.avgPerformance - a.avgPerformance ||
        b.winRate - a.winRate
      );
    });
  }, [champions, sortBy]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Award className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Campeones Más Jugados</span>
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {champions.length}
            </Badge>
          </div>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onOpenModal}
            title="Ver tabla completa de campeones"
          >
            Ver todos
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {PERSONAL_SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSortBy(opt.id)}
              className={cn(
                'px-2 py-0.5 rounded border text-[10px] font-medium cursor-pointer transition-colors',
                sortBy === opt.id
                  ? 'bg-primary/15 border-primary text-primary font-semibold'
                  : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 min-h-0">
        {sortedChampions.length === 0 ? (
          <div className="p-3 pt-1">
            <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30 animate-lol-card-pop">
              Sin campeones registrados en el filtro actual.
            </div>
          </div>
        ) : (
          <div className="max-h-[396px] overflow-y-auto scroller-thin">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-2.5">Campeón</TableHead>
                  <TableHead className="px-2">Partidas</TableHead>
                  <TableHead className="px-2">WR%</TableHead>
                  <TableHead className="px-2">Perf</TableHead>
                  <TableHead className="px-2.5 text-right">KDA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody key={`personal-champs-${sortBy}`}>
                {sortedChampions.map((champ, idx) => {
                  const grade = getGradeFromScore(champ.avgPerformance);
                  return (
                    <TableRow
                      key={`${champ.championId}-${champ.championName}`}
                      style={{ animationDelay: `${idx * 30}ms` }}
                      onClick={() => onSelectChampion(champ.championName)}
                      className="cursor-pointer animate-lol-row-slide"
                    >
                      <TableCell className="px-2.5 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <LolChampionAvatar
                            championName={champ.championName}
                            version={ddragonVersion}
                            size="xs"
                            className="w-7 h-7"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate block max-w-[115px]">
                              {champ.championName}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground block">
                              {formatRoleLabel(champ.primaryRole)}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-[10.5px] px-2 py-2">
                        <div className="font-bold text-foreground whitespace-nowrap">
                          {champ.games}G
                        </div>
                        <RecordSplitChips
                          wins={champ.wins}
                          losses={champ.losses}
                          ffs={champ.ffs}
                        />
                      </TableCell>

                      <TableCell className="font-mono text-xs font-bold px-2 py-2 whitespace-nowrap">
                        <span
                          className={
                            champ.winRate >= 50 ? 'text-success' : 'text-destructive'
                          }
                        >
                          {champ.winRate}%
                        </span>
                      </TableCell>

                      <TableCell className="font-mono px-2 py-2 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-1 py-0 rounded border text-[10px] font-bold leading-tight',
                            getGradeColorClasses(grade)
                          )}
                        >
                          {champ.avgPerformance.toFixed(1)} {grade}
                        </span>
                      </TableCell>

                      <TableCell className="font-mono text-xs font-semibold text-foreground px-2.5 py-2 text-right whitespace-nowrap">
                        {champ.avgKda.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const LolChampionsSummaryPanel: React.FC<LolChampionsSummaryPanelProps> = (
  props
) => {
  const ddragonVersion = props.ddragonVersion ?? DEFAULT_DDRAGON_VERSION;

  if (props.mode === 'personal') {
    return (
      <PersonalChampionsSummary
        champions={props.champions}
        ddragonVersion={ddragonVersion}
        onSelectChampion={props.onSelectChampion}
        onOpenModal={props.onOpenModal}
      />
    );
  }

  const { picksResult, onSelectPick, onOpenModal } = props;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Swords className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Picks del Grupo</span>
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {picksResult.allPicks.length} picks · ≥{picksResult.minGames}G
            </Badge>
            <LolInfoTip
              acronym="Picks"
              title="Picks del Grupo"
              description="Jugador × campeón (≥3G grupales). El Pick Score pondera impacto del jugador vs su equipo y lobby en cada game, duelo y dificultad de rivales, BG-PERF, WR ajustado por mérito (anti-pasajero), sinergia y FF."
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onOpenModal('all')}
            title="Explorar todos los picks del grupo"
          >
            Explorar todos
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-2">
        {picksResult.allPicks.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30 animate-lol-card-pop">
            Se necesitan al menos {picksResult.minGames} partidas grupales con un mismo campeón en el período filtrado.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <GroupPicksTable
              title="Mejores Picks"
              tone="best"
              icon={<TrendingUp className="w-4 h-4 text-success" strokeWidth={1.75} />}
              picks={picksResult.bestPicks}
              minGames={picksResult.minGames}
              ddragonVersion={ddragonVersion}
              onSelectPick={onSelectPick}
              onOpenMore={() => onOpenModal('best')}
            />
            <GroupPicksTable
              title="Peores Picks"
              tone="worst"
              icon={<TrendingDown className="w-4 h-4 text-destructive" strokeWidth={1.75} />}
              picks={picksResult.worstPicks}
              minGames={picksResult.minGames}
              ddragonVersion={ddragonVersion}
              onSelectPick={onSelectPick}
              onOpenMore={() => onOpenModal('worst')}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
