import React from 'react';
import { LolGroupRecordEntry, LolGroupRecordId } from '@/types/lol';
import { DEFAULT_DDRAGON_VERSION } from '@/lib/lolDdragon';
import { LolChampionAvatar, LolInfoTip } from './LolPrimitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
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
} from 'lucide-react';

export interface LolGroupRecordsPanelProps {
  records: LolGroupRecordEntry[];
  scope: 'group' | 'all';
  onChangeScope: (scope: 'group' | 'all') => void;
  hasGroupMatches: boolean;
  selectedUserId: string | null;
  ddragonVersion?: string;
  onSelectPlayer: (userId: string) => void;
  onSelectMatch: (matchId: string) => void;
}

const RECORD_ICON_MAP: Record<LolGroupRecordId, React.ReactNode> = {
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
};

export const LolGroupRecordsPanel: React.FC<LolGroupRecordsPanelProps> = ({
  records,
  scope,
  onChangeScope,
  hasGroupMatches,
  selectedUserId,
  ddragonVersion = DEFAULT_DDRAGON_VERSION,
  onSelectPlayer,
  onSelectMatch,
}) => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 pt-3 px-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Flame className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Récords del Grupo</span>
            </CardTitle>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {records.length}
            </Badge>
            <LolInfoTip
              acronym="Récords"
              title="Salón de Récords"
              description="Extremos históricos y divertidos del grupo (excluye remakes). Clickeá cualquier récord para seleccionar al jugador o abrir la partida."
            />
          </div>

          <div className="inline-flex items-center rounded-md border border-border bg-background/55 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onChangeScope('group')}
              className={cn(
                'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                scope === 'group'
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Grupo ≥2
            </button>
            <button
              type="button"
              onClick={() => onChangeScope('all')}
              className={cn(
                'px-2 py-0.5 rounded-sm font-medium cursor-pointer transition-colors',
                scope === 'all'
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Global
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-1 flex-1 min-h-0">
        {records.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md bg-background/30 space-y-2 animate-lol-card-pop">
            <p>
              {scope === 'group' && !hasGroupMatches
                ? 'Sin partidas con ≥2 del grupo en el filtro actual.'
                : 'Sin datos suficientes para calcular récords.'}
            </p>
            {scope === 'group' && !hasGroupMatches && (
              <button
                type="button"
                onClick={() => onChangeScope('all')}
                className="text-[11px] font-mono text-primary hover:underline cursor-pointer"
              >
                Ver récords en modo Global →
              </button>
            )}
          </div>
        ) : (
          <div
            key={`records-${scope}`}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2"
          >
            {records.map((rec, idx) => {
              const isSelected = selectedUserId === rec.userId;

              const toneContainer =
                rec.tone === 'ff'
                  ? 'border-[#9F1239]/75 bg-[#4C0519]/40 hover:bg-[#4C0519]/60'
                  : rec.tone === 'bad'
                    ? 'border-destructive/35 bg-destructive/[0.05] hover:bg-destructive/[0.10]'
                    : rec.tone === 'fun'
                      ? 'border-sky-500/35 bg-sky-500/[0.05] hover:bg-sky-500/[0.10]'
                      : 'border-success/35 bg-success/[0.05] hover:bg-success/[0.10]';

              const valueToneClass =
                rec.tone === 'ff'
                  ? 'text-[#FDA4AF]'
                  : rec.tone === 'bad'
                    ? 'text-destructive'
                    : rec.tone === 'fun'
                      ? 'text-sky-300'
                      : 'text-success';

              return (
                <div
                  key={rec.id}
                  role="button"
                  tabIndex={0}
                  style={{ animationDelay: `${idx * 35}ms` }}
                  onClick={() => {
                    onSelectPlayer(rec.userId);
                    if (rec.matchId) {
                      onSelectMatch(rec.matchId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPlayer(rec.userId);
                      if (rec.matchId) {
                        onSelectMatch(rec.matchId);
                      }
                    }
                  }}
                  className={cn(
                    'group rounded-md border p-2.5 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer space-y-1.5 focus:outline-none focus:ring-1 focus:ring-ring animate-lol-card-pop',
                    toneContainer,
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

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {rec.championName ? (
                        <LolChampionAvatar
                          championName={rec.championName}
                          version={ddragonVersion}
                          size="xs"
                          className="w-5 h-5"
                        />
                      ) : (
                        <img
                          src={rec.avatarUrl}
                          alt={rec.displayName}
                          className="w-5 h-5 rounded-full object-cover border border-border shrink-0"
                        />
                      )}
                      <span className="text-xs font-semibold text-foreground truncate">
                        {rec.displayName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate">
                      {rec.subLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
