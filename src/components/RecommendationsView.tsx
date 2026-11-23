import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useNewRecommendations } from '@/hooks/useNewRecommendations';
import { SessionRecommendationsView } from '@/components/sessions/SessionRecommendationsView';
import { CheckCircle2, X } from 'lucide-react';

/**
 * Lightweight standalone view for `/recommendations` so it does not mount
 * or compute the heavy profiler/catalog matrix hooks from GamesCatalogView.
 */
export const RecommendationsView: React.FC = () => {
  const { games, players, activeGroup, addGameToGroup } = useApp();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const groupTargetPlayers = useMemo(() => {
    if (!activeGroup) return players;
    const memberSet = new Set(activeGroup.memberIds);
    const members = players.filter((p) => memberSet.has(p.id));
    return members.length > 0 ? members : players;
  }, [activeGroup, players]);

  const groupCatalogGames = useMemo(() => {
    if (!activeGroup) return games;
    const groupGameSet = new Set(activeGroup.gameIds);
    return games.filter((g) => groupGameSet.has(g.id));
  }, [activeGroup, games]);

  const {
    newRecommendations: groupNewRecommendations,
    readyToPlayRecommendations,
    ensureCatalogGameFromRec,
  } = useNewRecommendations({
    targetPlayers: groupTargetPlayers,
    catalogGames: groupCatalogGames,
    enabled: true,
    maxResults: 30,
  });

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div className="px-3.5 py-2.5 rounded-md bg-success/10 border border-success/40 text-success text-xs flex items-center justify-between gap-2 animate-ui-toast-in">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            {toastMessage}
          </span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            title="Cerrar"
            aria-label="Cerrar"
            className="p-0.5 rounded opacity-75 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <SessionRecommendationsView
        recommendations={groupNewRecommendations}
        readyToPlayRecommendations={
          readyToPlayRecommendations.length > 0 ? readyToPlayRecommendations : undefined
        }
        targetPlayers={groupTargetPlayers}
        showAffinitySearch={true}
        title="Nuevas Recomendaciones para el Grupo"
        readyTitle="Juegos del Grupo · Para Jugar Ahora"
        emptyMessage="No hay recomendaciones nuevas sin agregar para los miembros del grupo."
        actionLabel={activeGroup ? 'Importar al grupo' : 'Importar al catálogo'}
        eligibleVoterIds={activeGroup?.memberIds}
        onSelectExistingGame={(rec) => {
          showToast(`Juego del grupo: ${rec.name}`);
        }}
        onImportRecommendation={(rec) => {
          const game = ensureCatalogGameFromRec(rec);
          if (game) {
            if (activeGroup) {
              addGameToGroup(activeGroup.id, game.id);
            }
            showToast(`"${game.name}" importado al catálogo del grupo.`);
          }
        }}
      />
    </div>
  );
};
