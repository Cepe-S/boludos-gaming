import React, { useEffect, useMemo, useState } from 'react';
import {
  LolAccount,
  LolMatchParticipantSummary,
  LolMatchSummary,
  RiotMatchV5,
  RiotMatchV5Participant,
} from '@/types/lol';
import {
  DEFAULT_DDRAGON_VERSION,
  STAT_SHARD_META,
  formatCompactNumber,
  formatDuration,
  formatMapLabel,
  formatQueueLabel,
  formatRoleLabel,
  getRuneIconUrl,
  getRuneMeta,
  getRuneStyleIconUrl,
  getRuneStyleMeta,
} from '@/lib/lolDdragon';
import { fetchFullLolMatch } from '@/lib/lolService';
import {
  LolChampionAvatar,
  LolItemRow,
  LolOutcomeBadge,
  LolPerformanceBadge,
  LolPillarBars,
  LolSpellsRunesBadge,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Activity,
  Check,
  Code2,
  Copy,
  Flame,
  Loader2,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';

export interface LolMatchDetailModalProps {
  match: LolMatchSummary;
  initialParticipantPuuid: string;
  groupPuuids: Set<string>;
  accountByPuuid: Map<string, LolAccount>;
  ddragonVersion?: string;
  onClose: () => void;
}

const PING_FIELDS: Array<{ key: keyof RiotMatchV5Participant; label: string }> = [
  { key: 'allInPings', label: 'All-In' },
  { key: 'assistMePings', label: 'Ayuda' },
  { key: 'onMyWayPings', label: 'En Camino' },
  { key: 'enemyMissingPings', label: 'MIA (?)' },
  { key: 'dangerPings', label: 'Peligro' },
  { key: 'getBackPings', label: 'Retroceder' },
  { key: 'retreatPings', label: 'Retirada' },
  { key: 'pushPings', label: 'Pushear' },
  { key: 'holdPings', label: 'Mantener' },
  { key: 'enemyVisionPings', label: 'Visión Rival' },
  { key: 'needVisionPings', label: 'Necesito Vis.' },
  { key: 'visionClearedPings', label: 'Vis. Limpia' },
  { key: 'commandPings', label: 'Comando' },
  { key: 'basicPings', label: 'Básico' },
];

function humanizeChallengeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function formatChallengeVal(val: number | boolean | string | undefined): string {
  if (val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(2);
  }
  return String(val);
}

export const LolMatchDetailModal: React.FC<LolMatchDetailModalProps> = ({
  match,
  initialParticipantPuuid,
  groupPuuids,
  accountByPuuid,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onClose,
}) => {
  const [rawMatch, setRawMatch] = useState<RiotMatchV5 | null>(match.rawMatch ?? null);
  const [isLoadingRaw, setIsLoadingRaw] = useState(!match.rawMatch);
  const [inspectedPuuid, setInspectedPuuid] = useState(initialParticipantPuuid);
  const [activeTab, setActiveTab] = useState('overview');
  const [combatSubTab, setCombatSubTab] = useState<'damage' | 'economy' | 'pings'>('damage');
  const [challengeSearch, setChallengeSearch] = useState('');
  const [rawSection, setRawSection] = useState<'participant' | 'info' | 'teams' | 'full'>('participant');
  const [rawFilter, setRawFilter] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    setInspectedPuuid(initialParticipantPuuid);
  }, [initialParticipantPuuid, match.matchId]);

  useEffect(() => {
    let cancelled = false;
    if (match.rawMatch) {
      setRawMatch(match.rawMatch);
      setIsLoadingRaw(false);
      return;
    }

    setIsLoadingRaw(true);
    setRawMatch(null);

    fetchFullLolMatch(match.matchId)
      .then((loaded) => {
        if (!cancelled) {
          setRawMatch(loaded);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRaw(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [match.matchId, match.rawMatch]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const rawParticipantByPuuid = useMemo(() => {
    const map = new Map<string, RiotMatchV5Participant>();
    if (rawMatch?.info?.participants) {
      for (const p of rawMatch.info.participants) {
        map.set(p.puuid, p);
      }
    } else {
      for (const p of match.participants) {
        if (p.rawParticipant) {
          map.set(p.puuid, p.rawParticipant);
        }
      }
    }
    return map;
  }, [rawMatch, match.participants]);

  const targetSummary =
    match.participants.find((p) => p.puuid === initialParticipantPuuid) ||
    match.participants[0];

  const inspectedSummary =
    match.participants.find((p) => p.puuid === inspectedPuuid) || targetSummary;

  const inspectedRaw =
    rawParticipantByPuuid.get(inspectedSummary?.puuid || '') ||
    inspectedSummary?.rawParticipant ||
    null;

  const team100Parts = match.participants.filter((p) => p.teamId === 100);
  const team200Parts = match.participants.filter((p) => p.teamId === 200);
  const maxDamage = Math.max(
    1,
    ...match.participants.map((p) => p.damageToChampions)
  );
  const mins = Math.max(1, match.gameDuration / 60);
  const groupMembersInMatch = match.participants.filter((p) => groupPuuids.has(p.puuid));

  const challengeEntries = useMemo(() => {
    const challenges = inspectedRaw?.challenges;
    if (!challenges) return [];
    const q = challengeSearch.trim().toLowerCase();
    return Object.entries(challenges)
      .filter(([, value]) => value !== undefined)
      .filter(([key]) =>
        !q ||
        key.toLowerCase().includes(q) ||
        humanizeChallengeKey(key).toLowerCase().includes(q)
      )
      .sort(([a], [b]) => a.localeCompare(b));
  }, [inspectedRaw, challengeSearch]);

  const rawJsonText = useMemo(() => {
    let source: unknown = match;
    if (rawSection === 'participant') {
      source = inspectedRaw ?? inspectedSummary ?? {};
    } else if (rawSection === 'info') {
      source = rawMatch
        ? { metadata: rawMatch.metadata, ...rawMatch.info, participants: `[${rawMatch.info.participants.length} participants]` }
        : {
            matchId: match.matchId,
            queueId: match.queueId,
            gameMode: match.gameMode,
            gameVersion: match.gameVersion,
            gameDuration: match.gameDuration,
            gameCreation: match.gameCreation,
            platformId: match.platformId,
          };
    } else if (rawSection === 'teams') {
      source = rawMatch?.info?.teams ?? match.teams;
    } else {
      source = rawMatch ?? match;
    }

    const formatted = JSON.stringify(source, null, 2);
    const q = rawFilter.trim().toLowerCase();
    if (!q) return formatted;
    return formatted
      .split('\n')
      .filter((line) => line.toLowerCase().includes(q))
      .join('\n');
  }, [rawSection, rawFilter, rawMatch, match, inspectedRaw, inspectedSummary]);

  const handleCopyMatchId = async () => {
    try {
      await navigator.clipboard.writeText(match.matchId);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(rawJsonText);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1600);
    } catch {
      // Ignore clipboard failures
    }
  };

  const renderTeamBlock = (
    teamId: number,
    parts: LolMatchParticipantSummary[]
  ) => {
    const teamMeta = match.teams.find((t) => t.teamId === teamId);
    const isBlue = teamId === 100;
    const obj = teamMeta?.objectives;

    return (
      <div
        className={cn(
          'rounded-md border overflow-hidden bg-background/40',
          isBlue ? 'border-sky-500/30' : 'border-rose-500/30'
        )}
      >
        {/* Team Header with Objectives */}
        <div
          className={cn(
            'px-3 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs',
            isBlue
              ? 'bg-sky-500/10 border-sky-500/25'
              : 'bg-rose-500/10 border-rose-500/25'
          )}
        >
          <div className="flex items-center gap-2">
            <span className={cn('font-bold', isBlue ? 'text-sky-300' : 'text-rose-300')}>
              {isBlue ? 'Equipo Azul' : 'Equipo Rojo'}
            </span>
            <Badge variant={teamMeta?.win ? 'success' : 'destructive'} className="text-[10px]">
              {teamMeta?.win ? 'Victoria' : 'Derrota'}
            </Badge>
            <span className="font-mono text-[11px] text-muted-foreground">
              {teamMeta?.totalKills ?? 0} Kills · {formatCompactNumber(teamMeta?.totalGold ?? 0)} Oro ·{' '}
              {formatCompactNumber(teamMeta?.totalDamageToChampions ?? 0)} DMG
            </span>
          </div>

          {obj && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <span>
                Torres: <strong className="text-foreground">{obj.tower?.kills ?? 0}</strong>
                {obj.tower?.first ? '★' : ''}
              </span>
              <span>
                Inhib: <strong className="text-foreground">{obj.inhibitor?.kills ?? 0}</strong>
              </span>
              <span>
                Dragones: <strong className="text-foreground">{obj.dragon?.kills ?? 0}</strong>
                {obj.dragon?.first ? '★' : ''}
              </span>
              <span>
                Heraldo: <strong className="text-foreground">{obj.riftHerald?.kills ?? 0}</strong>
              </span>
              <span>
                Larvas: <strong className="text-foreground">{obj.horde?.kills ?? 0}</strong>
              </span>
              <span>
                Baron: <strong className="text-foreground">{obj.baron?.kills ?? 0}</strong>
                {obj.baron?.first ? '★' : ''}
              </span>
              {obj.atakhan && (
                <span>
                  Atakhan: <strong className="text-foreground">{obj.atakhan.kills ?? 0}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Invocador &amp; Campeón</TableHead>
              <TableHead>Hechizos / Runas</TableHead>
              <TableHead>Perf.</TableHead>
              <TableHead>KDA</TableHead>
              <TableHead className="w-[150px]">Daño</TableHead>
              <TableHead>CS</TableHead>
              <TableHead>Oro</TableHead>
              <TableHead>Visión</TableHead>
              <TableHead>Ítems</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parts.map((p) => {
              const isInspected = p.puuid === inspectedSummary?.puuid;
              const isGroup = groupPuuids.has(p.puuid);
              const groupAcc = accountByPuuid.get(p.puuid);
              const dmgWidth = Math.round((p.damageToChampions / maxDamage) * 100);

              return (
                <TableRow
                  key={`${p.puuid}-${p.participantId}`}
                  onClick={() => setInspectedPuuid(p.puuid)}
                  className={cn(
                    'cursor-pointer',
                    isInspected && 'bg-primary/15 hover:bg-primary/20'
                  )}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <LolChampionAvatar
                        championName={p.championName}
                        level={p.champLevel}
                        version={ddragonVersion}
                        size="sm"
                        ring={
                          p.puuid === initialParticipantPuuid
                            ? 'user'
                            : isGroup
                              ? 'group'
                              : isBlue
                                ? 'team100'
                                : 'team200'
                        }
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-foreground truncate max-w-[130px]">
                            {p.riotIdGameName || p.summonerName}
                          </span>
                          {groupAcc && (
                            <Badge variant="default" className="px-1 py-0 text-[9px]">
                              Grupo
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {p.championName} · {formatRoleLabel(p.performanceBreakdown.role)}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <LolSpellsRunesBadge
                      summoner1Id={p.summoner1Id}
                      summoner2Id={p.summoner2Id}
                      primaryRuneId={p.primaryRuneId}
                      subStyleId={p.subStyleId}
                      version={ddragonVersion}
                      size="sm"
                      layout="row"
                    />
                  </TableCell>

                  <TableCell>
                    <LolPerformanceBadge
                      score={p.performanceScore}
                      grade={p.performanceGrade}
                      isMvp={p.isMvp}
                      isAce={p.isAce}
                      matchRank={p.matchRank}
                      isRemake={p.performanceBreakdown.isRemake}
                    />
                  </TableCell>

                  <TableCell className="font-mono whitespace-nowrap">
                    <div className="font-bold text-foreground">
                      {p.kills}/{p.deaths}/{p.assists}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.kda.toFixed(2)} · KP {Math.round(p.killParticipation * 100)}%
                    </div>
                  </TableCell>

                  <TableCell className="font-mono">
                    <div className="text-[11px] font-semibold text-foreground">
                      {p.damageToChampions.toLocaleString()}
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden mt-0.5">
                      <div
                        className={cn('h-full rounded-full', isBlue ? 'bg-sky-400' : 'bg-rose-400')}
                        style={{ width: `${dmgWidth}%` }}
                      />
                    </div>
                  </TableCell>

                  <TableCell className="font-mono whitespace-nowrap">
                    <div className="font-semibold text-foreground">{p.cs}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {p.csPerMin.toFixed(1)}/m
                    </div>
                  </TableCell>

                  <TableCell className="font-mono whitespace-nowrap">
                    <div className="font-semibold text-foreground">
                      {formatCompactNumber(p.goldEarned)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {Math.round(p.goldEarned / mins)}/m
                    </div>
                  </TableCell>

                  <TableCell className="font-mono whitespace-nowrap">
                    <div className="font-semibold text-foreground">{p.visionScore}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {(p.visionScore / mins).toFixed(1)}/m
                    </div>
                  </TableCell>

                  <TableCell>
                    <LolItemRow items={p.items} version={ddragonVersion} size="xs" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de partida ${match.matchId}`}
    >
      <div
        className="w-full max-w-[95vw] xl:max-w-[1320px] h-[92vh] flex flex-col overflow-hidden rounded-md border border-white/15 bg-card/95 backdrop-blur-xl text-card-foreground shadow-[0_28px_80px_-16px_rgba(0,0,0,0.9)] ring-1 ring-inset ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-border bg-background/55 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            {targetSummary && (
              <LolOutcomeBadge
                outcome={targetSummary.outcome}
                enemySurrendered={targetSummary.enemySurrendered}
              />
            )}
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              {formatQueueLabel(match.queueId, match.gameMode)}
            </h2>
            <span className="text-xs font-mono text-muted-foreground">
              {formatMapLabel(match.mapId)} · {formatDuration(match.gameDuration)} · Patch{' '}
              {match.gameVersion.split('.').slice(0, 2).join('.')} · {match.platformId}
            </span>
            <button
              type="button"
              onClick={handleCopyMatchId}
              title="Copiar Match ID"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-secondary/70 hover:bg-accent text-[10px] font-mono text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <span>{match.matchId}</span>
              {copiedId ? (
                <Check className="w-3 h-3 text-success" strokeWidth={2} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={1.75} />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {groupMembersInMatch.length >= 2 && (
              <Badge variant="default" className="font-mono text-[10px]">
                <Users className="w-3 h-3" strokeWidth={1.75} />
                Grupo ({groupMembersInMatch.length})
              </Badge>
            )}
            <span className="hidden md:inline text-[11px] font-mono text-muted-foreground">
              {new Date(match.gameCreation).toLocaleString()}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              onClick={onClose}
              title="Cerrar modal"
              aria-label="Cerrar detalle de partida"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0 px-4 pt-3 pb-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="overview">
                <Swords className="w-3.5 h-3.5" strokeWidth={1.75} />
                Resumen &amp; Equipos
              </TabsTrigger>
              <TabsTrigger value="combat">
                <Flame className="w-3.5 h-3.5" strokeWidth={1.75} />
                Combate, Economía &amp; Pings
              </TabsTrigger>
              <TabsTrigger value="performance">
                <Activity className="w-3.5 h-3.5" strokeWidth={1.75} />
                Performance &amp; Runas
              </TabsTrigger>
              <TabsTrigger value="challenges">
                <Trophy className="w-3.5 h-3.5" strokeWidth={1.75} />
                Challenges ({challengeEntries.length})
              </TabsTrigger>
              <TabsTrigger value="raw">
                <Code2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                Raw JSON
              </TabsTrigger>
            </TabsList>

            {isLoadingRaw && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                Cargando DTO completo...
              </span>
            )}
          </div>

          {/* TAB 1: OVERVIEW & TEAMS */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto scroller-thin space-y-3 pr-1">
            {renderTeamBlock(100, team100Parts)}
            {renderTeamBlock(200, team200Parts)}

            {/* Bans summary */}
            {match.teams.some((t) => t.bans && t.bans.length > 0) && (
              <div className="p-2.5 rounded-md border border-border bg-background/45 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono">
                {match.teams.map((t) => (
                  <div key={t.teamId} className="flex items-center gap-2">
                    <span className={t.teamId === 100 ? 'text-sky-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      Bans {t.teamId === 100 ? 'Azul' : 'Rojo'}:
                    </span>
                    <span className="text-muted-foreground">
                      {t.bans.length > 0
                        ? t.bans.map((b) => `#${b.championId}`).join(', ')
                        : 'Sin bans'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: COMBAT, ECONOMY, VISION, PINGS & SPELL CASTS */}
          <TabsContent value="combat" className="flex-1 overflow-y-auto scroller-thin space-y-3 pr-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'damage', label: 'Daño, Tanqueo & CC' },
                  { id: 'economy', label: 'Economía, Jungla & Objetivos' },
                  { id: 'pings', label: 'Visión, 14 Pings & Casteos' },
                ] as Array<{ id: 'damage' | 'economy' | 'pings'; label: string }>
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setCombatSubTab(sub.id)}
                  className={cn(
                    'px-2.5 py-1 rounded border text-xs font-medium cursor-pointer transition-colors',
                    combatSubTab === sub.id
                      ? 'bg-primary/15 border-primary text-primary font-semibold'
                      : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {combatSubTab === 'damage' && (
              <div className="rounded-md border border-border overflow-hidden bg-background/40">
                <Table className="min-w-[1050px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Jugador</TableHead>
                      <TableHead>Daño Champs (Fís / Mág / Real)</TableHead>
                      <TableHead>Daño Total</TableHead>
                      <TableHead>Recibido / Mitigado</TableHead>
                      <TableHead>Curas / Escudos</TableHead>
                      <TableHead>CC (s)</TableHead>
                      <TableHead>Multi / Racha / Crít</TableHead>
                      <TableHead>Vivo / Muerto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {match.participants.map((p) => {
                      const rp = rawParticipantByPuuid.get(p.puuid);
                      return (
                        <TableRow key={p.puuid}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <LolChampionAvatar
                                championName={p.championName}
                                version={ddragonVersion}
                                size="xs"
                                ring={p.teamId === 100 ? 'team100' : 'team200'}
                              />
                              <span className="font-semibold text-foreground">
                                {p.riotIdGameName || p.championName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div className="font-bold text-foreground">
                              {p.damageToChampions.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {formatCompactNumber(rp?.physicalDamageDealtToChampions ?? 0)} /{' '}
                              {formatCompactNumber(rp?.magicDamageDealtToChampions ?? 0)} /{' '}
                              {formatCompactNumber(rp?.trueDamageDealtToChampions ?? 0)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            {formatCompactNumber(rp?.totalDamageDealt ?? p.damageToChampions)}
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>{formatCompactNumber(p.damageTaken)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Mit: {formatCompactNumber(rp?.damageSelfMitigated ?? 0)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>
                              Cura: {formatCompactNumber(rp?.totalHeal ?? 0)} (Ali:{' '}
                              {formatCompactNumber(rp?.totalHealsOnTeammates ?? 0)})
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Esc: {formatCompactNumber(rp?.totalDamageShieldedOnTeammates ?? 0)} ·{' '}
                              {rp?.totalUnitsHealed ?? 0}u
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>{rp?.timeCCingOthers ?? 0}s</div>
                            <div className="text-[10px] text-muted-foreground">
                              Total: {rp?.totalTimeCCDealt ?? 0}s
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>
                              2K:{rp?.doubleKills ?? 0} 3K:{rp?.tripleKills ?? 0} 4K:{rp?.quadraKills ?? 0} 5K:{rp?.pentaKills ?? 0}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Spree:{rp?.largestKillingSpree ?? 0} · Crít:{rp?.largestCriticalStrike ?? 0}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>MaxVivo: {formatDuration(rp?.longestTimeSpentLiving ?? 0)}</div>
                            <div className="text-[10px] text-destructive">
                              Muerto: {formatDuration(rp?.totalTimeSpentDead ?? 0)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {combatSubTab === 'economy' && (
              <div className="rounded-md border border-border overflow-hidden bg-background/40">
                <Table className="min-w-[1050px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Jugador</TableHead>
                      <TableHead>Oro Ganado / Gastado</TableHead>
                      <TableHead>Minions (Línea / JG)</TableHead>
                      <TableHead>JG Aliada / Enemiga</TableHead>
                      <TableHead>Compras / Bounty</TableHead>
                      <TableHead>Daño Obj / Torres</TableHead>
                      <TableHead>Torres / Inhib / Épicos</TableHead>
                      <TableHead>First &amp; Robos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {match.participants.map((p) => {
                      const rp = rawParticipantByPuuid.get(p.puuid);
                      return (
                        <TableRow key={p.puuid}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <LolChampionAvatar
                                championName={p.championName}
                                version={ddragonVersion}
                                size="xs"
                                ring={p.teamId === 100 ? 'team100' : 'team200'}
                              />
                              <span className="font-semibold text-foreground">
                                {p.riotIdGameName || p.championName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div className="font-bold text-amber-300">
                              {p.goldEarned.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Gastado: {(rp?.goldSpent ?? 0).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>
                              {rp?.totalMinionsKilled ?? p.cs} + {rp?.neutralMinionsKilled ?? 0}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Total {p.cs} ({p.csPerMin.toFixed(1)}/m)
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            {rp?.totalAllyJungleMinionsKilled ?? 0} /{' '}
                            {rp?.totalEnemyJungleMinionsKilled ?? 0}
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>
                              {rp?.itemsPurchased ?? 0} ítems · {rp?.consumablesPurchased ?? 0} cons.
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Bounty Lv.{rp?.bountyLevel ?? 0}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>Obj: {formatCompactNumber(p.damageToObjectives)}</div>
                            <div className="text-[10px] text-muted-foreground">
                              Torre: {formatCompactNumber(p.damageToTurrets)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px]">
                            <div>
                              T:{rp?.turretTakedowns ?? rp?.turretKills ?? 0} · I:
                              {rp?.inhibitorTakedowns ?? rp?.inhibitorKills ?? 0}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              D:{rp?.dragonKills ?? 0} · B:{rp?.baronKills ?? 0}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[10px]">
                            <div className="flex flex-wrap gap-1">
                              {rp?.firstBloodKill && <Badge variant="warning">FB</Badge>}
                              {rp?.firstTowerKill && <Badge variant="success">FT</Badge>}
                              {(rp?.objectivesStolen ?? 0) > 0 && (
                                <Badge variant="default">
                                  Robo×{rp?.objectivesStolen}
                                </Badge>
                              )}
                              {!rp?.firstBloodKill &&
                                !rp?.firstTowerKill &&
                                !(rp?.objectivesStolen ?? 0) &&
                                '—'}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {combatSubTab === 'pings' && (
              <div className="rounded-md border border-border overflow-hidden bg-background/40">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Jugador</TableHead>
                      <TableHead>Visión &amp; Wards</TableHead>
                      <TableHead>Casteos Q / W / E / R (D / F)</TableHead>
                      <TableHead>Pings (14 tipos Match-v5)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {match.participants.map((p) => {
                      const rp = rawParticipantByPuuid.get(p.puuid);
                      const activePings = PING_FIELDS.map((pf) => ({
                        label: pf.label,
                        count: Number(rp?.[pf.key] ?? 0),
                      })).filter((item) => item.count > 0);
                      const totalPings = activePings.reduce((s, item) => s + item.count, 0);

                      return (
                        <TableRow key={p.puuid}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <LolChampionAvatar
                                championName={p.championName}
                                version={ddragonVersion}
                                size="xs"
                                ring={p.teamId === 100 ? 'team100' : 'team200'}
                              />
                              <span className="font-semibold text-foreground">
                                {p.riotIdGameName || p.championName}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] whitespace-nowrap">
                            <div>
                              Visión: <strong>{p.visionScore}</strong>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Col:{rp?.wardsPlaced ?? 0} · Dest:{rp?.wardsKilled ?? 0} · Pinks:
                              {rp?.detectorWardsPlaced ?? rp?.visionWardsBoughtInGame ?? 0}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] whitespace-nowrap">
                            <div>
                              Q:{rp?.spell1Casts ?? 0} · W:{rp?.spell2Casts ?? 0} · E:
                              {rp?.spell3Casts ?? 0} · R:{rp?.spell4Casts ?? 0}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              D:{rp?.summoner1Casts ?? 0} · F:{rp?.summoner2Casts ?? 0}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                              <Badge variant="secondary" className="px-1.5 py-0">
                                Total {totalPings}
                              </Badge>
                              {activePings.map((item) => (
                                <span
                                  key={item.label}
                                  className="px-1.5 py-0.5 rounded border border-border bg-background/50 text-muted-foreground"
                                >
                                  {item.label}:{' '}
                                  <strong className="text-foreground">{item.count}</strong>
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* TAB 3: PERFORMANCE BREAKDOWN & RUNES */}
          <TabsContent value="performance" className="flex-1 overflow-y-auto scroller-thin space-y-3 pr-1">
            {/* Participant Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto scroller-thin pb-1">
              {match.participants.map((p) => {
                const selected = p.puuid === inspectedSummary?.puuid;
                return (
                  <button
                    key={p.puuid}
                    type="button"
                    onClick={() => setInspectedPuuid(p.puuid)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs shrink-0 cursor-pointer transition-colors',
                      selected
                        ? 'bg-primary/15 border-primary text-foreground font-semibold'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LolChampionAvatar
                      championName={p.championName}
                      version={ddragonVersion}
                      size="xs"
                      className="w-5 h-5"
                    />
                    <span>{p.riotIdGameName || p.championName}</span>
                  </button>
                );
              })}
            </div>

            {inspectedSummary && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Performance BG-PERF Breakdown */}
                <div className="lg:col-span-6 p-3.5 rounded-md border border-border bg-background/45 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/80">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.75} />
                      <span className="text-xs font-bold text-foreground">
                        Análisis BG-PERF v2 ({formatRoleLabel(inspectedSummary.performanceBreakdown.role)})
                      </span>
                    </div>
                    <LolPerformanceBadge
                      score={inspectedSummary.performanceScore}
                      grade={inspectedSummary.performanceGrade}
                      isMvp={inspectedSummary.isMvp}
                      isAce={inspectedSummary.isAce}
                      matchRank={inspectedSummary.matchRank}
                      isRemake={inspectedSummary.performanceBreakdown.isRemake}
                    />
                  </div>

                  <LolPillarBars
                    pillars={inspectedSummary.performanceBreakdown.pillars}
                    weights={inspectedSummary.performanceBreakdown.weights}
                  />

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono pt-1">
                    <Badge variant="outline">
                      Mecánica: +{inspectedSummary.performanceBreakdown.mechanicsBonus}
                    </Badge>
                    <Badge variant="outline">
                      Resultado:{' '}
                      {inspectedSummary.performanceBreakdown.outcomeAdjustment >= 0
                        ? `+${inspectedSummary.performanceBreakdown.outcomeAdjustment}`
                        : inspectedSummary.performanceBreakdown.outcomeAdjustment}
                    </Badge>
                  </div>

                  {inspectedSummary.performanceBreakdown.drivers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {inspectedSummary.performanceBreakdown.drivers.map((drv) => (
                        <Badge key={drv} variant="secondary" className="text-[10px]">
                          {drv}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {inspectedSummary.performanceBreakdown.laneDiff && (
                    <div className="p-2.5 rounded-md border border-border bg-card/60 space-y-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        Duelo Directo vs {inspectedSummary.performanceBreakdown.laneDiff.opponentChampionName}
                      </span>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 font-mono text-[11px]">
                        {[
                          { label: 'Oro', val: inspectedSummary.performanceBreakdown.laneDiff.goldDiff },
                          { label: 'Daño', val: inspectedSummary.performanceBreakdown.laneDiff.damageDiff },
                          { label: 'CS', val: inspectedSummary.performanceBreakdown.laneDiff.csDiff },
                          { label: 'Vis', val: inspectedSummary.performanceBreakdown.laneDiff.visionDiff },
                          { label: 'KDA', val: inspectedSummary.performanceBreakdown.laneDiff.kdaDiff },
                          { label: 'Nivel', val: inspectedSummary.performanceBreakdown.laneDiff.levelDiff },
                        ].map((d) => (
                          <div key={d.label} className="p-1.5 rounded bg-background/50 border border-border text-center">
                            <span className="text-[9px] text-muted-foreground block">{d.label}</span>
                            <strong
                              className={
                                d.val > 0
                                  ? 'text-success'
                                  : d.val < 0
                                    ? 'text-destructive'
                                    : 'text-foreground'
                              }
                            >
                              {d.val > 0 ? `+${d.val}` : d.val}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Complete Runes, Stat Shards & Arena Augments */}
                <div className="lg:col-span-6 p-3.5 rounded-md border border-border bg-background/45 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-border/80">
                    <Shield className="w-4 h-4 text-primary" strokeWidth={1.75} />
                    <span className="text-xs font-bold text-foreground">
                      Runas Completas, Stat Shards &amp; Variables API
                    </span>
                  </div>

                  {inspectedRaw?.perks ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {inspectedRaw.perks.styles.map((style) => {
                          const styleMeta = getRuneStyleMeta(style.style);
                          const styleIcon = getRuneStyleIconUrl(style.style);
                          return (
                            <div
                              key={`${style.description}-${style.style}`}
                              className="p-2.5 rounded-md border border-border bg-card/50 space-y-2"
                            >
                              <div className="flex items-center gap-2">
                                {styleIcon && (
                                  <img
                                    src={styleIcon}
                                    alt={styleMeta?.name || String(style.style)}
                                    className="w-5 h-5"
                                  />
                                )}
                                <span className="text-xs font-bold text-foreground">
                                  {styleMeta?.name || `Rama ${style.style}`}
                                </span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto">
                                  {style.description === 'primaryStyle' ? 'Primaria' : 'Secundaria'}
                                </Badge>
                              </div>

                              <div className="space-y-1.5">
                                {style.selections.map((sel, sIdx) => {
                                  const runeMeta = getRuneMeta(sel.perk);
                                  const runeIcon = getRuneIconUrl(sel.perk);
                                  return (
                                    <div
                                      key={`${sel.perk}-${sIdx}`}
                                      className="flex items-center justify-between gap-2 text-[11px] p-1.5 rounded bg-background/45 border border-border/70"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {runeIcon && (
                                          <img
                                            src={runeIcon}
                                            alt={runeMeta?.name || String(sel.perk)}
                                            className="w-5 h-5 rounded-full shrink-0"
                                          />
                                        )}
                                        <span className="font-medium text-foreground truncate">
                                          {runeMeta?.name || `Perk #${sel.perk}`}
                                        </span>
                                      </div>
                                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                        v1:{sel.var1} · v2:{sel.var2} · v3:{sel.var3}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Stat Shards */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Stat Shards:
                        </span>
                        {(
                          [
                            inspectedRaw.perks.statPerks.offense,
                            inspectedRaw.perks.statPerks.flex,
                            inspectedRaw.perks.statPerks.defense,
                          ] as number[]
                        ).map((shardId, idx) => {
                          const shard = STAT_SHARD_META[shardId];
                          const shardIcon = getRuneIconUrl(shardId);
                          return (
                            <span
                              key={`${shardId}-${idx}`}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-background/50 text-[11px] font-mono"
                            >
                              {shardIcon && (
                                <img src={shardIcon} alt={shard?.name || String(shardId)} className="w-4 h-4 rounded-full" />
                              )}
                              <span>{shard?.name || `Shard #${shardId}`}</span>
                            </span>
                          );
                        })}
                      </div>

                      {/* Arena Placement & Augments if present */}
                      {(inspectedRaw.placement ||
                        inspectedRaw.playerAugment1 ||
                        inspectedRaw.playerAugment2) && (
                        <div className="p-2 rounded border border-border bg-card/50 text-[11px] font-mono">
                          Arena Placement: #{inspectedRaw.placement ?? '—'} · Augments:{' '}
                          {[
                            inspectedRaw.playerAugment1,
                            inspectedRaw.playerAugment2,
                            inspectedRaw.playerAugment3,
                            inspectedRaw.playerAugment4,
                            inspectedRaw.playerAugment5,
                            inspectedRaw.playerAugment6,
                          ]
                            .filter((a): a is number => Boolean(a && a > 0))
                            .join(', ') || '—'}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      {isLoadingRaw
                        ? 'Cargando detalles completos de runas...'
                        : 'Sin desglose detallado de runas en esta partida.'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 4: CHALLENGES (ALL API KEYS) */}
          <TabsContent value="challenges" className="flex-1 overflow-y-auto scroller-thin space-y-3 pr-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto scroller-thin">
                {match.participants.map((p) => (
                  <button
                    key={p.puuid}
                    type="button"
                    onClick={() => setInspectedPuuid(p.puuid)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] shrink-0 cursor-pointer',
                      p.puuid === inspectedSummary?.puuid
                        ? 'bg-primary/15 border-primary text-foreground font-semibold'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <LolChampionAvatar
                      championName={p.championName}
                      version={ddragonVersion}
                      size="xs"
                      className="w-4 h-4"
                    />
                    <span>{p.riotIdGameName || p.championName}</span>
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                  strokeWidth={1.75}
                />
                <Input
                  value={challengeSearch}
                  onChange={(e) => setChallengeSearch(e.target.value)}
                  placeholder="Filtrar challenge..."
                  className="pl-8"
                />
              </div>
            </div>

            {challengeEntries.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                {isLoadingRaw
                  ? 'Cargando diccionario challenges...'
                  : 'Sin métricas challenges para este filtro o partida.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                {challengeEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="p-2 rounded-md border border-border bg-background/45 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate" title={key}>
                        {humanizeChallengeKey(key)}
                      </p>
                      <p className="text-[9px] font-mono text-muted-foreground truncate">
                        {key}
                      </p>
                    </div>
                    <strong className="font-mono text-xs text-primary shrink-0">
                      {formatChallengeVal(value)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB 5: RAW JSON INSPECTOR */}
          <TabsContent value="raw" className="flex-1 flex flex-col min-h-0 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'participant', label: 'Participante' },
                    { id: 'info', label: 'Info & Metadata' },
                    { id: 'teams', label: 'Teams' },
                    { id: 'full', label: 'Match Completo' },
                  ] as Array<{ id: 'participant' | 'info' | 'teams' | 'full'; label: string }>
                ).map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setRawSection(sec.id)}
                    className={cn(
                      'px-2.5 py-1 rounded border text-xs font-medium cursor-pointer transition-colors',
                      rawSection === sec.id
                        ? 'bg-primary/15 border-primary text-primary font-semibold'
                        : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {sec.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  value={rawFilter}
                  onChange={(e) => setRawFilter(e.target.value)}
                  placeholder="Filtrar líneas JSON..."
                  className="w-44 font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleCopyJson}
                  title="Copiar JSON"
                >
                  {copiedJson ? (
                    <Check className="w-3.5 h-3.5 text-success" strokeWidth={2} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                  )}
                  <span>Copiar</span>
                </Button>
              </div>
            </div>

            <pre className="flex-1 min-h-0 overflow-auto scroller-thin p-3 rounded-md border border-border bg-[#07090C] text-[11px] font-mono text-emerald-300/90 leading-relaxed">
              {rawJsonText}
            </pre>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
