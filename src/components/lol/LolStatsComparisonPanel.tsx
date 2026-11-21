import React from 'react';
import {
  LolAccount,
  LolPersonalVsGroupStats,
  LolPlayerAggregateStats,
  LolRankedEntry,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  formatCompactNumber,
  formatRelativeTime,
  formatTierLabel,
  getGradeColorClasses,
  getProfileIconUrl,
  getTierColorClasses,
} from '@/lib/lolDdragon';
import { getGradeFromScore } from '@/lib/lolPerformanceEngine';
import { LolChampionAvatar, LolPillarBars } from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Award,
  Crown,
  Flame,
  Shield,
  TrendingDown,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';

export interface LolStatsComparisonPanelProps {
  account: LolAccount;
  displayName: string;
  stats: LolPersonalVsGroupStats;
  ddragonVersion?: string;
}

const RankedPill: React.FC<{ label: string; entry: LolRankedEntry | null }> = ({
  label,
  entry,
}) => {
  if (!entry) {
    return (
      <div className="px-2.5 py-1.5 rounded-md border border-border bg-background/45 flex items-center justify-between gap-2 text-xs">
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
    <div className="px-2.5 py-1.5 rounded-md border border-border bg-background/45 flex items-center justify-between gap-3 text-xs">
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
        <span className="font-bold text-foreground">{entry.leaguePoints} LP</span>
        <span className="text-muted-foreground">
          {entry.wins}V/{entry.losses}D ({wr}%)
        </span>
      </div>
    </div>
  );
};

const DeltaBadge: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  invertGood?: boolean;
}> = ({ label, value, suffix = '', invertGood = false }) => {
  if (value === 0) return null;
  const isPositive = value > 0;
  const isGood = invertGood ? !isPositive : isPositive;
  const formatted = `${isPositive ? '+' : ''}${value}${suffix}`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold',
        isGood
          ? 'border-success/40 bg-success/15 text-success'
          : 'border-destructive/40 bg-destructive/15 text-destructive'
      )}
    >
      {isPositive ? (
        <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
      ) : (
        <TrendingDown className="w-3 h-3" strokeWidth={1.75} />
      )}
      <span>
        {label} {formatted}
      </span>
    </span>
  );
};

interface StatsColumnCardProps {
  title: string;
  icon: React.ReactNode;
  accentClass: string;
  agg: LolPlayerAggregateStats;
  ddragonVersion: string;
  deltas?: LolPersonalVsGroupStats['deltas'];
  emptyMessage?: string;
}

const StatsColumnCard: React.FC<StatsColumnCardProps> = ({
  title,
  icon,
  accentClass,
  agg,
  ddragonVersion,
  deltas,
  emptyMessage,
}) => {
  const grade = getGradeFromScore(agg.avgPerformance);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <span className={accentClass}>{icon}</span>
            <span>{title}</span>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {agg.totalGames}G
            </Badge>
          </CardTitle>

          {deltas && agg.scoredGames > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <DeltaBadge label="Perf" value={deltas.performanceDelta} />
              <DeltaBadge label="WR" value={deltas.winRateDelta} suffix="%" />
              <DeltaBadge label="KDA" value={deltas.kdaDelta} />
              <DeltaBadge
                label="FF"
                value={deltas.ffRateDelta}
                suffix="%"
                invertGood
              />
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {agg.totalGames === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30">
            {emptyMessage || 'Sin partidas registradas.'}
          </div>
        ) : (
          <>
            {/* Performance Score Hero + 6 Pillars */}
            <div className="p-3 rounded-md border border-border bg-background/45 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'px-2.5 py-1.5 rounded-md border flex items-baseline gap-1.5 font-mono',
                      getGradeColorClasses(grade)
                    )}
                  >
                    <span className="text-xl font-black leading-none">
                      {agg.avgPerformance.toFixed(1)}
                    </span>
                    <span className="text-xs font-bold">{grade}</span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <span>Performance BG-PERF</span>
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-2">
                      <span className="text-amber-300 inline-flex items-center gap-0.5">
                        <Crown className="w-3 h-3" strokeWidth={1.75} />
                        {agg.mvpCount} MVP
                      </span>
                      <span className="text-primary inline-flex items-center gap-0.5">
                        <Award className="w-3 h-3" strokeWidth={1.75} />
                        {agg.aceCount} ACE
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-base font-bold text-foreground">
                    {agg.winRate}% <span className="text-[10px] text-muted-foreground font-normal">WR</span>
                  </div>
                  <div className="text-[11px]">
                    <span className="text-success">{agg.wins}V</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-destructive">{agg.losses}D</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="text-warning">{agg.ffs}FF</span>
                    {agg.remakes > 0 && (
                      <span className="text-muted-foreground"> ({agg.remakes}R)</span>
                    )}
                  </div>
                </div>
              </div>

              <LolPillarBars pillars={agg.avgPillars} compact />
            </div>

            {/* Compact KPI Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 font-mono">
              <div className="p-2 rounded-md border border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground block">KDA</span>
                <strong className="text-xs text-foreground">{agg.avgKda.toFixed(2)}</strong>
                <span className="text-[10px] text-muted-foreground block">
                  {agg.avgKills}/{agg.avgDeaths}/{agg.avgAssists}
                </span>
              </div>
              <div className="p-2 rounded-md border border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground block">KP%</span>
                <strong className="text-xs text-foreground">
                  {Math.round(agg.avgKp * 100)}%
                </strong>
                <span className="text-[10px] text-muted-foreground block">Partic.</span>
              </div>
              <div className="p-2 rounded-md border border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground block">CS/m</span>
                <strong className="text-xs text-foreground">{agg.avgCsPerMin.toFixed(1)}</strong>
                <span className="text-[10px] text-muted-foreground block">Farm</span>
              </div>
              <div className="p-2 rounded-md border border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground block">DPM</span>
                <strong className="text-xs text-foreground">
                  {formatCompactNumber(agg.avgDpm)}
                </strong>
                <span className="text-[10px] text-muted-foreground block">Daño/m</span>
              </div>
              <div className="p-2 rounded-md border border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground block">GPM</span>
                <strong className="text-xs text-foreground">{Math.round(agg.avgGpm)}</strong>
                <span className="text-[10px] text-muted-foreground block">Oro/m</span>
              </div>
              <div className="p-2 rounded-md border border-border bg-background/40">
                <span className="text-[10px] text-muted-foreground block">Vis/m</span>
                <strong className="text-xs text-foreground">
                  {agg.avgVisionPerMin.toFixed(2)}
                </strong>
                <span className="text-[10px] text-muted-foreground block">FF {agg.ffRate}%</span>
              </div>
            </div>

            {/* Top Champions */}
            {agg.topChampions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Top Campeones
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {agg.topChampions.slice(0, 4).map((champ) => (
                    <div
                      key={champ.championName}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-border bg-background/40 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <LolChampionAvatar
                          championName={champ.championName}
                          version={ddragonVersion}
                          size="xs"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate leading-tight">
                            {champ.championName}
                          </p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {champ.games}G · {champ.avgKda.toFixed(1)} KDA
                          </p>
                        </div>
                      </div>

                      <div className="text-right font-mono shrink-0">
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
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export const LolStatsComparisonPanel: React.FC<LolStatsComparisonPanelProps> = ({
  account,
  displayName,
  stats,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
}) => {
  const version = account.ddragonVersion || ddragonVersion;

  return (
    <div className="space-y-4">
      {/* Summoner Profile & Ranked Banner */}
      <Card>
        <CardContent className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={getProfileIconUrl(account.profileIconId, version)}
                alt={account.gameName}
                className="w-12 h-12 rounded-md border border-border object-cover"
              />
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0 rounded bg-popover border border-border text-[10px] font-mono font-bold text-foreground">
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
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                  {stats.personal.totalGames} partidas
                </span>
                <span className="inline-flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />
                  {stats.inGroup.totalGames} en grupo
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
            <RankedPill label="Solo/Duo" entry={account.rankedSolo} />
            <RankedPill label="Flex" entry={account.rankedFlex} />
          </div>
        </CardContent>
      </Card>

      {/* Dual Comparison: Personal vs In Group */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <StatsColumnCard
          title="Estadísticas Personales"
          icon={<User className="w-4 h-4" strokeWidth={1.75} />}
          accentClass="text-info"
          agg={stats.personal}
          ddragonVersion={version}
          emptyMessage="Sin partidas en el filtro actual."
        />

        <StatsColumnCard
          title="Estadísticas en el Grupo (≥2)"
          icon={<Users className="w-4 h-4" strokeWidth={1.75} />}
          accentClass="text-primary"
          agg={stats.inGroup}
          ddragonVersion={version}
          deltas={stats.deltas}
          emptyMessage="Sin partidas compartidas con al menos 2 miembros del grupo."
        />
      </div>
    </div>
  );
};
