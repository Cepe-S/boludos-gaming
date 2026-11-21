import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Game, GAME_CATEGORIES, GameRating, PlayerProfile, UserGamePreference } from '@/types/domain';
import {
  CatalogPlayerFilter,
  CatalogSortBy,
  GameGroupMetrics,
  PLAYER_FILTER_OPTIONS,
  PRESET_GAMES,
  RATING_INFO,
  getSafeCoverUrl,
  handleImageFallback,
} from './sharedCatalogConstants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { resolveGameOfficialUrl } from '@/lib/tasteProfileEngine';
import { Check, Filter, Info, Plus, RotateCcw, Search, Star } from 'lucide-react';

const addClubGameSchema = z.object({
  name: z.string().trim().min(2, 'Ingresá el nombre del juego.'),
  description: z.string().optional(),
  coverUrl: z.string().optional(),
  category: z.string().min(1),
  minPlayers: z.number().int().min(1).max(64),
  maxPlayers: z.number().int().min(1).max(128),
  averageDurationMins: z.number().int().min(5).max(600),
  tags: z.string(),
});

type AddClubGameValues = z.infer<typeof addClubGameSchema>;

export interface ClubMatrixTableViewProps {
  currentUser: PlayerProfile;
  filteredCatalogGames: GameGroupMetrics[];
  totalGamesCount: number;
  totalMyGames: number;
  categories: string[];
  prefMap: Map<string, UserGamePreference>;
  unifiedLikelihoodMap: Map<
    string,
    { score: number; badge: string; affinity: number }
  >;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  playerFilter: CatalogPlayerFilter;
  setPlayerFilter: (val: CatalogPlayerFilter) => void;
  selectedCategory: string;
  setSelectedCategory: (val: string) => void;
  sortBy: CatalogSortBy;
  setSortBy: (val: CatalogSortBy) => void;
  onTogglePlay: (
    gameId: string,
    currentPlays: boolean,
    currentRating: GameRating
  ) => void;
  onSetRating: (gameId: string, rating: GameRating) => void;
  onAddGame: (game: Omit<Game, 'id' | 'addedBy'>) => void;
}

export const ClubMatrixTableView: React.FC<ClubMatrixTableViewProps> = ({
  currentUser,
  filteredCatalogGames,
  totalGamesCount,
  totalMyGames,
  categories,
  prefMap,
  unifiedLikelihoodMap,
  searchQuery,
  setSearchQuery,
  playerFilter,
  setPlayerFilter,
  selectedCategory,
  setSelectedCategory,
  sortBy,
  setSortBy,
  onTogglePlay,
  onSetRating,
  onAddGame,
}) => {
  const [hoveredStar, setHoveredStar] = useState<{
    gameId: string;
    star: GameRating;
  } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const form = useForm<AddClubGameValues>({
    resolver: zodResolver(addClubGameSchema),
    defaultValues: {
      name: '',
      description: '',
      coverUrl: '',
      category: 'Shooter Táctico',
      minPlayers: 1,
      maxPlayers: 4,
      averageDurationMins: 45,
      tags: 'coop, accion, risas',
    },
  });

  useEffect(() => {
    if (isAddModalOpen) {
      form.reset({
        name: '',
        description: '',
        coverUrl: '',
        category: 'Shooter Táctico',
        minPlayers: 1,
        maxPlayers: 4,
        averageDurationMins: 45,
        tags: 'coop, accion, risas',
      });
    }
  }, [isAddModalOpen, form]);

  const handleSelectPreset = (preset: (typeof PRESET_GAMES)[number]) => {
    form.setValue('name', preset.name, { shouldDirty: true });
    form.setValue('description', preset.description ?? '', { shouldDirty: true });
    form.setValue('category', preset.category, { shouldDirty: true });
    form.setValue('minPlayers', preset.minPlayers, { shouldDirty: true });
    form.setValue('maxPlayers', preset.maxPlayers, { shouldDirty: true });
    form.setValue('tags', preset.tags, { shouldDirty: true });
    form.setValue('averageDurationMins', preset.averageDurationMins, {
      shouldDirty: true,
    });
    form.setValue('coverUrl', preset.coverUrl, { shouldDirty: true });
  };

  const handleSubmitAdd = form.handleSubmit((values) => {
    onAddGame({
      name: values.name,
      description: values.description?.trim() || undefined,
      coverUrl: getSafeCoverUrl(values.coverUrl),
      minPlayers: values.minPlayers,
      maxPlayers: Math.max(values.minPlayers, values.maxPlayers),
      category: values.category,
      tags: values.tags
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean),
      averageDurationMins: values.averageDurationMins,
    });
    setIsAddModalOpen(false);
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3 pb-3 border-b border-border">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <CardTitle>Matriz del Club</CardTitle>
              <span className="text-xs text-muted-foreground font-mono">
                {totalGamesCount} juegos · {totalMyGames} activos
              </span>
            </div>
            <Button
              size="icon"
              onClick={() => setIsAddModalOpen(true)}
              title="Agregar juego"
              aria-label="Agregar juego"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>

          {/* Filter & Search Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            <div className="relative md:col-span-5">
              <Search
                className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
                strokeWidth={1.75}
              />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar juego..."
                className="pl-9"
              />
            </div>

            <div className="md:col-span-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.75} />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filtrar por categoría"
                className="flex h-9 w-full rounded-md border border-border bg-background/45 px-2.5 text-xs text-foreground"
              >
                <option value="all">Todas ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3 flex items-center gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CatalogSortBy)}
                aria-label="Ordenar matriz por"
                className="flex h-9 w-full rounded-md border border-border bg-background/45 px-2.5 text-xs text-foreground"
              >
                <option value="likelihood">Afinidad IA</option>
                <option value="synchrony">Sincronía</option>
                <option value="my_rating">Mi voto ★</option>
                <option value="max_players">Jugadores</option>
                <option value="name">Nombre A–Z</option>
              </select>
              {(searchQuery || selectedCategory !== 'all' || playerFilter !== 'all') && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                    setPlayerFilter('all');
                  }}
                  title="Limpiar filtros"
                  aria-label="Limpiar filtros"
                  className="shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
                </Button>
              )}
            </div>
          </div>

          {/* Capacity & Ownership Pills */}
          <div className="flex flex-wrap gap-1.5">
            {PLAYER_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPlayerFilter(opt.id)}
                className={cn(
                  'px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer',
                  playerFilter === opt.id
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-background/45 border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredCatalogGames.length === 0 ? (
            <div className="p-10 text-center text-xs text-muted-foreground">
              Sin resultados para estos filtros.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-2.5 text-[11px] w-[250px]">Juego</TableHead>
                    <TableHead className="h-8 px-2.5 text-[11px] w-[140px]">Sincronía</TableHead>
                    <TableHead className="h-8 px-2.5 text-[11px]">Grupo</TableHead>
                    <TableHead className="h-8 px-2.5 text-[11px] text-right w-[210px]">Mi Voto</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredCatalogGames.map((item) => {
                    const { game, playsCount, totalPlayers, averageRating, synchronyScore, dislikeCount, playerRatings } =
                      item;
                    const myPref = prefMap.get(`${currentUser.id}_${game.id}`);
                    const myPlays = myPref?.plays === true;
                    const myRating = (myPref?.rating ?? 3) as GameRating;
                    const displayRating =
                      hoveredStar?.gameId === game.id ? hoveredStar.star : myRating;
                    const likelihood = unifiedLikelihoodMap.get(game.id);
                    const playingPlayers = playerRatings.filter((pr) => pr.plays);

                    return (
                      <TableRow key={game.id}>
                        {/* Compact Game info + Hover Info Button */}
                        <TableCell className="py-1.5 px-2.5">
                          <div className="flex items-center gap-2 min-w-0">
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
                              className="shrink-0 block hover:opacity-85 transition-opacity"
                            >
                              <img
                                src={getSafeCoverUrl(game.coverUrl)}
                                alt={game.name}
                                onError={handleImageFallback}
                                className="w-7 h-7 object-cover rounded border border-border block"
                              />
                            </a>
                            <span className="text-xs font-semibold text-foreground truncate max-w-[175px]">
                              {game.name}
                            </span>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Detalles de ${game.name}`}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
                                >
                                  <Info className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[260px] p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-foreground text-xs">{game.name}</span>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                    {game.category}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                                  <span>{game.minPlayers}–{game.maxPlayers} jug.</span>
                                  <span>· ~{game.averageDurationMins}m</span>
                                  {likelihood && likelihood.affinity >= 50 && (
                                    <span className="text-primary font-semibold">
                                      {likelihood.affinity}% afín
                                    </span>
                                  )}
                                </div>
                                {game.description && (
                                  <p className="text-[11px] text-muted-foreground leading-snug">
                                    {game.description}
                                  </p>
                                )}
                                {game.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pt-0.5">
                                    {game.tags.slice(0, 4).map((tag) => (
                                      <span
                                        key={tag}
                                        className="text-[9px] px-1.5 py-0 rounded bg-secondary text-secondary-foreground"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>

                        {/* Compact Synchrony */}
                        <TableCell className="py-1.5 px-2.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 cursor-default">
                                <span
                                  className={cn(
                                    'text-xs font-bold font-mono w-9 shrink-0',
                                    synchronyScore >= 75
                                      ? 'text-success'
                                      : synchronyScore >= 55
                                        ? 'text-primary'
                                        : 'text-warning'
                                  )}
                                >
                                  {synchronyScore}%
                                </span>
                                <div className="h-1.5 flex-1 min-w-[36px] rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      synchronyScore >= 75
                                        ? 'bg-success'
                                        : synchronyScore >= 55
                                          ? 'bg-primary'
                                          : 'bg-warning'
                                    )}
                                    style={{ width: `${Math.min(100, synchronyScore)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] text-warning font-medium inline-flex items-center gap-0.5 shrink-0">
                                  <Star className="w-3 h-3 fill-warning text-warning" strokeWidth={1.75} />
                                  {averageRating.toFixed(1)}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="text-[11px] space-y-0.5">
                              <div>{playsCount}/{totalPlayers} juegan · ★ {averageRating.toFixed(1)}</div>
                              {dislikeCount > 0 && (
                                <div className="text-destructive">{dislikeCount} no le gusta</div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>

                        {/* Group player avatars only (ring color = affinity/rating) */}
                        <TableCell className="py-1.5 px-2.5">
                          {playingPlayers.length === 0 ? (
                            <span className="text-[11px] text-muted-foreground/40">—</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {playingPlayers.map((pr) => {
                                const ringClass =
                                  pr.rating >= 4
                                    ? 'ring-2 ring-success'
                                    : pr.rating === 3
                                      ? 'ring-2 ring-primary'
                                      : pr.rating === 2
                                        ? 'ring-2 ring-warning'
                                        : 'ring-2 ring-destructive';

                                return (
                                  <Tooltip key={pr.player.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        aria-label={`${pr.player.displayName}: ${pr.rating}★`}
                                        className="rounded-full focus:outline-none cursor-default shrink-0"
                                      >
                                        <img
                                          src={pr.player.avatarUrl}
                                          alt={pr.player.displayName}
                                          className={cn(
                                            'w-6 h-6 rounded-full object-cover border border-background',
                                            ringClass
                                          )}
                                        />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-[11px] space-y-0.5">
                                      <div className="font-semibold text-foreground">
                                        {pr.player.displayName}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-semibold text-warning">
                                          {pr.rating}★
                                        </span>
                                        <span className="text-muted-foreground">
                                          · {RATING_INFO[pr.rating].label}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {pr.player.activeTitle} · Karma {pr.player.karmaScore}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
                          )}
                        </TableCell>

                        {/* Inline user control */}
                        <TableCell className="py-1.5 px-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="xs"
                              variant={myPlays ? 'emerald' : 'outline'}
                              onClick={() => onTogglePlay(game.id, myPlays, myRating)}
                            >
                              {myPlays && <Check className="w-3 h-3" strokeWidth={2} />}
                              <span>{myPlays ? 'Lo juego' : 'No lo juego'}</span>
                            </Button>

                            <div
                              className="flex items-center"
                              onMouseLeave={() => setHoveredStar(null)}
                            >
                              {([1, 2, 3, 4, 5] as GameRating[]).map((star) => {
                                const active = myPlays && displayRating >= star;
                                return (
                                  <button
                                    key={star}
                                    type="button"
                                    onMouseEnter={() =>
                                      setHoveredStar({ gameId: game.id, star })
                                    }
                                    onClick={() => onSetRating(game.id, star)}
                                    title={RATING_INFO[star].label}
                                    aria-label={RATING_INFO[star].label}
                                    className={cn(
                                      'p-0.5 rounded transition-colors cursor-pointer',
                                      active
                                        ? 'text-warning'
                                        : 'text-muted-foreground/35 hover:text-warning'
                                    )}
                                  >
                                    <Star
                                      className="w-3.5 h-3.5"
                                      fill={active ? 'currentColor' : 'none'}
                                      strokeWidth={1.75}
                                    />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ADD CLUB GAME DIALOG */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Juego</DialogTitle>
          </DialogHeader>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground block">
              Presets:
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {PRESET_GAMES.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className="px-2 py-1 rounded border border-border bg-background hover:border-primary/50 hover:text-foreground text-[11px] text-muted-foreground transition-colors cursor-pointer"
                >
                  + {preset.name}
                </button>
              ))}
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={handleSubmitAdd} className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Lethal Company" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="flex h-9 w-full rounded-md border border-border bg-background/45 px-2.5 text-xs text-foreground"
                        >
                          {GAME_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="coverUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Portada (URL)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <FormField
                  control={form.control}
                  name="minPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Mín</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={64}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value) || 1)
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxPlayers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Máx</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={128}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value) || 1)
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="averageDurationMins"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[11px]">Minutos</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={5}
                          max={600}
                          value={field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value) || 30)
                          }
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
                    <FormControl>
                      <Input placeholder="coop, tactico, risas" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Agregar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
