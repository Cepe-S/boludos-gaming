import React from 'react';
import { PlayerProfile } from '@/types/domain';
import {
  LolAccount,
  LolGroupAggregateStats,
  LolPlayerAggregateStats,
  LolRankedEntry,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatCompactNumber,
  formatRelativeTime,
  formatRoleLabel,
  formatTierLabel,
  getGradeColorClasses,
  getProfileIconUrl,
  getTierColorClasses,
} from '@/lib/lolDdragon';
import { getGradeFromScore, groupAccountsByUser } from '@/lib/lolPerformanceEngine';
import {
  LOL_FF_TEXT_CLASS,
  LOL_STAT_GLOSSARY,
  LolAnimatedNumber,
  LolChampionAvatar,
  LolInfoTip,
  LolPillarBars,
  LolStatGlossaryEntry,
} from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Award,
  ChevronRight,
  Crown,
  Flame,
  User,
  Users,
} from 'lucide-react';

export type LolStatsOverviewPanelProps =
  | {
      mode: 'personal';
      account: LolAccount;
      secondaryAccounts?: LolAccount[];
      displayName: string;
      stats: LolPlayerAggregateStats;
      ddragonVersion?: string;
      onSelectChampion: (championName: string) => void;
      onOpenChampionsModal: () => void;
    }
  | {
      mode: 'group';
      groupName: string;
      accounts: LolAccount[];
      members: Array<Pick<PlayerProfile, 'id' | 'displayName' | 'avatarUrl'>>;
      groupStats: LolGroupAggregateStats;
      personalInGroupStats?: LolPlayerAggregateStats | null;
      personalDisplayName?: string;
      ddragonVersion?: string;
    };

type AggregateStatsMetrics = Pick<
  LolPlayerAggregateStats,
  | 'wins'
  | 'losses'
  | 'ffs'
  | 'remakes'
  | 'winRate'
  | 'ffRate'
  | 'avgPerformance'
  | 'avgPillars'
  | 'avgKda'
  | 'avgKills'
  | 'avgDeaths'
  | 'avgAssists'
  | 'avgKp'
  | 'avgCsPerMin'
  | 'avgDpm'
  | 'avgGpm'
  | 'avgVisionPerMin'
  | 'mvpCount'
  | 'aceCount'
>;

interface KpiGridItem {
  key: string;
  label: string;
  glossary: LolStatGlossaryEntry;
  value: React.ReactNode;
  subLabel: React.ReactNode;
  subLabelClassName?: string;
}

const RankedPill: React.FC<{
  label: string;
  entry: LolRankedEntry | null;
  delayMs?: number;
}> = ({ label, entry, delayMs = 0 }) => {
  if (!entry) {
    return (
      <div
        style={{ animationDelay: `${delayMs}ms` }}
        className="px-2.5 py-1.5 rounded-md border border-border bg-background/45 flex items-center justify-between gap-2 text-xs animate-lol-card-pop transition-colors hover:border-border/90"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">Unranked</span>
      </div>
    );
  }

  const total = entry.wins + entry.losses;
  const wr = total > 0 ? Math.round((entry.wins / total) * 100) : 0;

  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="px-2.5 py-1.5 rounded-md border border-border bg-background/45 flex items-center justify-between gap-3 text-xs animate-lol-card-pop transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          {label}
        </span>
        <Badge
          variant="outline"
          className={cn(
            'font-mono text-[10px] px-1.5 py-0',
            getTierColorClasses(entry.tier)
          )}
        >
          {formatTierLabel(entry.tier, entry.rank)}
        </Badge>
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
        <span className="font-bold text-foreground">
          <LolAnimatedNumber value={entry.leaguePoints} suffix=" LP" durationMs={480} />
        </span>
        <span className="text-muted-foreground">
          {entry.wins}V/{entry.losses}D ({wr}%)
        </span>
      </div>
    </div>
  );
};

interface AggregateStatsBodyProps {
  stats: AggregateStatsMetrics;
  totalCount: number;
  bgPerfLabel?: string;
  emptyMessage: string;
}

const AggregateStatsBody: React.FC<AggregateStatsBodyProps> = ({
  stats,
  totalCount,
  bgPerfLabel = 'BG-PERF',
  emptyMessage,
}) => {
  if (totalCount === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30 animate-lol-card-pop">
        {emptyMessage}
      </div>
    );
  }

  const grade = getGradeFromScore(stats.avgPerformance);

  const kpiItems: KpiGridItem[] = [
    {
      key: 'kda',
      label: 'KDA',
      glossary: LOL_STAT_GLOSSARY.kda,
      value: <LolAnimatedNumber value={stats.avgKda} decimals={2} durationMs={520} />,
      subLabel: `${stats.avgKills}/${stats.avgDeaths}/${stats.avgAssists}`,
    },
    {
      key: 'kp',
      label: 'KP%',
      glossary: LOL_STAT_GLOSSARY.kp,
      value: (
        <LolAnimatedNumber
          value={Math.round(stats.avgKp * 100)}
          suffix="%"
          durationMs={520}
        />
      ),
      subLabel: 'Partic.',
    },
    {
      key: 'csm',
      label: 'CS/m',
      glossary: LOL_STAT_GLOSSARY.csMin,
      value: <LolAnimatedNumber value={stats.avgCsPerMin} decimals={1} durationMs={520} />,
      subLabel: 'Farm',
    },
    {
      key: 'dpm',
      label: 'DPM',
      glossary: LOL_STAT_GLOSSARY.dpm,
      value: (
        <LolAnimatedNumber
          value={stats.avgDpm}
          formatFn={formatCompactNumber}
          durationMs={520}
        />
      ),
      subLabel: 'Daño/m',
    },
    {
      key: 'gpm',
      label: 'GPM',
      glossary: LOL_STAT_GLOSSARY.gpm,
      value: <LolAnimatedNumber value={Math.round(stats.avgGpm)} durationMs={520} />,
      subLabel: 'Oro/m',
    },
    {
      key: 'vism',
      label: 'Vis/m',
      glossary: LOL_STAT_GLOSSARY.visMin,
      value: (
        <LolAnimatedNumber value={stats.avgVisionPerMin} decimals={2} durationMs={520} />
      ),
      subLabel: `FF ${stats.ffRate}%`,
      subLabelClassName: cn('font-semibold', LOL_FF_TEXT_CLASS),
    },
  ];

  return (
    <div className="space-y-2.5">
      {/* Performance Score Hero + 6 Pillars */}
      <div className="p-2.5 rounded-md border border-border bg-background/45 space-y-2 animate-lol-card-pop">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'px-2.5 py-1.5 rounded-md border flex items-baseline gap-1.5 font-mono transition-transform duration-200 hover:scale-105',
                getGradeColorClasses(grade)
              )}
            >
              <LolAnimatedNumber
                value={stats.avgPerformance}
                decimals={1}
                durationMs={560}
                className="text-xl font-black leading-none"
              />
              <span className="text-xs font-bold">{grade}</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground flex items-center gap-1">
                <span>{bgPerfLabel}</span>
                <LolInfoTip {...LOL_STAT_GLOSSARY.bgPerf} />
              </div>
              <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                <span className="text-amber-300 inline-flex items-center gap-1">
                  <Crown className="w-3 h-3" strokeWidth={1.75} />
                  {stats.mvpCount} MVP
                  <LolInfoTip {...LOL_STAT_GLOSSARY.mvp} />
                </span>
                <span className="text-primary inline-flex items-center gap-1">
                  <Award className="w-3 h-3" strokeWidth={1.75} />
                  {stats.aceCount} ACE
                  <LolInfoTip {...LOL_STAT_GLOSSARY.ace} />
                </span>
              </div>
            </div>
          </div>

          <div className="text-right font-mono">
            <div className="text-base font-bold text-foreground inline-flex items-center justify-end gap-1">
              <LolAnimatedNumber value={stats.winRate} suffix="%" durationMs={520} />
              <span className="text-[10px] text-muted-foreground font-normal">WR</span>
              <LolInfoTip {...LOL_STAT_GLOSSARY.wr} />
            </div>
            <div className="text-[11px] flex items-center justify-end gap-1">
              <span className="text-success font-semibold">{stats.wins}V</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-destructive font-semibold">{stats.losses + stats.ffs}D</span>
              {stats.remakes > 0 && (
                <span className="text-muted-foreground">({stats.remakes}R)</span>
              )}
            </div>
          </div>
        </div>

        <LolPillarBars pillars={stats.avgPillars} compact />
      </div>

      {/* Compact 6-KPI Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 font-mono">
        {kpiItems.map((item, idx) => (
          <div
            key={item.key}
            style={{ animationDelay: `${60 + idx * 30}ms` }}
            className="p-2 rounded-md border border-border bg-background/40 animate-lol-card-pop transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
              <LolInfoTip {...item.glossary} />
            </div>
            <strong className="text-xs text-foreground">{item.value}</strong>
            <span
              className={cn(
                'text-[10px] text-muted-foreground block',
                item.subLabelClassName
              )}
            >
              {item.subLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LolStatsOverviewPanel: React.FC<LolStatsOverviewPanelProps> = (props) => {
  const baseVersion = props.ddragonVersion || DEFAULT_DDRAGON_VERSION;

  if (props.mode === 'personal') {
    const {
      account,
      secondaryAccounts = [],
      displayName,
      stats,
      onSelectChampion,
      onOpenChampionsModal,
    } = props;
    const version = account.ddragonVersion || baseVersion;
    const topChampions = stats.topChampions.slice(0, 4);

    return (
      <div className="space-y-3">
        {/* Summoner Profile & Ranked Banner */}
        <Card className="animate-lol-card-pop">
          <CardContent className="p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0 group">
                <img
                  src={getProfileIconUrl(account.profileIconId, version)}
                  alt={account.gameName}
                  className="w-12 h-12 rounded-md border border-border object-cover transition-transform duration-200 group-hover:scale-105"
                />
                <span className="absolute -bottom-1 -right-1 px-1.5 py-0 rounded bg-popover border border-border text-[10px] font-mono font-bold text-foreground animate-lol-card-pop">
                  {account.summonerLevel}
                </span>
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-foreground truncate">
                    {account.gameName}
                    <span className="text-muted-foreground font-mono text-xs ml-0.5">
                      #{account.tagLine}
                    </span>
                  </h2>
                  <Badge variant="default" className="text-[10px] font-mono uppercase">
                    {account.platform}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {displayName}
                  </Badge>
                  {secondaryAccounts.map((sec) => (
                    <Badge
                      key={sec.puuid}
                      variant="secondary"
                      className="text-[10px] font-mono text-muted-foreground"
                      title={`Cuenta secundaria vinculada (${sec.platform.toUpperCase()})`}
                    >
                      +{sec.gameName}#{sec.tagLine}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                    {stats.totalGames} partidas
                  </span>
                  {account.lastSyncedAt && (
                    <span>
                      Sync: {formatRelativeTime(Date.parse(account.lastSyncedAt))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:min-w-[440px]">
              <RankedPill label="Solo/Duo" entry={account.rankedSolo} delayMs={60} />
              <RankedPill label="Flex" entry={account.rankedFlex} delayMs={110} />
            </div>
          </CardContent>
        </Card>

        {/* Full-Width Personal Performance + Most Played Champions */}
        <Card className="animate-lol-reveal" style={{ animationDelay: '70ms' }}>
          <CardHeader className="pb-2.5 pt-3 px-3.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-info" strokeWidth={1.75} />
              <span>Rendimiento Personal</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {stats.totalGames}G
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              <div className="xl:col-span-7 min-w-0">
                <AggregateStatsBody
                  stats={stats}
                  totalCount={stats.totalGames}
                  bgPerfLabel="BG-PERF"
                  emptyMessage="Sin partidas en el filtro actual."
                />
              </div>

              <div className="xl:col-span-5 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Campeones más jugados
                  </span>
                  {stats.topChampions.length > 0 && (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={onOpenChampionsModal}
                      className="font-mono text-[10px]"
                    >
                      <span>Ver todos ({stats.topChampions.length})</span>
                      <ChevronRight className="w-3 h-3" strokeWidth={1.75} />
                    </Button>
                  )}
                </div>

                {topChampions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30">
                    Sin campeones en el filtro actual.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5">
                    {topChampions.map((champ, cIdx) => {
                      const defeats = champ.losses + champ.ffs;
                      return (
                        <button
                          key={champ.championName}
                          type="button"
                          onClick={() => onSelectChampion(champ.championName)}
                          style={{ animationDelay: `${cIdx * 45 + 100}ms` }}
                          title={`Ver detalle de ${champ.championName}`}
                          aria-label={`Ver detalle de ${champ.championName}`}
                          className="group w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md border border-border bg-background/40 text-xs text-left animate-lol-card-pop transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/60 hover:bg-muted/50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <LolChampionAvatar
                              championName={champ.championName}
                              version={version}
                              size="sm"
                              className="transition-transform duration-150 group-hover:scale-105"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-foreground truncate leading-tight">
                                  {champ.championName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] font-mono px-1 py-0 leading-tight shrink-0"
                                >
                                  {formatRoleLabel(champ.primaryRole)}
                                </Badge>
                              </div>
                              <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                                {champ.games}G · {champ.wins}V/{defeats}D ·{' '}
                                {champ.avgKda.toFixed(1)} KDA
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right font-mono">
                              <span
                                className={cn(
                                  'text-[11px] font-bold block leading-tight',
                                  champ.winRate >= 55
                                    ? 'text-success'
                                    : champ.winRate < 45
                                      ? 'text-destructive'
                                      : 'text-foreground'
                                )}
                              >
                                {champ.winRate}%
                              </span>
                              <span className="text-[10px] text-primary">
                                {champ.avgPerformance.toFixed(1)} pts
                              </span>
                            </div>
                            <ChevronRight
                              className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-primary transition-colors"
                              strokeWidth={1.75}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group Mode
  const {
    groupName,
    accounts,
    members,
    groupStats,
    personalInGroupStats,
    personalDisplayName,
  } = props;
  const memberById = new Map(members.map((m) => [m.id, m]));
  const userGroups = groupAccountsByUser(accounts);

  return (
    <div className="space-y-3">
      {/* Group Banner + Linked Members */}
      <Card className="animate-lol-card-pop">
        <CardContent className="p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-md border border-primary/40 bg-primary/15 flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" strokeWidth={1.75} />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-foreground truncate">
                  {groupName}
                </h2>
                <Badge variant="default" className="text-[10px] font-mono">
                  {userGroups.length} invocadores
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {groupStats.totalMatches} partidas
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">
                  Prom {groupStats.avgSquadSize} jug/g
                </Badge>
              </div>
            </div>
          </div>

          {userGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {userGroups.map(({ primaryAccount: acc, accounts: userAccs }) => {
                const member = memberById.get(acc.userId);
                const label = member?.displayName ?? acc.gameName;
                const iconUrl = getProfileIconUrl(
                  acc.profileIconId,
                  acc.ddragonVersion || baseVersion
                );
                const altCount = Math.max(0, userAccs.length - 1);
                const allRiotIds = userAccs
                  .map((a) => `${a.gameName}#${a.tagLine}`)
                  .join(' · ');
                return (
                  <div
                    key={acc.userId}
                    title={`${label} · ${allRiotIds}`}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/45 text-xs shrink-0"
                  >
                    <img
                      src={iconUrl}
                      alt={label}
                      className="w-5 h-5 rounded-full object-cover border border-border shrink-0"
                    />
                    <span className="font-medium text-foreground truncate max-w-[110px]">
                      {label}
                    </span>
                    {altCount > 0 && (
                      <span className="text-[9px] font-mono font-semibold text-primary">
                        +{altCount}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dual Top Overview: Personal Stats in Group Games (left) + Group Aggregate Stats (right) */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 items-stretch',
          personalInGroupStats ? 'xl:grid-cols-2' : ''
        )}
      >
        {personalInGroupStats && (
          <Card className="h-full animate-lol-reveal" style={{ animationDelay: '70ms' }}>
            <CardHeader className="pb-2.5 pt-3 px-3.5">
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
                <span>Mis Estadísticas en el Grupo</span>
                {personalDisplayName && (
                  <Badge variant="outline" className="text-[10px]">
                    {personalDisplayName}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {personalInGroupStats.totalGames}G
                </Badge>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-3.5 pt-0">
              <AggregateStatsBody
                stats={personalInGroupStats}
                totalCount={personalInGroupStats.totalGames}
                bgPerfLabel="Mi BG-PERF (Grupo)"
                emptyMessage="Sin partidas compartidas con el grupo (≥2) en el filtro actual."
              />
            </CardContent>
          </Card>
        )}

        <Card className="h-full animate-lol-reveal" style={{ animationDelay: '120ms' }}>
          <CardHeader className="pb-2.5 pt-3 px-3.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Estadísticas del Grupo (≥2)</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {groupStats.totalMatches}G
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-3.5 pt-0">
            <AggregateStatsBody
              stats={groupStats}
              totalCount={groupStats.totalMatches}
              bgPerfLabel="BG-PERF Grupal"
              emptyMessage="Sin partidas grupales (≥2 integrantes) en el filtro actual."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
