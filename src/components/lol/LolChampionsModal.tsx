import React, { useEffect, useMemo, useState } from 'react';
import {
  LolAccount,
  LolChampionSummary,
  LolGroupPickEntry,
  LolGroupPicksResult,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatCompactNumber,
  formatRoleLabel,
  getGradeColorClasses,
  getProfileIconUrl,
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
import { Input } from '@/components/ui/input';
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
  ArrowDown,
  ArrowUp,
  Award,
  Crown,
  Search,
  Swords,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';

export type LolChampionsModalProps = (
  | {
      mode: 'personal';
      account: LolAccount;
      displayName: string;
      champions: LolChampionSummary[];
      onSelectChampion: (userId: string, championName: string) => void;
    }
  | {
      mode: 'group';
      groupName: string;
      picksResult: LolGroupPicksResult;
      initialTab?: 'all' | 'best' | 'worst';
      onSelectChampion: (userId: string, championName: string) => void;
    }
) & {
  ddragonVersion?: string;
  isSuppressed?: boolean;
  onClose: () => void;
};

type PersonalSortKey = 'games' | 'perf' | 'wr' | 'kda' | 'cs' | 'dpm';
type GroupSortKey = 'pickScore' | 'perf' | 'games' | 'wr' | 'kda';
type GroupTabKey = 'all' | 'best' | 'worst';
type SortDirection = 'desc' | 'asc';

const PERSONAL_SORT_OPTIONS: ReadonlyArray<{ id: PersonalSortKey; label: string }> = [
  { id: 'games', label: 'Partidas' },
  { id: 'perf', label: 'BG-PERF' },
  { id: 'wr', label: 'WR%' },
  { id: 'kda', label: 'KDA' },
  { id: 'cs', label: 'CS/m' },
  { id: 'dpm', label: 'DPM' },
];

const GROUP_SORT_OPTIONS: ReadonlyArray<{ id: GroupSortKey; label: string }> = [
  { id: 'pickScore', label: 'Pick Score' },
  { id: 'perf', label: 'BG-PERF' },
  { id: 'games', label: 'Partidas' },
  { id: 'wr', label: 'WR%' },
  { id: 'kda', label: 'KDA' },
];

function getWinRateTextClass(winRate: number): string {
  if (winRate >= 55) return 'text-success';
  if (winRate <= 45) return 'text-destructive';
  return 'text-foreground';
}

const PlayerMiniAvatar: React.FC<{
  avatarUrl: string;
  profileIconId: number;
  displayName: string;
  version: string;
  sizeClass?: string;
}> = ({ avatarUrl, profileIconId, displayName, version, sizeClass = 'w-6 h-6' }) => {
  const [fallbackActive, setFallbackActive] = useState(false);
  const src =
    !fallbackActive && avatarUrl.trim().length > 0
      ? avatarUrl
      : getProfileIconUrl(profileIconId, version);

  return (
    <img
      src={src}
      alt={displayName}
      loading="lazy"
      onError={() => {
        if (!fallbackActive) setFallbackActive(true);
      }}
      className={cn(
        sizeClass,
        'rounded-md object-cover border border-white/15 bg-secondary shrink-0'
      )}
    />
  );
};

interface SortPillsProps<T extends string> {
  options: ReadonlyArray<{ id: T; label: string }>;
  activeKey: T;
  direction: SortDirection;
  onSelect: (key: T) => void;
}

function SortPillsBar<T extends string>({
  options,
  activeKey,
  direction,
  onSelect,
}: SortPillsProps<T>) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((opt) => {
        const isActive = opt.id === activeKey;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors',
              isActive
                ? 'bg-primary/20 border-primary text-primary font-semibold'
                : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{opt.label}</span>
            {isActive &&
              (direction === 'desc' ? (
                <ArrowDown className="w-3 h-3" strokeWidth={1.75} />
              ) : (
                <ArrowUp className="w-3 h-3" strokeWidth={1.75} />
              ))}
          </button>
        );
      })}
    </div>
  );
}

export const LolChampionsModal: React.FC<LolChampionsModalProps> = (props) => {
  const {
    ddragonVersion = DEFAULT_DDRAGON_VERSION,
    isSuppressed = false,
    onClose,
  } = props;

  const [search, setSearch] = useState('');

  // Personal state
  const [personalSortKey, setPersonalSortKey] = useState<PersonalSortKey>('games');
  const [personalSortDir, setPersonalSortDir] = useState<SortDirection>('desc');

  // Group state
  const initialGroupTab: GroupTabKey =
    props.mode === 'group' ? (props.initialTab ?? 'all') : 'all';
  const [groupTab, setGroupTab] = useState<GroupTabKey>(initialGroupTab);
  const [groupSortKey, setGroupSortKey] = useState<GroupSortKey>('pickScore');
  const [groupSortDir, setGroupSortDir] = useState<SortDirection>(
    initialGroupTab === 'worst' ? 'asc' : 'desc'
  );
  const [showAllInGroupTab, setShowAllInGroupTab] = useState(false);

  const propInitialTab = props.mode === 'group' ? props.initialTab : undefined;
  useEffect(() => {
    if (props.mode !== 'group') return;
    const nextTab = propInitialTab ?? 'all';
    setGroupTab(nextTab);
    setGroupSortKey('pickScore');
    setGroupSortDir(nextTab === 'worst' ? 'asc' : 'desc');
    setShowAllInGroupTab(false);
  }, [props.mode, propInitialTab]);

  useEffect(() => {
    if (isSuppressed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSuppressed, onClose]);

  const handlePersonalSort = (key: PersonalSortKey) => {
    if (key === personalSortKey) {
      setPersonalSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setPersonalSortKey(key);
      setPersonalSortDir('desc');
    }
  };

  const handleGroupTabChange = (nextTab: GroupTabKey) => {
    setGroupTab(nextTab);
    setGroupSortKey('pickScore');
    setGroupSortDir(nextTab === 'worst' ? 'asc' : 'desc');
    setShowAllInGroupTab(false);
  };

  const handleGroupSort = (key: GroupSortKey) => {
    if (key === groupSortKey) {
      setGroupSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setGroupSortKey(key);
      setGroupSortDir(groupTab === 'worst' && (key === 'pickScore' || key === 'perf') ? 'asc' : 'desc');
    }
  };

  const personalRows = useMemo(() => {
    if (props.mode !== 'personal') return [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? props.champions.filter((c) => {
          const roleLabel = formatRoleLabel(c.primaryRole).toLowerCase();
          return (
            c.championName.toLowerCase().includes(q) ||
            c.primaryRole.toLowerCase().includes(q) ||
            roleLabel.includes(q)
          );
        })
      : props.champions;

    const factor = personalSortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      let diff = 0;
      switch (personalSortKey) {
        case 'games':
          diff = a.games - b.games;
          break;
        case 'perf':
          diff = a.avgPerformance - b.avgPerformance;
          break;
        case 'wr':
          diff = a.winRate - b.winRate;
          break;
        case 'kda':
          diff = a.avgKda - b.avgKda;
          break;
        case 'cs':
          diff = a.avgCsPerMin - b.avgCsPerMin;
          break;
        case 'dpm':
          diff = a.avgDpm - b.avgDpm;
          break;
      }
      if (diff !== 0) return diff * factor;
      return b.games - a.games || b.avgPerformance - a.avgPerformance;
    });
  }, [props, search, personalSortKey, personalSortDir]);

  const groupBestKeys = useMemo(() => {
    if (props.mode !== 'group') return new Set<string>();
    return new Set(props.picksResult.bestPicks.map((p) => p.pickKey));
  }, [props]);

  const groupWorstKeys = useMemo(() => {
    if (props.mode !== 'group') return new Set<string>();
    return new Set(props.picksResult.worstPicks.map((p) => p.pickKey));
  }, [props]);

  const groupRows = useMemo(() => {
    if (props.mode !== 'group') return [];
    const { allPicks, bestPicks, worstPicks } = props.picksResult;

    let basePool: LolGroupPickEntry[];
    if (groupTab === 'all' || showAllInGroupTab) {
      basePool = allPicks;
    } else if (groupTab === 'best') {
      basePool = bestPicks;
    } else {
      basePool = worstPicks;
    }

    const q = search.trim().toLowerCase();
    const filtered = q
      ? basePool.filter((p) => {
          const roleLabel = formatRoleLabel(p.primaryRole).toLowerCase();
          return (
            p.championName.toLowerCase().includes(q) ||
            p.displayName.toLowerCase().includes(q) ||
            p.account.gameName.toLowerCase().includes(q) ||
            p.primaryRole.toLowerCase().includes(q) ||
            roleLabel.includes(q)
          );
        })
      : basePool;

    const factor = groupSortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      let diff = 0;
      switch (groupSortKey) {
        case 'pickScore':
          diff = a.pickScore - b.pickScore;
          break;
        case 'perf':
          diff = a.avgPerformance - b.avgPerformance;
          break;
        case 'games':
          diff = a.games - b.games;
          break;
        case 'wr':
          diff = a.winRate - b.winRate;
          break;
        case 'kda':
          diff = a.avgKda - b.avgKda;
          break;
      }
      if (diff !== 0) return diff * factor;
      return b.games - a.games || (b.pickScore - a.pickScore) * -factor;
    });
  }, [props, groupTab, showAllInGroupTab, search, groupSortKey, groupSortDir]);

  const personalVersion =
    props.mode === 'personal'
      ? props.account.ddragonVersion || ddragonVersion
      : ddragonVersion;

  const dialogLabel =
    props.mode === 'personal'
      ? `Campeones de ${props.displayName}`
      : `Picks del Grupo — ${props.groupName}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
    >
      <div
        className="w-full max-w-[95vw] xl:max-w-[1180px] h-[86vh] flex flex-col overflow-hidden rounded-md border border-white/15 bg-card/95 backdrop-blur-xl text-card-foreground shadow-[0_28px_80px_-16px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-white/5 animate-lol-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-background/55 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {props.mode === 'personal' ? (
            <div className="flex items-center gap-3 min-w-0">
              <PlayerMiniAvatar
                avatarUrl=""
                profileIconId={props.account.profileIconId}
                displayName={props.displayName}
                version={personalVersion}
                sizeClass="w-9 h-9"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
                    Campeones de {props.displayName}
                  </h2>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    <Swords className="w-3 h-3" strokeWidth={1.75} />
                    {props.champions.length} campeones
                  </Badge>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">
                  {props.account.gameName}#{props.account.tagLine}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md border border-primary/40 bg-primary/15 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-primary" strokeWidth={1.75} />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-foreground truncate">
                Picks del Grupo — {props.groupName}
              </h2>
              <Badge variant="default" className="font-mono text-[10px]">
                ≥{props.picksResult.minGames}G
              </Badge>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {props.picksResult.allPicks.length} calificados
              </Badge>
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar modal de campeones"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </Button>
        </div>

        {/* Toolbar: Tabs (group), Search & Sort */}
        <div className="px-4 py-2.5 border-b border-border bg-background/35 space-y-2 shrink-0">
          {props.mode === 'group' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => handleGroupTabChange('all')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5',
                    groupTab === 'all'
                      ? 'bg-primary/20 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span>Todos</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {props.picksResult.allPicks.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGroupTabChange('best')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5',
                    groupTab === 'best'
                      ? 'bg-success/20 text-success font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />
                  <span>Mejores Picks</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {props.picksResult.bestPicks.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGroupTabChange('worst')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors inline-flex items-center gap-1.5',
                    groupTab === 'worst'
                      ? 'bg-destructive/20 text-destructive font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <TrendingDown className="w-3.5 h-3.5 text-destructive" strokeWidth={1.75} />
                  <span>Peores Picks</span>
                  <span className="font-mono text-[10px] opacity-80">
                    {props.picksResult.worstPicks.length}
                  </span>
                </button>
              </div>

              {groupTab !== 'all' && props.picksResult.allPicks.length > 0 && (
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-muted-foreground">
                    {showAllInGroupTab
                      ? `Todos (${props.picksResult.allPicks.length}) · orden ${
                          groupTab === 'worst' ? 'peor primero' : 'mejor primero'
                        }`
                      : `Top ${
                          groupTab === 'best'
                            ? props.picksResult.bestPicks.length
                            : props.picksResult.worstPicks.length
                        } de ${props.picksResult.allPicks.length} calificados`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllInGroupTab((prev) => !prev)}
                    className="px-2 py-0.5 rounded border border-border bg-secondary/70 hover:bg-accent text-foreground cursor-pointer transition-colors"
                  >
                    {showAllInGroupTab
                      ? 'Ver Top'
                      : `Ver todos (${props.picksResult.allPicks.length})`}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-full sm:w-64">
              <Search
                className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth={1.75}
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  props.mode === 'personal'
                    ? 'Buscar campeón o rol...'
                    : 'Buscar jugador o campeón...'
                }
                className="pl-8 h-8"
              />
            </div>

            {props.mode === 'personal' ? (
              <SortPillsBar
                options={PERSONAL_SORT_OPTIONS}
                activeKey={personalSortKey}
                direction={personalSortDir}
                onSelect={handlePersonalSort}
              />
            ) : (
              <SortPillsBar
                options={GROUP_SORT_OPTIONS}
                activeKey={groupSortKey}
                direction={groupSortDir}
                onSelect={handleGroupSort}
              />
            )}
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="flex-1 min-h-0 overflow-auto scroller-thin">
          {props.mode === 'personal' ? (
            personalRows.length === 0 ? (
              <div className="h-full flex items-center justify-center p-8 text-xs text-muted-foreground">
                Sin campeones para el filtro aplicado.
              </div>
            ) : (
              <Table className="min-w-[820px]">
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Campeón</TableHead>
                    <TableHead>Partidas</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        WR%
                        <LolInfoTip {...LOL_STAT_GLOSSARY.wr} />
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        BG-PERF
                        <LolInfoTip {...LOL_STAT_GLOSSARY.bgPerf} />
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        KDA
                        <LolInfoTip {...LOL_STAT_GLOSSARY.kda} />
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        CS/m
                        <LolInfoTip {...LOL_STAT_GLOSSARY.csMin} />
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        DPM
                        <LolInfoTip {...LOL_STAT_GLOSSARY.dpm} />
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        KP%
                        <LolInfoTip {...LOL_STAT_GLOSSARY.kp} />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">MVP / ACE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {personalRows.map((champ, idx) => {
                    const grade = getGradeFromScore(champ.avgPerformance);
                    return (
                      <TableRow
                        key={champ.championName}
                        onClick={() =>
                          props.onSelectChampion(props.account.userId, champ.championName)
                        }
                        className="cursor-pointer group"
                      >
                        <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <LolChampionAvatar
                              championName={champ.championName}
                              version={personalVersion}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {champ.championName}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {formatRoleLabel(champ.primaryRole)}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          <span className="font-bold text-foreground mr-1.5">
                            {champ.games}G
                          </span>
                          <span className="text-[11px] inline-flex items-center gap-1">
                            <span className="text-success font-semibold">{champ.wins}V</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-destructive font-semibold">
                              {champ.losses + champ.ffs}D
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="font-mono font-bold whitespace-nowrap">
                          <span className={getWinRateTextClass(champ.winRate)}>
                            {champ.winRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold',
                              getGradeColorClasses(grade)
                            )}
                          >
                            <span>{champ.avgPerformance.toFixed(1)}</span>
                            <span className="opacity-80">{grade}</span>
                          </span>
                        </TableCell>
                        <TableCell className="font-mono font-semibold text-foreground whitespace-nowrap">
                          {champ.avgKda.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono text-foreground whitespace-nowrap">
                          {champ.avgCsPerMin.toFixed(1)}
                        </TableCell>
                        <TableCell className="font-mono text-foreground whitespace-nowrap">
                          {formatCompactNumber(champ.avgDpm)}
                        </TableCell>
                        <TableCell className="font-mono text-foreground whitespace-nowrap">
                          {Math.round(champ.avgKp * 100)}%
                        </TableCell>
                        <TableCell className="font-mono text-right whitespace-nowrap">
                          {champ.mvpCount === 0 && champ.aceCount === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-2 text-[11px]">
                              {champ.mvpCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-amber-300 font-semibold">
                                  <Crown className="w-3 h-3" strokeWidth={1.75} />
                                  {champ.mvpCount}
                                </span>
                              )}
                              {champ.aceCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-primary font-semibold">
                                  <Award className="w-3 h-3" strokeWidth={1.75} />
                                  {champ.aceCount}
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : groupRows.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8 text-xs text-muted-foreground">
              {props.picksResult.allPicks.length === 0
                ? `Sin picks grupales con ≥${props.picksResult.minGames} partidas en el período filtrado.`
                : groupTab === 'worst' && props.picksResult.worstPicks.length === 0
                  ? 'Se requieren al menos 2 picks calificados para separar Peores Picks.'
                  : 'Sin picks para el filtro de búsqueda.'}
            </div>
          ) : (
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Jugador × Campeón</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Partidas</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      WR%
                      <LolInfoTip {...LOL_STAT_GLOSSARY.wr} />
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      BG-PERF
                      <LolInfoTip {...LOL_STAT_GLOSSARY.bgPerf} />
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      Pick Score
                      <LolInfoTip {...LOL_STAT_GLOSSARY.pickScore} />
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      KDA
                      <LolInfoTip {...LOL_STAT_GLOSSARY.kda} />
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      CS/m
                      <LolInfoTip {...LOL_STAT_GLOSSARY.csMin} />
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      DPM
                      <LolInfoTip {...LOL_STAT_GLOSSARY.dpm} />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupRows.map((pick, idx) => {
                  const grade = getGradeFromScore(pick.avgPerformance);
                  const version = pick.account.ddragonVersion || ddragonVersion;
                  const isBest = groupBestKeys.has(pick.pickKey);
                  const isWorst = groupWorstKeys.has(pick.pickKey);

                  return (
                    <TableRow
                      key={pick.pickKey}
                      onClick={() => props.onSelectChampion(pick.userId, pick.championName)}
                      className="cursor-pointer group"
                    >
                      <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex items-center -space-x-1.5 shrink-0">
                            <PlayerMiniAvatar
                              avatarUrl={pick.avatarUrl}
                              profileIconId={pick.account.profileIconId}
                              displayName={pick.displayName}
                              version={version}
                              sizeClass="w-7 h-7 rounded-full"
                            />
                            <LolChampionAvatar
                              championName={pick.championName}
                              version={version}
                              size="sm"
                              ring={isBest ? 'user' : 'none'}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                                {pick.displayName}
                              </span>
                              <span className="text-muted-foreground text-[11px]">×</span>
                              <span className="text-xs font-bold text-foreground truncate">
                                {pick.championName}
                              </span>
                              {groupTab === 'all' && isBest && (
                                <Badge variant="success" className="px-1 py-0 text-[9px] font-mono">
                                  TOP
                                </Badge>
                              )}
                              {groupTab === 'all' && isWorst && (
                                <Badge variant="destructive" className="px-1 py-0 text-[9px] font-mono">
                                  LOW
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate">
                              {pick.account.gameName}#{pick.account.tagLine}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatRoleLabel(pick.primaryRole)}
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap">
                        <span className="font-bold text-foreground mr-1.5">
                          {pick.games}G
                        </span>
                        <span className="text-[11px] inline-flex items-center gap-1">
                          <span className="text-success font-semibold">{pick.wins}V</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-destructive font-semibold">
                            {pick.losses + pick.ffs}D
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="font-mono font-bold whitespace-nowrap">
                        <span className={getWinRateTextClass(pick.winRate)}>
                          {pick.winRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold',
                            getGradeColorClasses(grade)
                          )}
                        >
                          <span>{pick.avgPerformance.toFixed(1)}</span>
                          <span className="opacity-80">{grade}</span>
                        </span>
                      </TableCell>
                      <TableCell className="font-mono whitespace-nowrap">
                        <LolPickScoreTooltip
                          pick={pick}
                          tone={isWorst ? 'worst' : isBest ? 'best' : 'neutral'}
                        >
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-bold cursor-help',
                              isWorst
                                ? 'border-destructive/40 bg-destructive/15 text-destructive'
                                : isBest
                                  ? 'border-success/40 bg-success/15 text-success'
                                  : 'border-primary/40 bg-primary/15 text-primary'
                            )}
                          >
                            {pick.pickScore.toFixed(1)}
                          </span>
                        </LolPickScoreTooltip>
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-foreground whitespace-nowrap">
                        {pick.avgKda.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-foreground whitespace-nowrap">
                        {pick.avgCsPerMin.toFixed(1)}
                      </TableCell>
                      <TableCell className="font-mono text-foreground whitespace-nowrap">
                        {formatCompactNumber(pick.avgDpm)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
};
