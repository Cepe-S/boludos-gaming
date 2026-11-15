import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronUp,
  Flame,
  Grid,
  Puzzle,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  PVJ_DIMENSION_ICONS,
  PvjDimensionIcon,
} from '@/components/PvjDimensionIcon';
import {
  PlayerProfile,
  PvjDimensionKey,
  PvjPlayerCategorizationResult,
} from '@/types/domain';
import {
  ARCHETYPE_MATRIX_6X6,
  PVJ_DIMENSIONS,
  PVJ_DIMENSION_KEYS,
  PVJ_DIMENSION_MAP,
} from '@/lib/playerCategorizationEngine';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface PvjArchetypeDashboardProps {
  player: PlayerProfile;
  pvjProfile: PvjPlayerCategorizationResult;
  onJumpToPendingHours?: () => void;
}

const CLASSIFICATION_BADGE_MAP: Record<
  PvjPlayerCategorizationResult['classification']['type'],
  { label: string; variant: 'destructive' | 'default' | 'success' }
> = {
  PURE: {
    label: 'Especializado',
    variant: 'destructive',
  },
  COMPOUND: {
    label: 'Combinado',
    variant: 'default',
  },
  POLYMATH: {
    label: 'Polivalente',
    variant: 'success',
  },
};

export const PvjArchetypeDashboard: React.FC<PvjArchetypeDashboardProps> = ({
  player,
  pvjProfile,
  onJumpToPendingHours,
}) => {
  const [showMatrix, setShowMatrix] = useState(false);
  const [inspectedCell, setInspectedCell] = useState<{
    row: PvjDimensionKey;
    col: PvjDimensionKey;
  } | null>(null);

  const primaryMeta = PVJ_DIMENSION_MAP.get(pvjProfile.classification.primary_dimension);
  const secondaryMeta = pvjProfile.classification.secondary_dimension
    ? PVJ_DIMENSION_MAP.get(pvjProfile.classification.secondary_dimension)
    : undefined;

  const classBadge = CLASSIFICATION_BADGE_MAP[pvjProfile.classification.type];
  const confidencePct = Math.round(pvjProfile.classification.confidence_score * 100);
  const pendingHoursCount = pvjProfile.pending_hours_games_count ?? 0;

  const sortedDimensions = useMemo(() => {
    return [...PVJ_DIMENSIONS].sort(
      (a, b) =>
        (pvjProfile.vectors.relative_distribution_P[b.key] || 0) -
        (pvjProfile.vectors.relative_distribution_P[a.key] || 0)
    );
  }, [pvjProfile.vectors.relative_distribution_P]);

  const radarGeometry = useMemo(() => {
    const cx = 165;
    const cy = 148;
    const maxR = 88;
    const rings = [25, 50, 75, 100];

    const getPoint = (index: number, valuePct: number) => {
      const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
      const r = (Math.max(0, Math.min(100, valuePct)) / 100) * maxR;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        angle,
      };
    };

    const ringPolygons = rings.map((pct) => {
      const pts = PVJ_DIMENSIONS.map((_, idx) => {
        const pt = getPoint(idx, pct);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(' ');
      return { pct, pts };
    });

    const dataVertices = PVJ_DIMENSIONS.map((dim, idx) => {
      const sVal = pvjProfile.vectors.radar_scores_S[dim.key] || 0;
      const pVal = pvjProfile.vectors.relative_distribution_P[dim.key] || 0;
      const pt = getPoint(idx, sVal);
      const labelRadiusPct = 128;
      const labelAngle = (Math.PI * 2 * idx) / 6 - Math.PI / 2;
      const lx = cx + ((maxR * labelRadiusPct) / 100) * Math.cos(labelAngle);
      const ly = cy + ((maxR * labelRadiusPct) / 100) * Math.sin(labelAngle);
      const outerPt = getPoint(idx, 100);
      return {
        dim,
        sVal,
        pVal,
        x: pt.x,
        y: pt.y,
        outerX: outerPt.x,
        outerY: outerPt.y,
        lx,
        ly,
      };
    });

    const dataPolygonPoints = dataVertices
      .map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`)
      .join(' ');

    return { cx, cy, ringPolygons, dataVertices, dataPolygonPoints };
  }, [pvjProfile.vectors.radar_scores_S, pvjProfile.vectors.relative_distribution_P]);

  if (pvjProfile.valid_games_analyzed === 0) {
    return (
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center text-primary shrink-0">
              <Puzzle className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                PVJ-6D · Sin datos
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                Importá Steam o asigná <strong className="text-foreground">≥1h</strong> a tus
                juegos para calcular tu perfil.
              </p>
            </div>
          </div>

          {pendingHoursCount > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={1.75} />
                <span>
                  <strong>{pendingHoursCount}</strong> sin horas asignadas.
                </span>
              </div>
              {onJumpToPendingHours && (
                <Button size="xs" variant="amber" onClick={onJumpToPendingHours}>
                  Cargar horas
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const activeMatrixRow = pvjProfile.classification.primary_dimension;
  const activeMatrixCol =
    pvjProfile.classification.secondary_dimension ?? pvjProfile.classification.primary_dimension;

  const activeInspectedMeta = inspectedCell
    ? ARCHETYPE_MATRIX_6X6[inspectedCell.row][inspectedCell.col]
    : null;

  return (
    <Card className="cv-section">
      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* Header + Hero Archetype Summary */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className="w-14 h-14 rounded-md flex items-center justify-center shrink-0 border"
              style={{
                background: `linear-gradient(135deg, ${primaryMeta?.color || '#5865F2'}20, ${
                  secondaryMeta?.color || '#a855f7'
                }18)`,
                borderColor: `${primaryMeta?.color || '#5865F2'}55`,
              }}
            >
              {pvjProfile.classification.type === 'POLYMATH' ? (
                <Sparkles className="w-6 h-6 text-success" strokeWidth={1.75} />
              ) : primaryMeta && secondaryMeta ? (
                <span className="inline-flex items-center gap-1">
                  <PvjDimensionIcon
                    dimension={primaryMeta.key}
                    color={primaryMeta.color}
                    className="w-5 h-5 shrink-0"
                  />
                  <PvjDimensionIcon
                    dimension={secondaryMeta.key}
                    color={secondaryMeta.color}
                    className="w-4 h-4 shrink-0 opacity-90"
                  />
                </span>
              ) : primaryMeta ? (
                <PvjDimensionIcon
                  dimension={primaryMeta.key}
                  color={primaryMeta.color}
                  className="w-6 h-6 shrink-0"
                />
              ) : (
                <Puzzle className="w-6 h-6 text-primary" strokeWidth={1.75} />
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#99A5FF] inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" strokeWidth={1.75} />
                  PVJ-6D · {player.displayName}
                </span>
                <Badge variant={classBadge.variant} className="text-[10px]">
                  {classBadge.label}
                </Badge>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                {pvjProfile.classification.archetype_name}
              </h3>

              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                {primaryMeta && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded border text-foreground"
                    style={{
                      backgroundColor: `${primaryMeta.color}18`,
                      borderColor: `${primaryMeta.color}55`,
                    }}
                  >
                    <PvjDimensionIcon
                      dimension={primaryMeta.key}
                      color={primaryMeta.color}
                      className="w-3.5 h-3.5 shrink-0"
                    />
                    <span>
                      {primaryMeta.label} ·{' '}
                      {pvjProfile.vectors.relative_distribution_P[primaryMeta.key].toFixed(1)}%
                    </span>
                  </span>
                )}
                {secondaryMeta && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded border text-foreground"
                    style={{
                      backgroundColor: `${secondaryMeta.color}14`,
                      borderColor: `${secondaryMeta.color}45`,
                    }}
                  >
                    <PvjDimensionIcon
                      dimension={secondaryMeta.key}
                      color={secondaryMeta.color}
                      className="w-3.5 h-3.5 shrink-0"
                    />
                    <span>
                      {secondaryMeta.label} ·{' '}
                      {pvjProfile.vectors.relative_distribution_P[secondaryMeta.key].toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3 Compact Metrics Tiles */}
          <div className="grid grid-cols-3 gap-2 shrink-0 lg:w-[300px]">
            <div className="rounded-md bg-[#0B0D10] border border-border px-2.5 py-2 text-center">
              <span className="text-[10px] font-medium text-muted-foreground block">
                Juegos
              </span>
              <span className="text-base font-bold font-mono text-foreground">
                {pvjProfile.valid_games_analyzed}
              </span>
            </div>
            <div className="rounded-md bg-[#0B0D10] border border-border px-2.5 py-2 text-center">
              <span className="text-[10px] font-medium text-muted-foreground block">
                Horas
              </span>
              <span className="text-base font-bold font-mono text-[#99A5FF]">
                {Math.round(pvjProfile.total_hours_analyzed).toLocaleString()}h
              </span>
            </div>
            <div className="rounded-md bg-[#0B0D10] border border-border px-2.5 py-2 text-center">
              <span className="text-[10px] font-medium text-muted-foreground block">
                Confianza
              </span>
              <span className="text-base font-bold font-mono text-emerald-400">
                {confidencePct}%
              </span>
            </div>
          </div>
        </div>

        {/* Pending Hours Alert */}
        {pendingHoursCount > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" strokeWidth={1.75} />
              <span>
                <strong>{pendingHoursCount}</strong> sin horas asignadas.
              </span>
            </div>
            {onJumpToPendingHours && (
              <Button size="xs" variant="amber" onClick={onJumpToPendingHours}>
                Cargar horas
              </Button>
            )}
          </div>
        )}

        {/* Hexagonal Radar + Relative Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left: SVG Hexagonal Radar */}
          <div className="lg:col-span-5 rounded-md bg-[#0B0D10] border border-border p-4 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                Radar PVJ-6D
              </span>
            </div>

            <svg
              viewBox="0 0 330 296"
              className="w-full max-w-[320px] h-auto select-none overflow-visible"
              role="img"
              aria-label="Gráfico de radar de estilo gamer"
            >
              <defs>
                <radialGradient id="pvjRadarFill" cx="50%" cy="50%" r="55%">
                  <stop offset="0%" stopColor="#5865F2" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.22" />
                </radialGradient>
              </defs>

              {radarGeometry.ringPolygons.map((ring) => (
                <polygon
                  key={ring.pct}
                  points={ring.pts}
                  fill={ring.pct === 100 ? 'rgba(17, 20, 26, 0.7)' : 'none'}
                  stroke="rgba(139, 148, 158, 0.22)"
                  strokeWidth={ring.pct === 100 ? 1.2 : 0.8}
                  strokeDasharray={ring.pct === 100 ? undefined : '3 3'}
                />
              ))}

              {radarGeometry.dataVertices.map((v) => (
                <line
                  key={`spoke-${v.dim.key}`}
                  x1={radarGeometry.cx}
                  y1={radarGeometry.cy}
                  x2={v.outerX}
                  y2={v.outerY}
                  stroke="rgba(139, 148, 158, 0.22)"
                  strokeWidth="1"
                />
              ))}

              <polygon
                points={radarGeometry.dataPolygonPoints}
                fill="url(#pvjRadarFill)"
                stroke="#818cf8"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />

              {radarGeometry.dataVertices.map((v) => {
                const AxisIcon = PVJ_DIMENSION_ICONS[v.dim.key];
                return (
                  <g key={`vertex-${v.dim.key}`}>
                    <circle
                      cx={v.x}
                      cy={v.y}
                      r="4"
                      fill={v.dim.color}
                      stroke="#0B0D10"
                      strokeWidth="1.5"
                    />
                    <AxisIcon
                      x={v.lx - 7}
                      y={v.ly - 22}
                      width={14}
                      height={14}
                      color={v.dim.color}
                      strokeWidth={2}
                    />
                    <text
                      x={v.lx}
                      y={v.ly - 1}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#F0F6FC"
                      fontSize="10.5"
                      fontWeight="700"
                    >
                      {v.dim.shortLabel}
                    </text>
                    <text
                      x={v.lx}
                      y={v.ly + 12}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={v.dim.color}
                      fontSize="10"
                      fontWeight="800"
                    >
                      {Math.round(v.sVal)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Right: Relative Affinity Distribution */}
          <div className="lg:col-span-7 rounded-md bg-[#0B0D10] border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />
                Distribución PVJ-6D
              </span>
            </div>

            <div className="space-y-2.5">
              {sortedDimensions.map((dim, idx) => {
                const pScore = pvjProfile.vectors.relative_distribution_P[dim.key] || 0;
                const isPrimary = dim.key === pvjProfile.classification.primary_dimension;
                const isSecondary = dim.key === pvjProfile.classification.secondary_dimension;
                return (
                  <div key={dim.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground w-4">
                          #{idx + 1}
                        </span>
                        <PvjDimensionIcon
                          dimension={dim.key}
                          color={dim.color}
                          className="w-3.5 h-3.5 shrink-0"
                        />
                        <span className="font-semibold text-foreground">{dim.label}</span>
                        {isPrimary && (
                          <Badge variant="default" className="text-[9px] px-1.5 py-0">
                            Dominante
                          </Badge>
                        )}
                        {isSecondary && (
                          <Badge variant="purple" className="text-[9px] px-1.5 py-0">
                            Secundaria
                          </Badge>
                        )}
                      </div>
                      <span className="font-bold font-mono text-foreground text-[11px] shrink-0">
                        {pScore.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#181C24] overflow-hidden border border-border">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(2, Math.min(100, pScore))}%`,
                          backgroundColor: dim.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Influencing Games Table */}
        <div className="rounded-md bg-[#0B0D10] border border-border p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
              Top {pvjProfile.top_influencing_games.length} Influyentes
            </h4>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Juego</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="text-right">Dimensión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pvjProfile.top_influencing_games.map((g) => {
                  const domMeta = PVJ_DIMENSION_MAP.get(g.dominant_dimension);
                  return (
                    <TableRow key={`${g.app_id}-${g.name}`}>
                      <TableCell className="font-medium text-foreground">
                        <span className="block truncate max-w-[240px] sm:max-w-[320px]">{g.name}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground whitespace-nowrap">
                        {g.hours}h
                        {g.recent_hours !== undefined && g.recent_hours > 0 && (
                          <span className="ml-1 text-[10px] text-emerald-400">
                            (+{g.recent_hours}h)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {domMeta && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border whitespace-nowrap text-foreground"
                            style={{
                              backgroundColor: `${domMeta.color}18`,
                              borderColor: `${domMeta.color}45`,
                            }}
                          >
                            <PvjDimensionIcon
                              dimension={domMeta.key}
                              color={domMeta.color}
                              className="w-3 h-3 shrink-0"
                            />
                            <span>{domMeta.label}</span>
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Toggle 6x6 Archetype Matrix */}
        <div className="pt-0.5">
          <Button
            variant={showMatrix ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowMatrix((prev) => !prev)}
          >
            <Grid className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>Matriz 6×6</span>
            {showMatrix ? (
              <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </Button>
        </div>

        {showMatrix && (
          <div className="rounded-md bg-background/45 backdrop-blur-sm border border-border/70 p-3 space-y-2.5 w-fit max-w-full">
            <h5 className="text-xs font-semibold text-foreground">
              Arquetipos 6×6
            </h5>

            <div className="overflow-x-auto scroller-thin pb-1">
              <div className="w-fit space-y-1 text-[10px]">
                {/* Header Row */}
                <div className="grid grid-cols-[84px_repeat(6,82px)] gap-1">
                  <div className="px-2 py-1.5 rounded border border-border/70 bg-card/55 text-left font-semibold text-muted-foreground flex items-center">
                    Estilo
                  </div>
                  {PVJ_DIMENSIONS.map((colDim) => (
                    <div
                      key={`col-${colDim.key}`}
                      className="px-1 py-1.5 rounded border border-border/70 bg-card/55 text-center font-semibold text-foreground flex items-center justify-center gap-1"
                    >
                      <PvjDimensionIcon
                        dimension={colDim.key}
                        color={colDim.color}
                        className="w-3 h-3 shrink-0"
                      />
                      <span className="truncate">{colDim.label}</span>
                    </div>
                  ))}
                </div>

                {/* 6x6 Compact Symmetric Square Grid Rows */}
                {PVJ_DIMENSION_KEYS.map((rowKey) => {
                  const rowDim = PVJ_DIMENSION_MAP.get(rowKey)!;
                  return (
                    <div
                      key={`row-${rowKey}`}
                      className="grid grid-cols-[84px_repeat(6,82px)] gap-1 items-stretch"
                    >
                      <div className="px-2 py-1.5 rounded border border-border/70 bg-card/55 text-left font-semibold text-foreground flex items-center gap-1 whitespace-nowrap">
                        <PvjDimensionIcon
                          dimension={rowDim.key}
                          color={rowDim.color}
                          className="w-3 h-3 shrink-0"
                        />
                        <span className="truncate">{rowDim.label}</span>
                      </div>

                      {PVJ_DIMENSION_KEYS.map((colKey) => {
                        const colDim = PVJ_DIMENSION_MAP.get(colKey)!;
                        const cellMeta = ARCHETYPE_MATRIX_6X6[rowKey][colKey];
                        const isDiagonal = rowKey === colKey;
                        const isPlayerActive =
                          pvjProfile.classification.type !== 'POLYMATH' &&
                          ((rowKey === activeMatrixRow && colKey === activeMatrixCol) ||
                            (rowKey === activeMatrixCol && colKey === activeMatrixRow));
                        const isInspected =
                          inspectedCell?.row === rowKey && inspectedCell?.col === colKey;

                        return (
                          <button
                            key={`cell-${rowKey}-${colKey}`}
                            type="button"
                            title={cellMeta.name}
                            onClick={() => setInspectedCell({ row: rowKey, col: colKey })}
                            className={cn(
                              'aspect-square w-[82px] rounded border p-1.5 text-center transition-colors flex flex-col items-center justify-between gap-1 cursor-pointer',
                              isPlayerActive
                                ? 'bg-primary/25 border-primary text-foreground ring-1 ring-inset ring-primary font-bold'
                                : isInspected
                                  ? 'bg-primary/15 border-primary/60 text-foreground ring-1 ring-inset ring-primary/50'
                                  : isDiagonal
                                    ? 'bg-secondary/65 border-border/80 text-foreground hover:bg-accent/70 font-semibold'
                                    : 'bg-background/50 border-border/70 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                            )}
                          >
                            <span className="w-full flex-1 flex items-center justify-center text-[9.5px] leading-[1.15] line-clamp-3 break-words">
                              {cellMeta.name}
                            </span>

                            <span className="inline-flex items-center justify-center gap-1 shrink-0">
                              {isDiagonal ? (
                                <PvjDimensionIcon
                                  dimension={rowKey}
                                  color={rowDim.color}
                                  className="w-3.5 h-3.5 shrink-0"
                                />
                              ) : (
                                <>
                                  <PvjDimensionIcon
                                    dimension={rowKey}
                                    color={rowDim.color}
                                    className="w-3 h-3 shrink-0"
                                  />
                                  <PvjDimensionIcon
                                    dimension={colKey}
                                    color={colDim.color}
                                    className="w-3 h-3 shrink-0 opacity-90"
                                  />
                                </>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {activeInspectedMeta && inspectedCell && (
              <div className="rounded-md bg-card/55 backdrop-blur-sm border border-primary/40 px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
                <span className="inline-flex items-center gap-1 pt-0.5 shrink-0">
                  <PvjDimensionIcon
                    dimension={inspectedCell.row}
                    color={PVJ_DIMENSION_MAP.get(inspectedCell.row)?.color}
                    className="w-4 h-4 shrink-0"
                  />
                  {inspectedCell.row !== inspectedCell.col && (
                    <PvjDimensionIcon
                      dimension={inspectedCell.col}
                      color={PVJ_DIMENSION_MAP.get(inspectedCell.col)?.color}
                      className="w-4 h-4 shrink-0"
                    />
                  )}
                </span>
                <div>
                  <div className="font-semibold text-foreground">
                    {activeInspectedMeta.name}{' '}
                    <span className="text-[10px] font-normal text-[#99A5FF] ml-1">
                      ({PVJ_DIMENSION_MAP.get(inspectedCell.row)?.label} ×{' '}
                      {PVJ_DIMENSION_MAP.get(inspectedCell.col)?.label})
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{activeInspectedMeta.description}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
