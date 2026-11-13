import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Game, GameRating, UserGamePreference, PlayerProfile } from '../types/domain';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  Gamepad2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Users,
  X,
  Zap,
} from 'lucide-react';

interface GameGroupMetrics {
  game: Game;
  playsCount: number;
  totalPlayers: number;
  averageRating: number;
  synchronyScore: number;
  dislikeCount: number;
  playerRatings: {
    player: PlayerProfile;
    plays: boolean;
    rating: GameRating;
  }[];
}

const PRESET_GAMES = [
  {
    name: 'Left 4 Dead 2',
    category: 'Coop Zombies',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'zombies, coop, campaña, supervivencia',
    averageDurationMins: 45,
    coverUrl:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Minecraft',
    category: 'Survival Sandbox',
    minPlayers: 1,
    maxPlayers: 20,
    tags: 'survival, sandbox, construccion, mods, chill',
    averageDurationMins: 90,
    coverUrl:
      'https://images.unsplash.com/photo-1627856013091-fed6e4e30025?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Chained Together',
    category: 'Coop Plataformas',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'coop, caidas, risas, infierno, parkour',
    averageDurationMins: 60,
    coverUrl:
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'PUBG: BATTLEGROUNDS',
    category: 'Battle Royale',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'battleroyale, shooter, squads, tactico',
    averageDurationMins: 35,
    coverUrl:
      'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Rust',
    category: 'Hardcore Survival',
    minPlayers: 1,
    maxPlayers: 16,
    tags: 'survival, pvp, raids, bases, toxico',
    averageDurationMins: 120,
    coverUrl:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'EA Sports FC 25',
    category: 'Deportes',
    minPlayers: 1,
    maxPlayers: 22,
    tags: 'futbol, clubes pro, amigos, fulbito',
    averageDurationMins: 25,
    coverUrl:
      'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Lethal Company',
    category: 'Terror Coop',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'terror, risas, scrap, monstruos, voz de proximidad',
    averageDurationMins: 45,
    coverUrl:
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Age of Empires II: DE',
    category: 'Estrategia RTS',
    minPlayers: 1,
    maxPlayers: 8,
    tags: 'rts, medieval, estrategia, aldeanos, wololo',
    averageDurationMins: 60,
    coverUrl:
      'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Valorant',
    category: 'Tactical FPS',
    minPlayers: 1,
    maxPlayers: 5,
    tags: 'tactical fps, 5v5, competitivo, vandal, poderes',
    averageDurationMins: 40,
    coverUrl:
      'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Helldivers 2',
    category: 'Sci-Fi Coop PVE',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'coop, disparos, democracia, bichos, mechs',
    averageDurationMins: 40,
    coverUrl:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
  },
];

const RATING_INFO: Record<GameRating, { label: string; sub: string; color: string }> = {
  1: {
    label: '1★ Solo si me obligan',
    sub: 'Penaliza -15 pts la ruleta',
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  2: {
    label: '2★ Zafa de vez en cuando',
    sub: 'Tolerable si no hay otro',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  3: {
    label: '3★ Me copa',
    sub: 'Buena opción para la noche',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  },
  4: {
    label: '4★ Juegazo',
    sub: 'Ganas de viciar en serio',
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  },
  5: {
    label: '5★ Vicio enfermizo',
    sub: 'Prioridad máxima en ruleta',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
};

export function GamesCatalogView() {
  const { games, preferences, updateGamePreference, addGame, currentUser, players } = useApp();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [playerFilter, setPlayerFilter] = useState<
    'all' | 'up_to_4' | '5_players' | '6_plus' | 'only_mine'
  >('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'synchrony' | 'name' | 'max_players' | 'my_rating'>(
    'synchrony'
  );

  // Hover star state for interactive selector feedback
  const [hoveredStar, setHoveredStar] = useState<{ gameId: string; star: GameRating } | null>(
    null
  );

  // Add Game Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCoverUrl, setAddCoverUrl] = useState('');
  const [addMinPlayers, setAddMinPlayers] = useState(1);
  const [addMaxPlayers, setAddMaxPlayers] = useState(4);
  const [addCategory, setAddCategory] = useState('Coop');
  const [addTags, setAddTags] = useState('coop, accion, risas');
  const [addDuration, setAddDuration] = useState(45);

  // Quick feedback alert
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Preference map: `${userId}_${gameId}` -> UserGamePreference
  const prefMap = useMemo(() => {
    const map = new Map<string, UserGamePreference>();
    for (const p of preferences) {
      map.set(`${p.userId}_${p.gameId}`, p);
    }
    return map;
  }, [preferences]);

  // Compute group metrics for every game
  const gamesWithMetrics = useMemo<GameGroupMetrics[]>(() => {
    return games.map((game) => {
      let playsCount = 0;
      let ratingSum = 0;
      let dislikeCount = 0;
      let lovedCount = 0;

      const playerRatings = players.map((player) => {
        const pref = prefMap.get(`${player.id}_${game.id}`);
        const plays = pref ? pref.plays : false;
        const rating = (pref ? pref.rating : 3) as GameRating;

        if (plays) {
          playsCount++;
          ratingSum += rating;
          if (rating === 1) dislikeCount++;
          if (rating >= 4) lovedCount++;
        }

        return { player, plays, rating };
      });

      const totalPlayers = players.length;
      let synchronyScore = 0;
      let averageRating = 1.0;

      if (playsCount > 0) {
        averageRating = Number((ratingSum / playsCount).toFixed(2));
        let raw = Math.round(averageRating * 20);
        raw -= dislikeCount * 15;
        if (lovedCount === totalPlayers && totalPlayers > 0) {
          raw += 5;
        }
        synchronyScore = Math.min(100, Math.max(0, raw));
      }

      return {
        game,
        playsCount,
        totalPlayers,
        averageRating,
        synchronyScore,
        dislikeCount,
        playerRatings,
      };
    });
  }, [games, players, prefMap]);

  // Unique categories for filter pills
  const categories = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.category) set.add(g.category);
    });
    return Array.from(set);
  }, [games]);

  // Filtered & Sorted Games
  const filteredGames = useMemo(() => {
    return gamesWithMetrics
      .filter((item) => {
        const g = item.game;
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = g.name.toLowerCase().includes(q);
          const matchCat = g.category.toLowerCase().includes(q);
          const matchTags = g.tags.some((t) => t.toLowerCase().includes(q));
          if (!matchName && !matchCat && !matchTags) return false;
        }

        // Category filter
        if (selectedCategory !== 'all' && g.category !== selectedCategory) {
          return false;
        }

        // Player count filter
        if (playerFilter === 'up_to_4') {
          return g.maxPlayers <= 4;
        }
        if (playerFilter === '5_players') {
          return g.minPlayers <= 5 && g.maxPlayers >= 5;
        }
        if (playerFilter === '6_plus') {
          return g.maxPlayers >= 6;
        }
        if (playerFilter === 'only_mine') {
          const userPref = prefMap.get(`${currentUser.id}_${g.id}`);
          return userPref?.plays === true;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'synchrony') {
          return b.synchronyScore - a.synchronyScore;
        }
        if (sortBy === 'name') {
          return a.game.name.localeCompare(b.game.name);
        }
        if (sortBy === 'max_players') {
          return b.game.maxPlayers - a.game.maxPlayers;
        }
        if (sortBy === 'my_rating') {
          const prefA = prefMap.get(`${currentUser.id}_${a.game.id}`);
          const prefB = prefMap.get(`${currentUser.id}_${b.game.id}`);
          const rA = prefA?.plays ? prefA.rating : 0;
          const rB = prefB?.plays ? prefB.rating : 0;
          return rB - rA;
        }
        return 0;
      });
  }, [gamesWithMetrics, searchQuery, selectedCategory, playerFilter, sortBy, prefMap, currentUser.id]);

  // Quick stats
  const totalMyGames = useMemo(() => {
    return games.filter((g) => {
      const p = prefMap.get(`${currentUser.id}_${g.id}`);
      return p?.plays === true;
    }).length;
  }, [games, prefMap, currentUser.id]);

  // Handle Preset Selection in Add Modal
  const handleSelectPreset = (preset: typeof PRESET_GAMES[0]) => {
    setAddName(preset.name);
    setAddCategory(preset.category);
    setAddMinPlayers(preset.minPlayers);
    setAddMaxPlayers(preset.maxPlayers);
    setAddTags(preset.tags);
    setAddDuration(preset.averageDurationMins);
    setAddCoverUrl(preset.coverUrl);
  };

  // Submit Add Game
  const handleAddGameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;

    addGame({
      name: addName.trim(),
      coverUrl:
        addCoverUrl.trim() ||
        'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
      minPlayers: Number(addMinPlayers) || 1,
      maxPlayers: Number(addMaxPlayers) || 4,
      category: addCategory.trim() || 'Coop',
      tags: addTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      averageDurationMins: Number(addDuration) || 45,
    });

    setIsAddModalOpen(false);
    showNotification(`🎮 ¡"${addName.trim()}" fue agregado al catálogo grupal!`);
  };

  // Update preference helper
  const handleTogglePlay = (gameId: string, currentPlays: boolean, currentRating: GameRating) => {
    const nextPlays = !currentPlays;
    updateGamePreference(gameId, nextPlays, currentRating || 3);
    const game = games.find((g) => g.id === gameId);
    showNotification(
      nextPlays
        ? `✅ Agregaste "${game?.name}" a tus juegos que jugás.`
        : `❌ Marcaste "${game?.name}" como 'No lo juego'. No entrará en tu ruleta.`
    );
  };

  const handleSetRating = (gameId: string, rating: GameRating) => {
    updateGamePreference(gameId, true, rating);
    const game = games.find((g) => g.id === gameId);
    showNotification(`⭐ Calificaste "${game?.name}" con ${RATING_INFO[rating].label}`);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Toast notification banner */}
      {notification && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-950/90 border border-indigo-500/40 text-indigo-200 text-xs shadow-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. HERO HEADER & QUICK STATS */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#16213c] to-[#0f172a] border border-indigo-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 -mb-24 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Gestor de Gustos y Compatibilidad</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Catálogo de Juegos y Matriz de Sincronía
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Calificá cada juego del <strong>1 al 5★</strong>. Si votás <strong>1★</strong> ('Solo si me obligan'),
              la ruleta penaliza el juego fuertemente (-15 pts) para que nadie sufra la noche de vicio.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs tracking-wide shadow-xl shadow-indigo-600/30 transition transform hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Agregar Juego al Catálogo</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-800/80">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">Total en Catálogo</span>
            <span className="text-lg font-black text-white font-mono">{games.length} juegos</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-indigo-500/30">
            <span className="text-[11px] text-indigo-300 block mb-0.5">Juegos que jugás vos</span>
            <span className="text-lg font-black text-indigo-300 font-mono">
              {totalMyGames} de {games.length}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">Jugadores en la Matriz</span>
            <span className="text-lg font-black text-white font-mono">{players.length} amigos</span>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30">
            <span className="text-[11px] text-emerald-300 block mb-0.5">Top Sincronía (&gt;80%)</span>
            <span className="text-lg font-black text-emerald-300 font-mono">
              {gamesWithMetrics.filter((m) => m.synchronyScore >= 80).length} juegos
            </span>
          </div>
        </div>
      </div>

      {/* 2. SEARCH, FILTER & SORT BAR */}
      <div className="bg-[#131c31] rounded-3xl border border-indigo-500/20 p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, categoría o etiqueta (ej: zombies, rts, coop)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#090d16] border border-slate-700/80 focus:border-indigo-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ordenar por:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#090d16] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
            >
              <option value="synchrony">Mayor Sincronía Grupal 🎯</option>
              <option value="my_rating">Mayor Calificación Propia ⭐</option>
              <option value="name">Nombre (A-Z) 🔤</option>
              <option value="max_players">Máximo de Jugadores 👥</option>
            </select>
          </div>
        </div>

        {/* Filter Chips: Player Limits & Ownership */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Cupo:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'up_to_4', label: 'Hasta 4 jug.' },
            { id: '5_players', label: '5 jugadores' },
            { id: '6_plus', label: '6+ jugadores' },
            { id: 'only_mine', label: 'Solo los que juego ⭐' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setPlayerFilter(btn.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                playerFilter === btn.id
                  ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-sm'
                  : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}

          {/* Category Chips */}
          <div className="hidden sm:flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Cat:
            </span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            {categories.slice(0, 5).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. GAME CARDS GRID */}
      {filteredGames.length === 0 ? (
        <div className="p-12 text-center bg-[#131c31]/60 rounded-3xl border border-slate-800 space-y-3">
          <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No se encontraron juegos con esos filtros</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Probá limpiar la búsqueda o agregá un juego nuevo al catálogo con el botón superior.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setPlayerFilter('all');
              setSelectedCategory('all');
            }}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition cursor-pointer"
          >
            Restablecer Filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((item) => {
            const { game, synchronyScore, averageRating, dislikeCount, playerRatings } = item;
            const userPref = prefMap.get(`${currentUser.id}_${game.id}`);
            const plays = userPref ? userPref.plays : false;
            const rating = (userPref ? userPref.rating : 3) as GameRating;

            const activeRatingHover =
              hoveredStar?.gameId === game.id ? hoveredStar.star : rating;

            return (
              <div
                key={game.id}
                className="group relative flex flex-col bg-[#131c31] rounded-3xl border border-indigo-500/20 hover:border-indigo-400/50 shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-950/40"
              >
                {/* Cover & Badges */}
                <div className="relative h-44 w-full overflow-hidden bg-slate-900">
                  <img
                    src={game.coverUrl}
                    alt={game.name}
                    className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                    onError={(e) => {
                      // Fallback cover if image fails
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#131c31] via-[#131c31]/30 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-full bg-slate-900/90 backdrop-blur-md text-[11px] font-bold text-white border border-slate-700/80 shadow">
                      {game.category}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-950/90 backdrop-blur-md text-[11px] font-bold text-indigo-300 border border-indigo-500/40 shadow flex items-center gap-1">
                      <Users className="w-3 h-3 text-indigo-400" />
                      <span>
                        {game.minPlayers}-{game.maxPlayers} jug.
                      </span>
                    </span>
                  </div>

                  <div className="absolute top-3 right-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-black font-mono shadow border backdrop-blur-md ${
                        synchronyScore >= 80
                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/50'
                          : synchronyScore >= 60
                          ? 'bg-indigo-950/90 text-indigo-300 border-indigo-500/50'
                          : 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                      }`}
                      title="Puntaje de Sincronía Grupal"
                    >
                      {synchronyScore}% Sinc.
                    </span>
                  </div>

                  {/* Duration tag at bottom right */}
                  <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[11px] text-slate-300 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-700">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>~{game.averageDurationMins} min</span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition line-clamp-1">
                      {game.name}
                    </h3>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {game.tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-slate-900 text-slate-400 text-[10px] border border-slate-800"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* CURRENT USER PREFERENCE SECTION */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/90 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300">
                        Tu Preferencia ({currentUser.displayName}):
                      </span>

                      {/* Plays toggle */}
                      <button
                        onClick={() => handleTogglePlay(game.id, plays, rating)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer border flex items-center gap-1 ${
                          plays
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {plays ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Lo tengo / Juego</span>
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3" />
                            <span>No lo juego</span>
                          </>
                        )}
                      </button>
                    </div>

                    {plays ? (
                      <div className="space-y-1.5">
                        {/* 5-Star Selector */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {([1, 2, 3, 4, 5] as GameRating[]).map((starVal) => {
                              const isActive = starVal <= activeRatingHover;
                              return (
                                <button
                                  key={starVal}
                                  type="button"
                                  onMouseEnter={() =>
                                    setHoveredStar({ gameId: game.id, star: starVal })
                                  }
                                  onMouseLeave={() => setHoveredStar(null)}
                                  onClick={() => handleSetRating(game.id, starVal)}
                                  className="p-1 transition transform hover:scale-125 cursor-pointer"
                                  title={RATING_INFO[starVal].label}
                                >
                                  <Star
                                    className={`w-4 h-4 transition ${
                                      isActive
                                        ? starVal === 1
                                          ? 'text-rose-400 fill-rose-400'
                                          : starVal <= 3
                                          ? 'text-amber-400 fill-amber-400'
                                          : 'text-indigo-400 fill-indigo-400'
                                        : 'text-slate-700 hover:text-slate-500'
                                    }`}
                                  />
                                </button>
                              );
                            })}
                          </div>

                          <span className="text-[11px] font-mono text-slate-300 font-bold">
                            {rating} de 5★
                          </span>
                        </div>

                        {/* Active Rating Description Label */}
                        <div
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-medium border ${
                            RATING_INFO[activeRatingHover].color
                          }`}
                        >
                          <span className="font-bold">
                            {RATING_INFO[activeRatingHover].label}
                          </span>
                          <span className="opacity-80 block text-[9px]">
                            {RATING_INFO[activeRatingHover].sub}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic py-1">
                        Marcado como 'No lo juego'. No sumás votos a este juego en la ruleta.
                      </div>
                    )}
                  </div>

                  {/* GROUP SYNCHRONY MATRIX */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-semibold text-slate-400">
                        Sincronía del Grupo ({averageRating}★ prom):
                      </span>
                      <span className="text-[11px] font-bold text-white font-mono">
                        {synchronyScore}%
                      </span>
                    </div>

                    {/* Score Bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                        style={{ width: `${synchronyScore}%` }}
                      />
                    </div>

                    {/* Friends' Avatars Row with Star Rating Pill */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center -space-x-1.5 overflow-hidden">
                        {playerRatings.map(({ player, plays: pPlays, rating: pRating }) => (
                          <div
                            key={player.id}
                            className="relative group cursor-pointer"
                            title={`${player.displayName}: ${pPlays ? `${pRating}★` : '❌ No juega'}`}
                          >
                            <img
                              src={player.avatarUrl}
                              alt={player.displayName}
                              className={`w-6 h-6 rounded-full border-2 border-slate-900 object-cover ${
                                !pPlays ? 'grayscale opacity-50' : ''
                              }`}
                            />
                            {pPlays ? (
                              <span
                                className={`absolute -bottom-1 -right-1 text-[8px] font-extrabold px-1 rounded-full ${
                                  pRating === 1
                                    ? 'bg-rose-500 text-white'
                                    : pRating >= 4
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-amber-500 text-slate-950'
                                }`}
                              >
                                {pRating}★
                              </span>
                            ) : (
                              <span className="absolute -bottom-1 -right-1 text-[8px] bg-slate-700 text-white px-0.5 rounded-full">
                                ✕
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      <span className="text-[10px] text-slate-400">
                        {item.playsCount}/{item.totalPlayers} lo juegan
                      </span>
                    </div>

                    {/* Dislike penalty indicator */}
                    {dislikeCount > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-rose-300 bg-rose-950/30 px-2 py-0.5 rounded-lg border border-rose-500/20">
                        <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                        <span>{dislikeCount} jugador votó 1★ (penalizado)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MODAL: AGREGAR JUEGO AL CATÁLOGO CON PRESETS */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#131c31] w-full max-w-2xl rounded-3xl border border-indigo-500/40 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-bold text-white">Agregar Juego al Catálogo</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick 1-Click Presets Strip */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>Presets Rápidos (Hacé clic para autocompletar):</span>
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-slate-900/60 rounded-2xl border border-slate-800">
                {PRESET_GAMES.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600/30 hover:border-indigo-400 border border-slate-700 text-[11px] font-semibold text-slate-200 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🎮</span>
                    <span>{preset.name}</span>
                    <span className="text-[10px] text-slate-400">
                      ({preset.minPlayers}-{preset.maxPlayers})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Form */}
            <form onSubmit={handleAddGameSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nombre del Juego:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Left 4 Dead 2"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Categoría:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Coop Zombie, Survival, RTS"
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value)}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  URL de Portada (Imagen):
                </label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/photo-..."
                  value={addCoverUrl}
                  onChange={(e) => setAddCoverUrl(e.target.value)}
                  className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mín. Jugadores:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    required
                    value={addMinPlayers}
                    onChange={(e) => setAddMinPlayers(Number(e.target.value))}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Máx. Jugadores:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={64}
                    required
                    value={addMaxPlayers}
                    onChange={(e) => setAddMaxPlayers(Number(e.target.value))}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Duración (min):
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={360}
                    value={addDuration}
                    onChange={(e) => setAddDuration(Number(e.target.value))}
                    className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Etiquetas (separadas por comas):
                </label>
                <input
                  type="text"
                  placeholder="coop, zombies, risas, supervivencia"
                  value={addTags}
                  onChange={(e) => setAddTags(e.target.value)}
                  className="w-full bg-[#090d16] border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none transition"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  Guardar Juego en el Catálogo 🚀
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default GamesCatalogView;
