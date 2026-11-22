import React from 'react';
import { LolRecordEntry, LolRecordId, LolViewMode } from '@/types/lol';
import { DEFAULT_DDRAGON_VERSION } from '@/lib/lolDdragon';
import { LolChampionAvatar, LolInfoTip } from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Clock,
  Crosshair,
  Eye,
  Flag,
  Flame,
  HeartHandshake,
  Medal,
  MessageSquareWarning,
  ShieldAlert,
  Skull,
  Swords,
  Trophy,
  Wheat,
  Zap,
} from 'lucide-react';

export interface LolGroupRecordsPanelProps {
  mode: LolViewMode;
  records: LolRecordEntry[];
  selectedUserId?: string | null;
  ddragonVersion?: string;
  onSelectPlayer?: (userId: string) => void;
  onSelectMatch: (matchId: string) => void;
}

const RECORD_ICON_MAP: Record<LolRecordId, React.ReactNode> = {
  most_time_dead: <Skull className="w-3.5 h-3.5 text-destructive" strokeWidth={1.75} />,
  highest_kp: <Crosshair className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />,
  most_kills: <Swords className="w-3.5 h-3.5 text-success" strokeWidth={1.75} />,
  least_kills: <HeartHandshake className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.75} />,
  best_kda: <Trophy className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />,
  most_deaths: <ShieldAlert className="w-3.5 h-3.5 text-destructive" strokeWidth={1.75} />,
  highest_dpm: <Flame className="w-3.5 h-3.5 text-orange-400" strokeWidth={1.75} />,
  highest_cs_min: <Wheat className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />,
  highest_vision: <Eye className="w-3.5 h-3.5 text-info" strokeWidth={1.75} />,
  highest_ff_rate: <Flag className="w-3.5 h-3.5 text-[#FB7185]" strokeWidth={1.75} />,
  most_mia_pings: (
    <MessageSquareWarning className="w-3.5 h-3.5 text-amber-300" strokeWidth={1.75} />
  ),
  best_single_game: <Medal className="w-3.5 h-3.5 text-amber-300" strokeWidth={1.75} />,
  most_assists: <HeartHandshake className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.75} />,
  best_win_streak: <Zap className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />,
  fastest_ff: <Flag className="w-3.5 h-3.5 text-[#FB7185]" strokeWidth={1.75} />,
  longest_game: <Clock className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.75} />,
};

export const LolGroupRecordsPanel: React.FC<LolGroupRecordsPanelProps> = ({
  mode,
  records,
  selectedUserId = null,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectPlayer,
  onSelectMatch,
}) => {
  const isPersonal = mode === 'personal';

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Flame className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>{isPersonal ? 'Récords Personales' : 'Récords del Grupo'}</span>
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {records.length}
            </Badge>
            <LolInfoTip
              acronym="Récords"
              title={isPersonal ? 'Récords Personales' : 'Salón de Récords'}
              description={
                isPersonal
                  ? 'Tus mejores marcas y extremos individuales en el filtro actual. Clickeá un récord para abrir la partida.'
                  : 'Extremos históricos y divertidos del grupo (excluye remakes). Clickeá cualquier récord para seleccionar al jugador o abrir la partida.'
              }
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-1 flex-1 min-h-0">
        {records.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30 animate-lol-card-pop">
            {isPersonal
              ? 'Sin datos suficientes para calcular récords personales en el filtro actual.'
              : 'Sin datos suficientes para calcular récords del grupo en el filtro actual.'}
          </div>
        ) : (
          <div
            key={`records-${mode}`}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
          >
            {records.map((rec, idx) => {
              const isSelected =
                !isPersonal && Boolean(selectedUserId && rec.userId && selectedUserId === rec.userId);

              const canActivate = isPersonal
                ? Boolean(rec.matchId)
                : Boolean((rec.userId && onSelectPlayer) || rec.matchId);

              const handleActivate = () => {
                if (isPersonal) {
                  if (rec.matchId) {
                    onSelectMatch(rec.matchId);
                  }
                  return;
                }
                if (rec.userId) {
                  onSelectPlayer?.(rec.userId);
                }
                if (rec.matchId) {
                  onSelectMatch(rec.matchId);
                }
              };

              const toneContainer =
                rec.tone === 'ff'
                  ? 'border-[#9F1239]/75 bg-[#4C0519]/40'
                  : rec.tone === 'bad'
                    ? 'border-destructive/35 bg-destructive/[0.05]'
                    : rec.tone === 'fun'
                      ? 'border-sky-500/35 bg-sky-500/[0.05]'
                      : 'border-success/35 bg-success/[0.05]';

              const toneHover =
                rec.tone === 'ff'
                  ? 'hover:bg-[#4C0519]/60'
                  : rec.tone === 'bad'
                    ? 'hover:bg-destructive/[0.10]'
                    : rec.tone === 'fun'
                      ? 'hover:bg-sky-500/[0.10]'
                      : 'hover:bg-success/[0.10]';

              const valueToneClass =
                rec.tone === 'ff'
                  ? 'text-[#FDA4AF]'
                  : rec.tone === 'bad'
                    ? 'text-destructive'
                    : rec.tone === 'fun'
                      ? 'text-sky-300'
                      : 'text-success';

              const personalStatDetail =
                rec.championName && rec.subLabel.startsWith(`${rec.championName} · `)
                  ? rec.subLabel.slice(rec.championName.length + 3)
                  : rec.subLabel;

              const personalMetaLabel = rec.championName
                ? rec.dateLabel
                  ? `${personalStatDetail} · ${rec.dateLabel}`
                  : personalStatDetail
                : rec.dateLabel ?? rec.subLabel;

              const groupLabel = rec.displayName || rec.gameName || 'Jugador';

              return (
                <div
                  key={rec.id}
                  role={canActivate ? 'button' : undefined}
                  tabIndex={canActivate ? 0 : undefined}
                  style={{ animationDelay: `${idx * 35}ms` }}
                  onClick={canActivate ? handleActivate : undefined}
                  onKeyDown={
                    canActivate
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleActivate();
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'group rounded-md border p-2.5 transition-all duration-200 space-y-1.5 animate-lol-card-pop',
                    toneContainer,
                    canActivate &&
                      cn(
                        toneHover,
                        'hover:-translate-y-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring'
                      ),
                    isSelected && 'ring-1 ring-primary'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="transition-transform duration-150 group-hover:scale-110 shrink-0">
                        {RECORD_ICON_MAP[rec.id]}
                      </span>
                      <span className="text-[11px] font-semibold text-foreground truncate">
                        {rec.title}
                      </span>
                      <LolInfoTip
                        acronym={rec.title}
                        title={rec.title}
                        description={rec.description}
                      />
                    </div>
                    <span className={cn('text-xs font-mono font-bold shrink-0', valueToneClass)}>
                      {rec.valueLabel}
                    </span>
                  </div>

                  {isPersonal ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {rec.championName ? (
                          <>
                            <LolChampionAvatar
                              championName={rec.championName}
                              version={ddragonVersion}
                              size="xs"
                              className="w-5 h-5"
                            />
                            <span className="text-xs font-semibold text-foreground truncate">
                              {rec.championName}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="w-5 h-5 rounded-md border border-border bg-background/60 flex items-center justify-center shrink-0">
                              {RECORD_ICON_MAP[rec.id]}
                            </span>
                            <span className="text-xs font-semibold text-foreground truncate">
                              {rec.id === 'best_win_streak' ? 'Racha' : rec.title}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground truncate">
                        {personalMetaLabel}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {rec.championName ? (
                          <LolChampionAvatar
                            championName={rec.championName}
                            version={ddragonVersion}
                            size="xs"
                            className="w-5 h-5"
                          />
                        ) : rec.avatarUrl ? (
                          <img
                            src={rec.avatarUrl}
                            alt={groupLabel}
                            className="w-5 h-5 rounded-full object-cover border border-border shrink-0"
                          />
                        ) : (
                          <span className="w-5 h-5 rounded-full border border-border bg-secondary/70 flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">
                            {groupLabel.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-foreground truncate">
                          {groupLabel}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground truncate">
                        {rec.subLabel}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
