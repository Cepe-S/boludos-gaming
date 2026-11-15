import React from 'react';
import {
  ExternalGamePlatform,
  Game,
  GameRating,
  PlayerProfile,
  UnifiedSelectorGame,
} from '@/types/domain';

export type CatalogPlayerFilter =
  | 'all'
  | 'up_to_4'
  | '5_players'
  | '6_plus'
  | 'only_mine';

export type CatalogSortBy =
  | 'likelihood'
  | 'synchrony'
  | 'name'
  | 'max_players'
  | 'my_rating';

export type SelectorFilterTab =
  | 'all'
  | 'active'
  | 'discover'
  | 'mp'
  | 'sp'
  | 'steam';

export interface ActivePodiumPickerState {
  type: 'mp' | 'sp';
  rank: 1 | 2 | 3;
}

export interface GameGroupMetrics {
  game: Game;
  playsCount: number;
  totalPlayers: number;
  averageRating: number;
  synchronyScore: number;
  dislikeCount: number;
  playerRatings: Array<{
    player: PlayerProfile;
    plays: boolean;
    rating: GameRating;
  }>;
}

export const FALLBACK_GAME_COVER =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80';

export const EXTERNAL_PLATFORMS: ExternalGamePlatform[] = [
  'Steam (Otra cuenta / Verde)',
  'Riot Games',
  'Epic Games',
  'Battle.net',
  'EA App',
  'Xbox Game Pass',
  'Otro Launcher',
];

export const PLAYER_FILTER_OPTIONS: Array<{
  id: CatalogPlayerFilter;
  label: string;
}> = [
  { id: 'all', label: 'Todos' },
  { id: 'up_to_4', label: 'Hasta 4 jug.' },
  { id: '5_players', label: '5 jugadores' },
  { id: '6_plus', label: '6+ jugadores' },
  { id: 'only_mine', label: 'Solo los que juego' },
];

export const PRESET_GAMES = [
  {
    name: 'Left 4 Dead 2',
    description:
      'Campaña cooperativa clásica de supervivencia contra hordas masivas de infectados y tanques.',
    category: 'Co-op Acción',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'zombies, coop, campaña, supervivencia',
    averageDurationMins: 45,
    coverUrl:
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Minecraft',
    description:
      'Mundo abierto infinito para craftear bases, explorar cuevas o armar servidores comunitarios.',
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
    description:
      'Cooperativo de plataformas encadenados donde una mala caída arrastra a todo el grupo al fondo.',
    category: 'Party Casual',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'coop, caidas, risas, infierno, parkour',
    averageDurationMins: 60,
    coverUrl:
      'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'PUBG: BATTLEGROUNDS',
    description:
      'Battle Royale táctico de escuadrones con loot, vehículos y tiroteos tensos hasta el último círculo.',
    category: 'Shooter Táctico',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'battleroyale, shooter, squads, tactico',
    averageDurationMins: 35,
    coverUrl:
      'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Rust',
    description:
      'Supervivencia hardcore en servidores hostiles: construí bases, organizá incursiones y cuidá tus recursos.',
    category: 'Survival Sandbox',
    minPlayers: 1,
    maxPlayers: 16,
    tags: 'survival, pvp, raids, bases, toxico',
    averageDurationMins: 120,
    coverUrl:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'EA Sports FC 25',
    description:
      'Fútbol rápido, clubes pro con amigos y torneos cortos con rivalidad garantizada.',
    category: 'Deportes / Autos',
    minPlayers: 1,
    maxPlayers: 22,
    tags: 'futbol, clubes pro, amigos, fulbito',
    averageDurationMins: 25,
    coverUrl:
      'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Lethal Company',
    description:
      'Terror y extracción cooperativa con chat de proximidad en lunas industriales abandonadas.',
    category: 'Co-op Horror',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'terror, risas, scrap, monstruos, voz de proximidad',
    averageDurationMins: 45,
    coverUrl:
      'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Age of Empires II: DE',
    description:
      'Estrategia en tiempo real competitiva o en equipo: castillos, asedios y batallas de imperios.',
    category: 'RTS',
    minPlayers: 1,
    maxPlayers: 8,
    tags: 'rts, medieval, estrategia, aldeanos, wololo',
    averageDurationMins: 60,
    coverUrl:
      'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Valorant',
    description:
      'Shooter táctico 5v5 por rondas con armas precisas, roles de agentes y utilidades coordinadas.',
    category: 'Shooter Táctico',
    minPlayers: 1,
    maxPlayers: 5,
    tags: 'tactical fps, 5v5, competitivo, vandal, poderes',
    averageDurationMins: 40,
    coverUrl:
      'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
  },
  {
    name: 'Helldivers 2',
    description:
      'Cooperativo frenético de disparos en tercera persona combatiendo termínidos y autómatas por la galaxia.',
    category: 'Co-op Acción',
    minPlayers: 1,
    maxPlayers: 4,
    tags: 'coop, disparos, democracia, bichos, mechs',
    averageDurationMins: 40,
    coverUrl:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
  },
];

export const RATING_INFO: Record<
  GameRating,
  { label: string; sub: string; colorClass: string }
> = {
  1: {
    label: '1★ Solo si obligan',
    sub: 'Penaliza -15 pts',
    colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/35',
  },
  2: {
    label: '2★ Zafa',
    sub: 'Tolerable si no hay otro',
    colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/35',
  },
  3: {
    label: '3★ Me copa',
    sub: 'Buena opción',
    colorClass: 'text-sky-400 bg-sky-500/10 border-sky-500/35',
  },
  4: {
    label: '4★ Juegazo',
    sub: 'Prioridad alta',
    colorClass: 'text-[#99A5FF] bg-primary/15 border-primary/40',
  },
  5: {
    label: '5★ Vicio Total',
    sub: 'Peso máx. ruleta',
    colorClass: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/40',
  },
};

export function getSafeCoverUrl(url?: string): string {
  const trimmed = url?.trim();
  return trimmed ? trimmed : FALLBACK_GAME_COVER;
}

export function handleImageFallback(
  e: React.SyntheticEvent<HTMLImageElement>
): void {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.src = FALLBACK_GAME_COVER;
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0';
  if (hours >= 10) return String(Math.round(hours));
  return String(Math.round(hours * 10) / 10);
}

export function isValidSteamProfileInput(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^\d{17}$/.test(trimmed)) return true;
  if (
    /^(https?:\/\/)?(www\.)?steamcommunity\.com\/(id|profiles)\/[a-zA-Z0-9._-]{2,}\/?(\?.*)?$/i.test(
      trimmed
    )
  ) {
    return true;
  }
  return false;
}

export function getPlatformBadgeClass(game: UnifiedSelectorGame): string {
  if (game.ownedOnSteam || game.platform === 'Steam') {
    return 'bg-sky-500/15 border-sky-500/40 text-sky-300';
  }
  if (game.platform === 'Riot Games') {
    return 'bg-rose-500/15 border-rose-500/40 text-rose-300';
  }
  if (game.platform === 'Epic Games') {
    return 'bg-[#181C24] border-border text-foreground';
  }
  if (game.platform === 'Battle.net') {
    return 'bg-blue-500/15 border-blue-500/40 text-blue-300';
  }
  if (game.platform === 'Xbox Game Pass') {
    return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
  }
  if (game.platform.includes('IGDB')) {
    return 'bg-purple-500/15 border-purple-500/40 text-purple-300';
  }
  return 'bg-primary/15 border-primary/40 text-[#99A5FF]';
}

export function getUserFriendlyGameBadge(game: UnifiedSelectorGame): string {
  if (game.likelihoodBadge.includes('% afín')) {
    if (game.ownedOnSteam && game.playtimeHours > 0) {
      return `⏱️ ${formatHours(game.playtimeHours)}h Steam`;
    }
    if (game.inClubCatalog) return '📚 En el Club';
    return `🌐 ${game.platform}`;
  }
  return game.likelihoodBadge;
}
