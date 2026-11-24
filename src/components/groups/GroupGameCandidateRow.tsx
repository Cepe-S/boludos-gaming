import React from 'react';
import { resolveGameOfficialUrl } from '@/lib/tasteProfileEngine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Gamepad2, Plus } from 'lucide-react';
import { GroupGameCandidate } from './groupViewHelpers';

export interface GroupGameCandidateRowProps {
  candidate: GroupGameCandidate;
  onAdd: (candidate: GroupGameCandidate) => void;
}

export const GroupGameCandidateRow: React.FC<GroupGameCandidateRowProps> = ({
  candidate,
  onAdd,
}) => {
  return (
    <div className="p-2.5 rounded-lg bg-background/45 border border-border flex items-center justify-between gap-3 hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <a
          href={resolveGameOfficialUrl({
            name: candidate.name,
            coverUrl: candidate.coverUrl,
            tags: candidate.tags,
            id: candidate.catalogGameId,
          })}
          target="_blank"
          rel="noopener noreferrer"
          title={`Ver página oficial de ${candidate.name}`}
          aria-label={`Ver página oficial de ${candidate.name}`}
          className="shrink-0 block hover:opacity-90 transition-opacity"
        >
          {candidate.coverUrl ? (
            <img
              src={candidate.coverUrl}
              alt={candidate.name}
              className="w-16 h-10 rounded object-cover border border-border/60 block"
            />
          ) : (
            <div className="w-16 h-10 rounded bg-secondary/50 border border-border/60 flex items-center justify-center text-muted-foreground">
              <Gamepad2 className="w-4 h-4" strokeWidth={1.75} />
            </div>
          )}
        </a>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground truncate">
              {candidate.name}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {candidate.category}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {candidate.minPlayers}–{candidate.maxPlayers}j
            </span>
          </div>

          {candidate.memberAffinities.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center -space-x-1.5">
                {candidate.memberAffinities.map((aff) => (
                  <div key={aff.player.id} className="relative group/avatar">
                    <img
                      src={aff.player.avatarUrl}
                      alt={aff.player.displayName}
                      className={cn(
                        'w-6 h-6 rounded-full object-cover border-2 bg-background cursor-help transition-transform group-hover/avatar:scale-110 group-hover/avatar:z-10',
                        aff.burnedOut
                          ? 'border-destructive/70 opacity-75'
                          : aff.rating && aff.rating >= 4
                            ? 'border-emerald-400/80'
                            : 'border-border'
                      )}
                    />
                    <div className="pointer-events-none hidden group-hover/avatar:block absolute left-0 bottom-full mb-1.5 z-40 w-48 p-2 rounded-md bg-popover border border-border shadow-xl text-[11px] space-y-1">
                      <div className="font-semibold text-foreground flex items-center justify-between gap-1">
                        <span className="truncate">{aff.player.displayName}</span>
                        {aff.rating && (
                          <span className="text-amber-400 font-mono shrink-0">
                            {aff.rating}★
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px]">
                        <span>{aff.sourceLabel}</span>
                        {aff.hoursPlayed !== undefined && (
                          <span className="font-mono">
                            {aff.hoursPlayed}h
                            {aff.recentHoursPlayed
                              ? ` (${aff.recentHoursPlayed}h rec.)`
                              : ''}
                          </span>
                        )}
                      </div>
                      {aff.burnedOut && (
                        <div className="text-[10px] text-destructive font-medium">
                          Quemado de este juego
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-emerald-400 font-medium">
                {candidate.memberAffinities.length}{' '}
                {candidate.memberAffinities.length === 1
                  ? 'jugador del grupo'
                  : 'jugadores del grupo'}
              </span>
            </div>
          )}
        </div>
      </div>

      <Button
        size="xs"
        variant="secondary"
        className="shrink-0"
        onClick={() => onAdd(candidate)}
        title={`Agregar ${candidate.name} al grupo`}
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span>Agregar</span>
      </Button>
    </div>
  );
};
