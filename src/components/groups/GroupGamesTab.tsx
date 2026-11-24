import React, { useEffect, useMemo, useState } from 'react';
import {
  DiscordIntegrationConfig,
  GAME_CATEGORIES,
  Game,
  GameRating,
  GamingGroup,
  PlayerProfile,
  UserGamePreference,
} from '@/types/domain';
import { KnowledgeGameEntry, resolveGameOfficialUrl } from '@/lib/tasteProfileEngine';
import {
  SearchedSteamGame,
  fetchExternalDiscoveryGames,
  getCachedExternalDiscoveryGames,
  searchSteamStoreGames,
} from '@/lib/steamService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BookPlus,
  Check,
  ExternalLink,
  Gamepad2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  GroupGameCandidate,
  buildGroupGameCandidates,
} from './groupViewHelpers';
import { GroupGameCandidateRow } from './GroupGameCandidateRow';
import { GroupLibraryModal } from './GroupLibraryModal';

export interface GroupGamesTabProps {
  activeGroup: GamingGroup;
  currentUser: PlayerProfile;
  isCreatorOrAdmin: boolean;
  currentMembers: PlayerProfile[];
  games: Game[];
  groupGames: Game[];
  preferences: UserGamePreference[];
  discordConfig: DiscordIntegrationConfig;
  addGameToGroup: (groupId: string, gameId: string) => void;
  removeGameFromGroup: (groupId: string, gameId: string) => void;
  addAndLinkGameToGroup: (groupId: string, game: Omit<Game, 'id' | 'addedBy'>) => Game;
  updateGamePreference: (
    gameId: string,
    plays: boolean,
    rating: GameRating,
    hoursPlayed?: number,
    recentHoursPlayed?: number
  ) => void;
  updateSteamGameFeedback: (
    appId: number,
    patch: {
      userRating?: GameRating;
      burnedOut?: boolean;
      selectedForCatalog?: boolean;
      manualHoursOverride?: number;
      manualRecentHoursOverride?: number;
    },
    userId?: string
  ) => void;
}

export const GroupGamesTab: React.FC<GroupGamesTabProps> = ({
  activeGroup,
  currentUser,
  isCreatorOrAdmin,
  currentMembers,
  games,
  groupGames,
  preferences,
  discordConfig,
  addGameToGroup,
  removeGameFromGroup,
  addAndLinkGameToGroup,
  updateGamePreference,
  updateSteamGameFeedback,
}) => {
  const [groupGameSearch, setGroupGameSearch] = useState('');
  const [groupDiscoveryGames, setGroupDiscoveryGames] = useState<KnowledgeGameEntry[]>(() =>
    getCachedExternalDiscoveryGames()
  );
  const [groupLiveSearchResults, setGroupLiveSearchResults] = useState<SearchedSteamGame[]>([]);
  const [isSearchingGroupGames, setIsSearchingGroupGames] = useState(false);
  const [groupGamePickerLimit, setGroupGamePickerLimit] = useState(30);
  const [showCustomGameForm, setShowCustomGameForm] = useState(false);
  const [customGameName, setCustomGameName] = useState('');
  const [customGameCategory, setCustomGameCategory] = useState<string>(GAME_CATEGORIES[0].id);
  const [customGameMinPlayers, setCustomGameMinPlayers] = useState(1);
  const [customGameMaxPlayers, setCustomGameMaxPlayers] = useState(5);
  const [libraryModalGame, setLibraryModalGame] = useState<Game | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchExternalDiscoveryGames({
      igdbClientId: discordConfig.igdbClientId,
      igdbClientSecret: discordConfig.igdbClientSecret,
    })
      .then((items) => {
        if (!cancelled) setGroupDiscoveryGames(items);
      })
      .catch(() => {
        if (!cancelled) setGroupDiscoveryGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [discordConfig.igdbClientId, discordConfig.igdbClientSecret]);

  useEffect(() => {
    const q = groupGameSearch.trim();
    setGroupGamePickerLimit(30);
    if (q.length < 2) {
      setGroupLiveSearchResults([]);
      setIsSearchingGroupGames(false);
      return;
    }

    let cancelled = false;
    setIsSearchingGroupGames(true);
    const timer = window.setTimeout(async () => {
      try {
        const items = await searchSteamStoreGames(q, {
          igdbClientId: discordConfig.igdbClientId,
          igdbClientSecret: discordConfig.igdbClientSecret,
        });
        if (!cancelled) setGroupLiveSearchResults(items);
      } catch {
        if (!cancelled) setGroupLiveSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchingGroupGames(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [groupGameSearch, discordConfig.igdbClientId, discordConfig.igdbClientSecret]);

  const groupGameCandidates = useMemo<GroupGameCandidate[]>(
    () =>
      buildGroupGameCandidates({
        activeGroup,
        groupGames,
        currentMembers,
        games,
        preferences,
        groupDiscoveryGames,
        groupLiveSearchResults,
        groupGameSearch,
      }),
    [
      activeGroup,
      groupGames,
      currentMembers,
      games,
      preferences,
      groupDiscoveryGames,
      groupLiveSearchResults,
      groupGameSearch,
    ]
  );

  const myPreferenceByGameId = useMemo(() => {
    const map = new Map<string, UserGamePreference>();
    for (const p of preferences) {
      if (p.userId === currentUser.id) {
        map.set(p.gameId, p);
      }
    }
    return map;
  }, [preferences, currentUser.id]);

  const handleAddCustomGameToGroup = () => {
    const trimmed = customGameName.trim();
    if (!trimmed) return;
    const minP = Math.max(1, Math.min(customGameMinPlayers, customGameMaxPlayers));
    const maxP = Math.max(minP, customGameMaxPlayers);
    addAndLinkGameToGroup(activeGroup.id, {
      name: trimmed,
      category: customGameCategory,
      coverUrl: '',
      minPlayers: minP,
      maxPlayers: maxP,
      tags: [],
      averageDurationMins: 90,
    });
    setCustomGameName('');
    setShowCustomGameForm(false);
  };

  const handleAddCandidate = (candidate: GroupGameCandidate) => {
    if (candidate.catalogGameId) {
      addGameToGroup(activeGroup.id, candidate.catalogGameId);
      return;
    }
    addAndLinkGameToGroup(activeGroup.id, {
      name: candidate.name,
      category: candidate.category,
      coverUrl: candidate.coverUrl,
      minPlayers: candidate.minPlayers,
      maxPlayers: candidate.maxPlayers,
      tags: candidate.tags,
      averageDurationMins: candidate.averageDurationMins,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-primary" strokeWidth={1.75} />
            <span>Juegos del grupo ({groupGames.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          {groupGames.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Este grupo todavía no tiene juegos cargados.
              {isCreatorOrAdmin
                ? ' Agregalos desde el catálogo o creá uno abajo.'
                : ' Pedile a un admin que agregue juegos.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {groupGames.map((game) => {
                const myPref = myPreferenceByGameId.get(game.id);
                const inMyLibrary = Boolean(myPref?.plays);
                return (
                  <div
                    key={game.id}
                    className="p-3 rounded-lg bg-background/50 border border-border flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {game.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {game.category}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {game.minPlayers}–{game.maxPlayers} jug.
                        </span>
                        {inMyLibrary && myPref && (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <Check className="w-3 h-3" strokeWidth={2} />
                            {myPref.rating}★ · {myPref.hoursPlayed ?? 0}h
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={resolveGameOfficialUrl({
                          name: game.name,
                          coverUrl: game.coverUrl,
                          tags: game.tags,
                          id: game.id,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Ver página oficial de ${game.name}`}
                        aria-label={`Ver página oficial de ${game.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </a>
                      <Button
                        size="xs"
                        variant={inMyLibrary ? 'outline' : 'secondary'}
                        onClick={() => setLibraryModalGame(game)}
                        title={
                          inMyLibrary
                            ? 'Editar puntaje y horas en mi librería'
                            : 'Agregar a mi librería'
                        }
                      >
                        <BookPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                        <span>{inMyLibrary ? 'En librería' : 'Agregar a librería'}</span>
                      </Button>
                      {isCreatorOrAdmin && (
                        <Button
                          size="xs"
                          variant="destructive"
                          className="w-7 px-0"
                          onClick={() => removeGameFromGroup(activeGroup.id, game.id)}
                          title={`Sacar ${game.name} del grupo`}
                          aria-label={`Sacar ${game.name} del grupo`}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isCreatorOrAdmin && (
        <Card>
          <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Agregar juego al grupo</span>
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-52">
                <Search
                  className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                  strokeWidth={1.75}
                />
                <Input
                  value={groupGameSearch}
                  onChange={(e) => setGroupGameSearch(e.target.value)}
                  placeholder="Buscar catálogo..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <Button
                size="xs"
                variant={showCustomGameForm ? 'secondary' : 'outline'}
                onClick={() => setShowCustomGameForm((v) => !v)}
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Nuevo</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {showCustomGameForm && (
              <div className="p-3 rounded-lg bg-background/60 border border-border space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    value={customGameName}
                    onChange={(e) => setCustomGameName(e.target.value)}
                    placeholder="Nombre del juego (ej: Helldivers 2)"
                    className="h-8 text-xs"
                  />
                  <select
                    value={customGameCategory}
                    onChange={(e) => setCustomGameCategory(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  >
                    {GAME_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Jugadores:</span>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={customGameMinPlayers}
                      onChange={(e) => setCustomGameMinPlayers(Number(e.target.value) || 1)}
                      className="w-16 h-7 text-xs"
                    />
                    <span>a</span>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={customGameMaxPlayers}
                      onChange={(e) => setCustomGameMaxPlayers(Number(e.target.value) || 5)}
                      className="w-16 h-7 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setShowCustomGameForm(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="xs"
                      disabled={!customGameName.trim()}
                      onClick={handleAddCustomGameToGroup}
                    >
                      Crear y agregar
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isSearchingGroupGames && (
              <p className="text-[11px] text-muted-foreground">
                Buscando juegos en Steam / IGDB...
              </p>
            )}

            {groupGameCandidates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No se encontraron juegos que coincidan con la búsqueda.
              </p>
            ) : (
              <div className="space-y-2">
                {groupGameCandidates.slice(0, groupGamePickerLimit).map((candidate) => (
                  <GroupGameCandidateRow
                    key={candidate.key}
                    candidate={candidate}
                    onAdd={handleAddCandidate}
                  />
                ))}

                {groupGameCandidates.length > groupGamePickerLimit && (
                  <div className="pt-1 flex justify-center">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setGroupGamePickerLimit((n) => n + 30)}
                    >
                      Mostrar más ({groupGameCandidates.length - groupGamePickerLimit} restantes)
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <GroupLibraryModal
        game={libraryModalGame}
        currentUser={currentUser}
        existingPref={libraryModalGame ? myPreferenceByGameId.get(libraryModalGame.id) : undefined}
        onClose={() => setLibraryModalGame(null)}
        onSave={({ game, rating, hoursPlayed, recentHoursPlayed, steamAppId }) => {
          updateGamePreference(game.id, true, rating, hoursPlayed, recentHoursPlayed);
          if (steamAppId !== null) {
            updateSteamGameFeedback(steamAppId, {
              userRating: rating,
              selectedForCatalog: true,
              manualHoursOverride: hoursPlayed,
              manualRecentHoursOverride: recentHoursPlayed,
            });
          }
          setLibraryModalGame(null);
        }}
      />
    </div>
  );
};
