import {
  ExternalGamePlatform,
  Game,
  GameRating,
  GroupGameRecommendation,
  PlayerAffinityBreakdown,
  PlayerProfile,
  PlayerTasteProfile,
  PodiumGameEntry,
  SteamOwnedGame,
  TasteDimensionKey,
  UnifiedSelectorGame,
  UnifiedSelectorSource,
  UserGamePreference,
} from '../types/domain';
import { computePlayerPvj6dProfile } from './playerCategorizationEngine';

// ============================================================================
// 1. TASTE DIMENSIONS DEFINITION (32 Rigorous Dimensions)
// ============================================================================

export interface TasteDimensionInfo {
  key: TasteDimensionKey;
  label: string;
  group: 'genre' | 'pace' | 'social' | 'aesthetic';
  description?: string;
}

export const TASTE_DIMENSIONS: Array<{
  key: TasteDimensionKey;
  label: string;
  group: 'genre' | 'pace' | 'social' | 'aesthetic';
}> = [
  // --- 1. Genre Dimensions (12) ---
  { key: 'tactical_shooter', label: 'Shooter Táctico', group: 'genre' },
  { key: 'arena_hero_shooter', label: 'Hero / Arena Shooter', group: 'genre' },
  { key: 'battle_royale', label: 'Battle Royale', group: 'genre' },
  { key: 'moba', label: 'MOBA', group: 'genre' },
  { key: 'rts_strategy', label: 'Estrategia RTS', group: 'genre' },
  { key: 'survival_craft', label: 'Survival & Crafteo', group: 'genre' },
  { key: 'coop_horror', label: 'Terror Co-op', group: 'genre' },
  { key: 'coop_pve_action', label: 'Acción PvE Co-op', group: 'genre' },
  { key: 'rpg_narrative', label: 'RPG & Narrativa', group: 'genre' },
  { key: 'party_social', label: 'Party & Risas', group: 'genre' },
  { key: 'sports_racing', label: 'Deportes & Racing', group: 'genre' },
  { key: 'roguelike_deckbuilder', label: 'Roguelike & Cartas', group: 'genre' },

  // --- 2. Pace / Intensity Dimensions (6) ---
  { key: 'intensity_high', label: 'Alta Intensidad', group: 'pace' },
  { key: 'chill_relaxed', label: 'Relajado / Chill', group: 'pace' },
  { key: 'tactical_depth', label: 'Profundidad Táctica', group: 'pace' },
  { key: 'mechanical_skill', label: 'Habilidad Mecánica', group: 'pace' },
  { key: 'short_session', label: 'Partidas Cortas', group: 'pace' },
  { key: 'long_campaign', label: 'Campañas Largas', group: 'pace' },

  // --- 3. Social & Group Dynamics (6) ---
  { key: 'pvp_competitive', label: 'PvP Competitivo', group: 'social' },
  { key: 'pve_cooperative', label: 'PvE Cooperativo', group: 'social' },
  { key: 'social_deduction_chaos', label: 'Caos & Deducción Social', group: 'social' },
  { key: 'squad_coordination', label: 'Coordinación de Escuadra', group: 'social' },
  { key: 'asymmetric_roles', label: 'Roles Asimétricos', group: 'social' },
  { key: 'sandbox_freedom', label: 'Libertad Sandbox', group: 'social' },

  // --- 4. Aesthetic / Vibe Dimensions (8) ---
  { key: 'dark_gritty', label: 'Atmósfera Oscura', group: 'aesthetic' },
  { key: 'scifi_futuristic', label: 'Sci-Fi Futurista', group: 'aesthetic' },
  { key: 'fantasy_medieval', label: 'Fantasía Medieval', group: 'aesthetic' },
  { key: 'realistic_military', label: 'Realismo Militar', group: 'aesthetic' },
  { key: 'stylized_colorful', label: 'Estilizado / Colorido', group: 'aesthetic' },
  { key: 'horror_tension', label: 'Tensión & Terror', group: 'aesthetic' },
  { key: 'open_world_exploration', label: 'Exploración Mundo Abierto', group: 'aesthetic' },
  { key: 'progression_loot', label: 'Progresión & Loot', group: 'aesthetic' },
];

export const TASTE_DIMENSION_MAP = new Map<TasteDimensionKey, { label: string; group: 'genre' | 'pace' | 'social' | 'aesthetic' }>(
  TASTE_DIMENSIONS.map(d => [d.key, { label: d.label, group: d.group }])
);

export function getDimensionLabel(key: TasteDimensionKey): string {
  return TASTE_DIMENSION_MAP.get(key)?.label ?? key;
}

// Category to dimensions mapping for categoryPreferences feedback
const CATEGORY_TO_DIMENSIONS_MAP: Record<string, TasteDimensionKey[]> = {
  'Shooter Táctico': ['tactical_shooter', 'pvp_competitive', 'tactical_depth', 'realistic_military'],
  'MOBA': ['moba', 'pvp_competitive', 'tactical_depth', 'asymmetric_roles'],
  'Co-op Horror': ['coop_horror', 'horror_tension', 'pve_cooperative', 'dark_gritty'],
  'Co-op Acción': ['coop_pve_action', 'intensity_high', 'pve_cooperative', 'squad_coordination'],
  'Survival Sandbox': ['survival_craft', 'sandbox_freedom', 'open_world_exploration', 'progression_loot'],
  'RTS': ['rts_strategy', 'tactical_depth', 'squad_coordination'],
  'Party Casual': ['party_social', 'chill_relaxed', 'social_deduction_chaos', 'short_session'],
  'Deportes / Autos': ['sports_racing', 'short_session', 'mechanical_skill'],
  'RPG / Aventura': ['rpg_narrative', 'long_campaign', 'fantasy_medieval', 'progression_loot'],
};

// ============================================================================
// 2. KNOWLEDGE BASE TYPES & GLOBAL GAMES KNOWLEDGE BASE (>= 75 PC Games)
// ============================================================================

export interface KnowledgeGameEntry {
  id: string;
  steamAppId?: number;
  name: string;
  description: string;
  category: string;
  coverUrl: string;
  tags: string[];
  genres: string[];
  minPlayers: number;
  maxPlayers: number;
  isMultiplayer: boolean;
  platform?: ExternalGamePlatform;
  weights: Partial<Record<TasteDimensionKey, number>>;
}

const steamHeaderUrl = (appId: number): string =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

export const GLOBAL_GAMES_KNOWLEDGE_BASE: KnowledgeGameEntry[] = [
  // --------------------------------------------------------------------------
  // STEAM MULTIPLAYER TITLES (>= 3 Players) - 54 Games
  // --------------------------------------------------------------------------
  {
    id: 'kb-cs2',
    steamAppId: 730,
    name: 'Counter-Strike 2',
    description: 'Shooter táctico 5v5 por rondas de alta exigencia mecánica y lectura de juego.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(730),
    tags: ['FPS', 'Competitivo', 'Táctico', 'Esports'],
    genres: ['Action', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 10,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 0.9,
      tactical_depth: 0.85,
      mechanical_skill: 0.95,
      short_session: 0.6,
      pvp_competitive: 1.0,
      squad_coordination: 0.9,
      realistic_military: 0.7,
    },
  },
  {
    id: 'kb-dota2',
    steamAppId: 570,
    name: 'Dota 2',
    description: 'MOBA por excelencia con inmensa profundidad estratégica, roles dinámicos y partidas tensas.',
    category: 'MOBA',
    coverUrl: steamHeaderUrl(570),
    tags: ['MOBA', 'Estrategia', 'Competitivo', 'Esports'],
    genres: ['Action', 'Strategy', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 10,
    isMultiplayer: true,
    weights: {
      moba: 1.0,
      intensity_high: 0.8,
      tactical_depth: 1.0,
      mechanical_skill: 0.9,
      pvp_competitive: 1.0,
      squad_coordination: 0.95,
      asymmetric_roles: 1.0,
      fantasy_medieval: 0.7,
    },
  },
  {
    id: 'kb-pubg',
    steamAppId: 578080,
    name: 'PUBG: BATTLEGROUNDS',
    description: 'El pionero del Battle Royale táctico realista a gran escala.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(578080),
    tags: ['Battle Royale', 'FPS', 'Táctico', 'Supervivencia'],
    genres: ['Action', 'Adventure', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      battle_royale: 1.0,
      tactical_shooter: 0.85,
      intensity_high: 0.85,
      tactical_depth: 0.75,
      pvp_competitive: 0.95,
      squad_coordination: 0.9,
      realistic_military: 0.85,
      open_world_exploration: 0.65,
    },
  },
  {
    id: 'kb-rust',
    steamAppId: 252490,
    name: 'Rust',
    description: 'Supervivencia sandbox implacable con PvP despiadado, bases gigantes y raids masivos.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(252490),
    tags: ['Supervivencia', 'Crafteo', 'PvP', 'Mundo Abierto'],
    genres: ['Action', 'Adventure', 'Indie', 'RPG'],
    minPlayers: 1,
    maxPlayers: 100,
    isMultiplayer: true,
    weights: {
      survival_craft: 1.0,
      intensity_high: 0.9,
      pvp_competitive: 0.95,
      squad_coordination: 0.85,
      sandbox_freedom: 0.95,
      open_world_exploration: 0.9,
      progression_loot: 0.9,
      dark_gritty: 0.8,
    },
  },
  {
    id: 'kb-helldivers2',
    steamAppId: 553850,
    name: 'Helldivers 2',
    description: 'Repartir democracia galáctica en escuadra de a 4 contra hordas de bichos y autómatas.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(553850),
    tags: ['Co-op', 'Tercera Persona', 'Sci-Fi', 'Caos'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      tactical_shooter: 0.7,
      intensity_high: 0.9,
      tactical_depth: 0.65,
      pve_cooperative: 1.0,
      squad_coordination: 0.95,
      scifi_futuristic: 0.9,
      progression_loot: 0.7,
    },
  },
  {
    id: 'kb-lethal-company',
    steamAppId: 1966720,
    name: 'Lethal Company',
    description: 'Terror cooperativo caótico, comedia involuntaria y recolección de chatarra espacial con chat de proximidad.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(1966720),
    tags: ['Co-op Horror', 'Comedia', 'Chat Proximidad', 'Indie'],
    genres: ['Action', 'Indie'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_horror: 1.0,
      horror_tension: 0.9,
      social_deduction_chaos: 0.85,
      pve_cooperative: 0.95,
      squad_coordination: 0.8,
      scifi_futuristic: 0.6,
      dark_gritty: 0.75,
      short_session: 0.7,
    },
  },
  {
    id: 'kb-aoe2de',
    steamAppId: 813780,
    name: 'Age of Empires II: DE',
    description: 'El clásico atemporal de estrategia en tiempo real con macrogestión, imperios y asedios.',
    category: 'RTS',
    coverUrl: steamHeaderUrl(813780),
    tags: ['RTS', 'Estrategia', 'Histórico', 'Multijugador'],
    genres: ['Strategy'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      rts_strategy: 1.0,
      tactical_depth: 0.95,
      mechanical_skill: 0.85,
      pvp_competitive: 0.9,
      squad_coordination: 0.8,
      fantasy_medieval: 0.9,
    },
  },
  {
    id: 'kb-bg3',
    steamAppId: 1086940,
    name: "Baldur's Gate 3",
    description: 'Obra maestra de rol por turnos, libertad infinita y campaña cooperativa inolvidable.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1086940),
    tags: ['RPG', 'Por Turnos', 'Historia', 'Fantasía'],
    genres: ['Adventure', 'RPG', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      rpg_narrative: 1.0,
      tactical_depth: 0.9,
      long_campaign: 1.0,
      pve_cooperative: 0.9,
      squad_coordination: 0.85,
      fantasy_medieval: 1.0,
      open_world_exploration: 0.95,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-project-zomboid',
    steamAppId: 108600,
    name: 'Project Zomboid',
    description: 'Simulador sandbox hardcore de apocalipsis zombie en Kentucky con supervivencia meticulosa.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(108600),
    tags: ['Zombies', 'Supervivencia', 'Sandbox', 'Hardcore'],
    genres: ['Indie', 'RPG', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 32,
    isMultiplayer: true,
    weights: {
      survival_craft: 1.0,
      coop_horror: 0.75,
      intensity_high: 0.8,
      tactical_depth: 0.9,
      pve_cooperative: 0.9,
      sandbox_freedom: 1.0,
      dark_gritty: 0.95,
      horror_tension: 0.85,
      open_world_exploration: 0.9,
    },
  },
  {
    id: 'kb-l4d2',
    steamAppId: 550,
    name: 'Left 4 Dead 2',
    description: 'Acción PvE cooperativa legendaria contra oleadas de infectados y mutantes en escuadra de a 4.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(550),
    tags: ['Co-op', 'Zombies', 'FPS', 'Acción'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      coop_horror: 0.75,
      intensity_high: 0.9,
      mechanical_skill: 0.75,
      short_session: 0.7,
      pve_cooperative: 1.0,
      squad_coordination: 0.9,
      dark_gritty: 0.8,
    },
  },
  {
    id: 'kb-apex',
    steamAppId: 1172470,
    name: 'Apex Legends',
    description: 'Battle Royale frenético con héroes, habilidades únicas y desplazamiento fluido a alta velocidad.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(1172470),
    tags: ['Battle Royale', 'Hero Shooter', 'FPS', 'Rápido'],
    genres: ['Action', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 3,
    isMultiplayer: true,
    weights: {
      battle_royale: 1.0,
      arena_hero_shooter: 0.85,
      intensity_high: 0.95,
      mechanical_skill: 0.95,
      pvp_competitive: 1.0,
      squad_coordination: 0.9,
      scifi_futuristic: 0.8,
      stylized_colorful: 0.6,
    },
  },
  {
    id: 'kb-r6-siege',
    steamAppId: 359550,
    name: 'Tom Clancy\'s Rainbow Six Siege',
    description: 'Shooter táctico en interiores con destrucción de paredes, drones y operadores especializados.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(359550),
    tags: ['FPS', 'Táctico', 'Competitivo', 'Militar'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 10,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 0.9,
      tactical_depth: 0.95,
      mechanical_skill: 0.9,
      pvp_competitive: 1.0,
      squad_coordination: 0.95,
      realistic_military: 0.9,
      asymmetric_roles: 0.85,
    },
  },
  {
    id: 'kb-drg',
    steamAppId: 548430,
    name: 'Deep Rock Galactic',
    description: 'Enanos espaciales mineros en cuevas generadas proceduralmente, cervezas y hordas de alienígenas.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(548430),
    tags: ['Co-op', 'FPS', 'Minería', 'Enanos'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      intensity_high: 0.85,
      pve_cooperative: 1.0,
      squad_coordination: 0.95,
      scifi_futuristic: 0.8,
      asymmetric_roles: 0.9,
      progression_loot: 0.8,
    },
  },
  {
    id: 'kb-valheim',
    steamAppId: 892970,
    name: 'Valheim',
    description: 'Supervivencia y exploración vikinga en un purgatorio procedural con construcción y jefes épicos.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(892970),
    tags: ['Supervivencia', 'Vikingos', 'Construcción', 'Mundo Abierto'],
    genres: ['Action', 'Adventure', 'Indie', 'RPG'],
    minPlayers: 1,
    maxPlayers: 10,
    isMultiplayer: true,
    weights: {
      survival_craft: 1.0,
      chill_relaxed: 0.6,
      pve_cooperative: 0.95,
      squad_coordination: 0.8,
      sandbox_freedom: 0.9,
      fantasy_medieval: 0.95,
      open_world_exploration: 1.0,
      progression_loot: 0.85,
    },
  },
  {
    id: 'kb-terraria',
    steamAppId: 105600,
    name: 'Terraria',
    description: 'Aventura 2D legendaria con crafteo, minería, cientos de armas y decenas de jefes colosales.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(105600),
    tags: ['Sandbox', 'Supervivencia', '2D', 'Aventura'],
    genres: ['Action', 'Adventure', 'Indie', 'RPG'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      survival_craft: 0.9,
      chill_relaxed: 0.7,
      pve_cooperative: 0.9,
      sandbox_freedom: 0.95,
      fantasy_medieval: 0.7,
      stylized_colorful: 0.85,
      progression_loot: 1.0,
      open_world_exploration: 0.9,
    },
  },
  {
    id: 'kb-stardew',
    steamAppId: 413150,
    name: 'Stardew Valley',
    description: 'La granja relajante por excelencia: pesca, cultivos, minería y vida campestre con amigos.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(413150),
    tags: ['Granja', 'Relajante', 'Pixel Art', 'Co-op'],
    genres: ['Indie', 'RPG', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      chill_relaxed: 1.0,
      pve_cooperative: 0.85,
      sandbox_freedom: 0.8,
      stylized_colorful: 0.9,
      progression_loot: 0.75,
      short_session: 0.65,
    },
  },
  {
    id: 'kb-amongus',
    steamAppId: 945360,
    name: 'Among Us',
    description: 'Deducción social, mentiras, sabotajes y discusiones acaloradas en la nave espacial.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(945360),
    tags: ['Party', 'Deducción Social', 'Casual', 'Engaño'],
    genres: ['Casual'],
    minPlayers: 4,
    maxPlayers: 15,
    isMultiplayer: true,
    weights: {
      party_social: 1.0,
      short_session: 0.9,
      social_deduction_chaos: 1.0,
      stylized_colorful: 0.8,
      asymmetric_roles: 0.8,
    },
  },
  {
    id: 'kb-phasmophobia',
    steamAppId: 739630,
    name: 'Phasmophobia',
    description: 'Investigación paranormal cooperativa en casas oscuras hablando por radio con fantasmas.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(739630),
    tags: ['Terror', 'Fantasmas', 'Investigación', 'Co-op'],
    genres: ['Action', 'Indie'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_horror: 1.0,
      horror_tension: 0.95,
      tactical_depth: 0.7,
      pve_cooperative: 0.95,
      squad_coordination: 0.9,
      dark_gritty: 0.85,
      short_session: 0.7,
    },
  },
  {
    id: 'kb-sot',
    steamAppId: 1172620,
    name: 'Sea of Thieves',
    description: 'Vida pirata en mundo abierto: tripular galeones, disparar cañones y buscar tesoros.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(1172620),
    tags: ['Piratas', 'Mundo Abierto', 'Multijugador', 'Aventura'],
    genres: ['Action', 'Adventure'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 0.85,
      pvp_competitive: 0.7,
      pve_cooperative: 0.9,
      squad_coordination: 0.95,
      sandbox_freedom: 0.9,
      stylized_colorful: 0.8,
      open_world_exploration: 1.0,
    },
  },
  {
    id: 'kb-dbd',
    steamAppId: 381210,
    name: 'Dead by Daylight',
    description: 'Terror asimétrico 4v1 donde cuatro supervivientes intentan escapar de un asesino implacable.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(381210),
    tags: ['Terror Asimétrico', 'Supervivencia', 'Multijugador', 'PvP'],
    genres: ['Action'],
    minPlayers: 2,
    maxPlayers: 5,
    isMultiplayer: true,
    weights: {
      coop_horror: 0.9,
      horror_tension: 0.9,
      intensity_high: 0.85,
      pvp_competitive: 0.95,
      asymmetric_roles: 1.0,
      dark_gritty: 0.9,
      short_session: 0.65,
    },
  },
  {
    id: 'kb-payday2',
    steamAppId: 218620,
    name: 'Payday 2',
    description: 'Atraco a bancos y joyería en escuadra de a 4 con sigilo o tiroteos frenéticos contra la policía.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(218620),
    tags: ['Atracos', 'Co-op', 'FPS', 'Sigilo'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      tactical_shooter: 0.75,
      intensity_high: 0.85,
      squad_coordination: 0.9,
      pve_cooperative: 1.0,
      progression_loot: 0.85,
    },
  },
  {
    id: 'kb-hunt',
    steamAppId: 594650,
    name: 'Hunt: Showdown 1896',
    description: 'PvPvE táctico en pantanos decimonónicos con monstruos grotescos y tiroteos de alta tensión.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(594650),
    tags: ['PvPvE', 'FPS', 'Terror', 'Táctico'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 3,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 0.95,
      coop_horror: 0.8,
      horror_tension: 0.9,
      intensity_high: 0.9,
      tactical_depth: 0.9,
      pvp_competitive: 0.95,
      dark_gritty: 0.95,
      realistic_military: 0.7,
    },
  },
  {
    id: 'kb-warframe',
    steamAppId: 230410,
    name: 'Warframe',
    description: 'Ninjas espaciales hiperveloces con combate fluido, parkour y cientos de armas para grindear.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(230410),
    tags: ['Sci-Fi', 'Loot', 'Tercera Persona', 'F2P'],
    genres: ['Action', 'Free to Play', 'RPG'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      intensity_high: 0.9,
      mechanical_skill: 0.8,
      pve_cooperative: 0.95,
      scifi_futuristic: 1.0,
      progression_loot: 1.0,
    },
  },
  {
    id: 'kb-destiny2',
    steamAppId: 1085660,
    name: 'Destiny 2',
    description: 'Shooter MMO espacial con raids de coordinación extrema, asaltos y progresión de equipamiento exótico.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(1085660),
    tags: ['Looter Shooter', 'FPS', 'MMO', 'Raids'],
    genres: ['Action', 'Adventure', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 6,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      tactical_shooter: 0.75,
      intensity_high: 0.85,
      pve_cooperative: 0.95,
      squad_coordination: 0.95,
      scifi_futuristic: 0.95,
      progression_loot: 0.95,
    },
  },
  {
    id: 'kb-tf2',
    steamAppId: 440,
    name: 'Team Fortress 2',
    description: 'El clásico pionero de los hero shooters: 9 clases icónicas, gorros y partidas desquiciadas.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(440),
    tags: ['Hero Shooter', 'FPS', 'Comedia', 'Clásico'],
    genres: ['Action', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 24,
    isMultiplayer: true,
    weights: {
      arena_hero_shooter: 1.0,
      intensity_high: 0.85,
      mechanical_skill: 0.85,
      pvp_competitive: 0.85,
      stylized_colorful: 0.9,
      asymmetric_roles: 0.95,
      short_session: 0.75,
    },
  },
  {
    id: 'kb-gmod',
    steamAppId: 4000,
    name: "Garry's Mod",
    description: 'Caja de arena definitiva del motor Source: Trouble in Terrorist Town, Prop Hunt y físicas locas.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(4000),
    tags: ['Sandbox', 'Mods', 'Party', 'Física'],
    genres: ['Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 32,
    isMultiplayer: true,
    weights: {
      party_social: 0.9,
      sandbox_freedom: 1.0,
      social_deduction_chaos: 0.95,
      stylized_colorful: 0.6,
    },
  },
  {
    id: 'kb-chained-together',
    steamAppId: 2567870,
    name: 'Chained Together',
    description: 'Escapar del infierno encadenados de a cuatro con saltos de plataformas y traición inevitable.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(2567870),
    tags: ['Plataformas', 'Física', 'Co-op', 'Caos'],
    genres: ['Action', 'Adventure', 'Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 0.85,
      party_social: 0.9,
      intensity_high: 0.8,
      social_deduction_chaos: 0.85,
      pve_cooperative: 0.9,
      squad_coordination: 0.95,
    },
  },
  {
    id: 'kb-peak',
    steamAppId: 3527290,
    name: 'Peak',
    description: 'Cooperación física intensa donde cada error arrastra al equipo entero al vacío.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(2567870),
    tags: ['Co-op', 'Física', 'Aventura', 'Risas'],
    genres: ['Action', 'Casual'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 0.85,
      party_social: 0.9,
      intensity_high: 0.75,
      social_deduction_chaos: 0.85,
      pve_cooperative: 0.9,
    },
  },
  {
    id: 'kb-repo',
    steamAppId: 3241660,
    name: 'R.E.P.O.',
    description: 'Extracción táctica cooperativa en instalaciones abandonadas con peligros biológicos extremos.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(3241660),
    tags: ['Terror', 'Extracción', 'Co-op', 'Táctico'],
    genres: ['Action', 'Indie'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_horror: 0.95,
      horror_tension: 0.9,
      intensity_high: 0.85,
      pve_cooperative: 0.95,
      squad_coordination: 0.9,
      dark_gritty: 0.9,
    },
  },
  {
    id: 'kb-content-warning',
    steamAppId: 2881650,
    name: 'Content Warning',
    description: 'Bajar al Viejo Mundo a filmar monstruos terroríficos para volverse viral en SpookTube.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(2881650),
    tags: ['Co-op', 'Terror', 'Comedia', 'Monstruos'],
    genres: ['Action', 'Indie'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_horror: 0.9,
      party_social: 0.95,
      horror_tension: 0.75,
      social_deduction_chaos: 0.9,
      pve_cooperative: 0.95,
      squad_coordination: 0.85,
      stylized_colorful: 0.75,
    },
  },
  {
    id: 'kb-factorio',
    steamAppId: 427520,
    name: 'Factorio',
    description: 'Automatización industrial masiva, logística de cintas transportadoras y trenes contra alienígenas.',
    category: 'RTS',
    coverUrl: steamHeaderUrl(427520),
    tags: ['Automatización', 'Construcción', 'Logística', 'Gestión'],
    genres: ['Casual', 'Indie', 'Simulation', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 16,
    isMultiplayer: true,
    weights: {
      rts_strategy: 0.85,
      tactical_depth: 1.0,
      chill_relaxed: 0.7,
      pve_cooperative: 0.95,
      sandbox_freedom: 0.95,
      scifi_futuristic: 0.85,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-satisfactory',
    steamAppId: 526870,
    name: 'Satisfactory',
    description: 'Construcción de fábricas colosales en primera persona en un planeta alienígena paradisíaco.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(526870),
    tags: ['Automatización', 'Construcción', 'Primera Persona', 'Sci-Fi'],
    genres: ['Adventure', 'Indie', 'Simulation', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      survival_craft: 0.9,
      chill_relaxed: 0.75,
      tactical_depth: 0.85,
      pve_cooperative: 0.95,
      sandbox_freedom: 0.95,
      scifi_futuristic: 0.9,
      open_world_exploration: 0.9,
    },
  },
  {
    id: 'kb-vrising',
    steamAppId: 1604030,
    name: 'V Rising',
    description: 'Supervivencia vampírica ARPG: construir castillos góticos y cazar jefes evitando la luz solar.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(1604030),
    tags: ['Vampiros', 'Supervivencia', 'ARPG', 'Castillos'],
    genres: ['Action', 'Adventure', 'Indie', 'RPG', 'Massively Multiplayer'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      survival_craft: 0.95,
      rpg_narrative: 0.7,
      intensity_high: 0.85,
      pvp_competitive: 0.7,
      pve_cooperative: 0.95,
      dark_gritty: 0.9,
      fantasy_medieval: 0.9,
      progression_loot: 0.95,
    },
  },
  {
    id: 'kb-enshrouded',
    steamAppId: 1203620,
    name: 'Enshrouded',
    description: 'Supervivencia y rol en mundo voxel con construcción libre, niebla letal y exploración de ruinas.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(1203620),
    tags: ['Supervivencia', 'Voxel', 'RPG', 'Mundo Abierto'],
    genres: ['Action', 'Adventure', 'RPG'],
    minPlayers: 1,
    maxPlayers: 16,
    isMultiplayer: true,
    weights: {
      survival_craft: 0.95,
      rpg_narrative: 0.75,
      pve_cooperative: 0.95,
      fantasy_medieval: 0.95,
      open_world_exploration: 0.95,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-mhw',
    steamAppId: 582010,
    name: 'Monster Hunter: World',
    description: 'Cazar bestias gigantes en ecosistemas vivos con 14 tipos de armas complejas en equipo de 4.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(582010),
    tags: ['Caza', 'ARPG', 'Co-op', 'Monstruos'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      rpg_narrative: 0.7,
      intensity_high: 0.9,
      mechanical_skill: 0.9,
      pve_cooperative: 1.0,
      fantasy_medieval: 0.85,
      progression_loot: 1.0,
    },
  },
  {
    id: 'kb-mh-wilds',
    steamAppId: 2246340,
    name: 'Monster Hunter Wilds',
    description: 'La nueva generación de caza de monstruos en biomas climáticos dinámicos y manadas masivas.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(2246340),
    tags: ['Caza', 'ARPG', 'Co-op', 'Mundo Abierto'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      rpg_narrative: 0.7,
      intensity_high: 0.9,
      mechanical_skill: 0.9,
      pve_cooperative: 1.0,
      fantasy_medieval: 0.85,
      open_world_exploration: 0.9,
      progression_loot: 1.0,
    },
  },
  {
    id: 'kb-marvel-rivals',
    steamAppId: 2767030,
    name: 'Marvel Rivals',
    description: 'Hero shooter 6v6 en tercera persona con superhéroes de Marvel, sinergias de equipo y entornos destruibles.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(2767030),
    tags: ['Hero Shooter', 'Marvel', 'Competitivo', 'Tercera Persona'],
    genres: ['Action', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 12,
    isMultiplayer: true,
    weights: {
      arena_hero_shooter: 1.0,
      intensity_high: 0.9,
      mechanical_skill: 0.85,
      pvp_competitive: 1.0,
      squad_coordination: 0.95,
      asymmetric_roles: 1.0,
      stylized_colorful: 0.9,
    },
  },
  {
    id: 'kb-ror2',
    steamAppId: 632360,
    name: 'Risk of Rain 2',
    description: 'Roguelike 3D frenético con oleadas crecientes, acumulación absurda de objetos y escape planetario.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(632360),
    tags: ['Roguelike', 'Tercera Persona', 'Co-op', 'Loot'],
    genres: ['Action', 'Indie'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      roguelike_deckbuilder: 0.9,
      coop_pve_action: 0.95,
      intensity_high: 0.95,
      mechanical_skill: 0.85,
      pve_cooperative: 0.95,
      scifi_futuristic: 0.8,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-dst',
    steamAppId: 322330,
    name: "Don't Starve Together",
    description: 'Supervivencia cooperativa en un mundo gótico surrealista con hambre, cordura y criaturas extrañas.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(322330),
    tags: ['Supervivencia', 'Gótico', 'Crafteo', 'Co-op'],
    genres: ['Action', 'Adventure', 'Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 6,
    isMultiplayer: true,
    weights: {
      survival_craft: 1.0,
      coop_horror: 0.65,
      chill_relaxed: 0.5,
      pve_cooperative: 0.9,
      sandbox_freedom: 0.85,
      dark_gritty: 0.8,
      stylized_colorful: 0.85,
    },
  },
  {
    id: 'kb-killing-floor-2',
    steamAppId: 232090,
    name: 'Killing Floor 2',
    description: 'FPS de supervivencia cooperativo contra hordas de clones mutantes con desmembramiento visceral.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(232090),
    tags: ['Gore', 'Hordas', 'FPS', 'Co-op'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 6,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      coop_horror: 0.85,
      intensity_high: 0.95,
      mechanical_skill: 0.8,
      pve_cooperative: 1.0,
      squad_coordination: 0.85,
      dark_gritty: 0.95,
    },
  },
  {
    id: 'kb-tabletop',
    steamAppId: 286160,
    name: 'Tabletop Simulator',
    description: 'Simulador universal de juegos de mesa, cartas y rol con física completa y miles de mods.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(286160),
    tags: ['Juegos de Mesa', 'Física', 'Party', 'Casual'],
    genres: ['Casual', 'Indie', 'RPG', 'Simulation', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 10,
    isMultiplayer: true,
    weights: {
      party_social: 1.0,
      chill_relaxed: 0.95,
      sandbox_freedom: 1.0,
      social_deduction_chaos: 0.75,
      tactical_depth: 0.75,
    },
  },
  {
    id: 'kb-pummel',
    steamAppId: 880940,
    name: 'Pummel Party',
    description: 'Party game de 4 a 8 jugadores con tablero, minijuegos ridículos y armas absurdas para arruinar amistades.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(880940),
    tags: ['Party', 'Minijuegos', 'Casual', 'Comedia'],
    genres: ['Action', 'Casual', 'Indie'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      party_social: 1.0,
      short_session: 0.85,
      social_deduction_chaos: 0.9,
      pvp_competitive: 0.75,
      stylized_colorful: 0.9,
    },
  },
  {
    id: 'kb-golf',
    steamAppId: 431240,
    name: 'Golf With Your Friends',
    description: 'Minigolf multijugador rápido y caótico para hasta 12 jugadores simultáneos con colisiones y trampas.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(431240),
    tags: ['Minigolf', 'Party', 'Física', 'Casual'],
    genres: ['Casual', 'Indie', 'Sports'],
    minPlayers: 1,
    maxPlayers: 12,
    isMultiplayer: true,
    weights: {
      party_social: 1.0,
      sports_racing: 0.75,
      chill_relaxed: 0.85,
      short_session: 0.9,
      social_deduction_chaos: 0.8,
      stylized_colorful: 0.85,
    },
  },
  {
    id: 'kb-gangbeasts',
    steamAppId: 285900,
    name: 'Gang Beasts',
    description: 'Peleas torpes y desternillantes entre muñecos de gelatina en escenarios peligrosos con físicas absurdas.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(285900),
    tags: ['Lucha', 'Física', 'Comedia', 'Party'],
    genres: ['Action', 'Adventure', 'Casual', 'Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      party_social: 1.0,
      short_session: 0.9,
      social_deduction_chaos: 0.95,
      pvp_competitive: 0.8,
      stylized_colorful: 0.9,
    },
  },
  {
    id: 'kb-hll',
    steamAppId: 686810,
    name: 'Hell Let Loose',
    description: 'Simulador bélico masivo 50v50 de la Segunda Guerra Mundial con cadenas de mando y artillería.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(686810),
    tags: ['Segunda Guerra Mundial', 'Milsim', 'Táctico', 'FPS'],
    genres: ['Action', 'Simulation', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 100,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 0.9,
      tactical_depth: 0.95,
      realistic_military: 1.0,
      squad_coordination: 1.0,
      pvp_competitive: 0.9,
      dark_gritty: 0.95,
    },
  },
  {
    id: 'kb-squad',
    steamAppId: 393380,
    name: 'Squad',
    description: 'Shooter táctico moderno de armas combinadas enfocado en comunicación de radio y fortificación.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(393380),
    tags: ['Milsim', 'Táctico', 'Comunidades', 'FPS'],
    genres: ['Action', 'Indie', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 100,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 0.85,
      tactical_depth: 1.0,
      realistic_military: 1.0,
      squad_coordination: 1.0,
      pvp_competitive: 0.9,
    },
  },
  {
    id: 'kb-ron',
    steamAppId: 1144200,
    name: 'Ready or Not',
    description: 'Operaciones SWAT tácticas realistas de limpieza de habitaciones, desarme y rescate de rehenes.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(1144200),
    tags: ['SWAT', 'Táctico', 'FPS Realista', 'Co-op'],
    genres: ['Action', 'Adventure', 'Indie'],
    minPlayers: 1,
    maxPlayers: 5,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 0.9,
      tactical_depth: 0.95,
      realistic_military: 0.95,
      squad_coordination: 0.95,
      pve_cooperative: 0.95,
      dark_gritty: 0.9,
    },
  },
  {
    id: 'kb-poe2',
    steamAppId: 2694490,
    name: 'Path of Exile 2',
    description: 'ARPG hardcore de fantasía oscura con árbol de habilidades colosal, gemas de habilidades y combate fluido.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(2694490),
    tags: ['ARPG', 'Fantasía Oscura', 'Loot', 'Hardcore'],
    genres: ['Action', 'Free to Play', 'RPG'],
    minPlayers: 1,
    maxPlayers: 6,
    isMultiplayer: true,
    weights: {
      rpg_narrative: 0.8,
      intensity_high: 0.9,
      tactical_depth: 0.95,
      pve_cooperative: 0.9,
      dark_gritty: 1.0,
      fantasy_medieval: 0.9,
      progression_loot: 1.0,
    },
  },
  {
    id: 'kb-remnant2',
    steamAppId: 1282100,
    name: 'Remnant II',
    description: 'Souls con armas de fuego cooperativo en mundos dimensionales grotescos con arquetipos dinámicos.',
    category: 'Co-op Acción',
    coverUrl: steamHeaderUrl(1282100),
    tags: ['Souls-like', 'Tercera Persona', 'Co-op', 'Loot'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 3,
    isMultiplayer: true,
    weights: {
      coop_pve_action: 1.0,
      intensity_high: 0.9,
      mechanical_skill: 0.9,
      pve_cooperative: 1.0,
      squad_coordination: 0.85,
      dark_gritty: 0.9,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-raft',
    steamAppId: 648800,
    name: 'Raft',
    description: 'Supervivencia oceánica en balsa con anzuelo, tiburones y exploración de islas tropicales.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(648800),
    tags: ['Supervivencia', 'Océano', 'Crafteo', 'Co-op'],
    genres: ['Action', 'Adventure', 'Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      survival_craft: 1.0,
      chill_relaxed: 0.8,
      pve_cooperative: 0.95,
      sandbox_freedom: 0.9,
      stylized_colorful: 0.8,
      open_world_exploration: 0.85,
    },
  },
  {
    id: 'kb-the-forest',
    steamAppId: 242760,
    name: 'The Forest',
    description: 'Supervivencia y terror en una península aislada contra caníbales y mutantes subterráneos.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(242760),
    tags: ['Terror', 'Supervivencia', 'Caníbales', 'Co-op'],
    genres: ['Action', 'Adventure', 'Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      survival_craft: 0.95,
      coop_horror: 0.95,
      horror_tension: 0.9,
      pve_cooperative: 0.9,
      sandbox_freedom: 0.85,
      dark_gritty: 0.9,
      open_world_exploration: 0.85,
    },
  },
  {
    id: 'kb-soft',
    steamAppId: 1326470,
    name: 'Sons Of The Forest',
    description: 'Secuela con IA avanzada de compañeros, gráficos de última generación, cuevas letales y crafteo.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(1326470),
    tags: ['Terror', 'Supervivencia', 'Mundo Abierto', 'Co-op'],
    genres: ['Action', 'Adventure', 'Indie', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      survival_craft: 0.95,
      coop_horror: 0.95,
      horror_tension: 0.9,
      pve_cooperative: 0.9,
      sandbox_freedom: 0.85,
      dark_gritty: 0.9,
      open_world_exploration: 0.9,
    },
  },
  {
    id: 'kb-halo-infinite',
    steamAppId: 1240440,
    name: 'Halo Infinite',
    description: 'Arena shooter clásico con gancho de agarre, control de armas de mapa y partidas competitivas.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(1240440),
    tags: ['Arena Shooter', 'FPS', 'Sci-Fi', 'Competitivo'],
    genres: ['Action', 'Free to Play'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      arena_hero_shooter: 0.9,
      tactical_shooter: 0.75,
      intensity_high: 0.85,
      mechanical_skill: 0.9,
      pvp_competitive: 0.95,
      squad_coordination: 0.85,
      scifi_futuristic: 0.95,
    },
  },
  {
    id: 'kb-brawlhalla',
    steamAppId: 291550,
    name: 'Brawlhalla',
    description: 'Plataformas de lucha frenética para hasta 8 jugadores con combates caóticos y armas arrojadizas.',
    category: 'Party Casual',
    coverUrl: steamHeaderUrl(291550),
    tags: ['Plataformas Lucha', 'Party', 'Competitivo', '2D'],
    genres: ['Action', 'Free to Play', 'Indie'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      party_social: 0.9,
      intensity_high: 0.85,
      mechanical_skill: 0.85,
      short_session: 0.95,
      pvp_competitive: 0.9,
      stylized_colorful: 0.9,
    },
  },

  // --------------------------------------------------------------------------
  // NON-STEAM / MULTI-LAUNCHER MULTIPLAYER (>= 3 Players) - 14 Games
  // --------------------------------------------------------------------------
  {
    id: 'kb-valorant',
    name: 'Valorant',
    description: 'Shooter táctico 5v5 con agentes, habilidades sobrenaturales y precisión de disparo quirúrgica.',
    category: 'Shooter Táctico',
    platform: 'Riot Games',
    coverUrl: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=800&q=80',
    tags: ['FPS', 'Táctico', 'Héroes', 'Competitivo'],
    genres: ['Shooter', 'Action'],
    minPlayers: 1,
    maxPlayers: 5,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 0.9,
      tactical_depth: 0.9,
      mechanical_skill: 0.95,
      pvp_competitive: 1.0,
      squad_coordination: 0.95,
      asymmetric_roles: 0.9,
      stylized_colorful: 0.7,
    },
  },
  {
    id: 'kb-lol',
    name: 'League of Legends',
    description: 'El MOBA más jugado del mundo: partidas 5v5, control de visión, objetivos y coordinación de equipo.',
    category: 'MOBA',
    platform: 'Riot Games',
    coverUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    tags: ['MOBA', 'Estrategia', 'Competitivo', 'Esports'],
    genres: ['Strategy', 'Action'],
    minPlayers: 1,
    maxPlayers: 5,
    isMultiplayer: true,
    weights: {
      moba: 1.0,
      intensity_high: 0.85,
      tactical_depth: 0.95,
      mechanical_skill: 0.9,
      pvp_competitive: 1.0,
      squad_coordination: 0.95,
      asymmetric_roles: 1.0,
      fantasy_medieval: 0.8,
    },
  },
  {
    id: 'kb-tft',
    name: 'Teamfight Tactics',
    description: 'Auto battler estratégico de 8 jugadores con gestión de economía, sinergias de campeones e items.',
    category: 'RTS',
    platform: 'Riot Games',
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
    tags: ['Auto Battler', 'Estrategia', 'Cartas', 'Casual'],
    genres: ['Strategy'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      rts_strategy: 0.8,
      roguelike_deckbuilder: 0.85,
      tactical_depth: 0.9,
      chill_relaxed: 0.8,
      pvp_competitive: 0.85,
      fantasy_medieval: 0.8,
    },
  },
  {
    id: 'kb-minecraft',
    name: 'Minecraft',
    description: 'El juego sandbox de bloques infinito: supervivencia, crafteo, redstone, arquitectura y diversión.',
    category: 'Survival Sandbox',
    platform: 'Xbox Game Pass',
    coverUrl: 'https://images.unsplash.com/photo-1627856013091-fed6e4e30025?auto=format&fit=crop&w=800&q=80',
    tags: ['Sandbox', 'Supervivencia', 'Construcción', 'Mundo Abierto'],
    genres: ['Adventure', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 20,
    isMultiplayer: true,
    weights: {
      survival_craft: 1.0,
      chill_relaxed: 0.8,
      sandbox_freedom: 1.0,
      pve_cooperative: 0.95,
      stylized_colorful: 0.9,
      open_world_exploration: 1.0,
    },
  },
  {
    id: 'kb-fortnite',
    name: 'Fortnite',
    description: 'Battle Royale masivo con construcción rápida o modo Cero Construcción, eventos y juego en escuadra.',
    category: 'Shooter Táctico',
    platform: 'Epic Games',
    coverUrl: 'https://images.unsplash.com/photo-1589241062272-c0a000072dfa?auto=format&fit=crop&w=800&q=80',
    tags: ['Battle Royale', 'Tercera Persona', 'Shooter', 'Eventos'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      battle_royale: 1.0,
      intensity_high: 0.85,
      mechanical_skill: 0.9,
      pvp_competitive: 0.95,
      squad_coordination: 0.9,
      stylized_colorful: 0.95,
    },
  },
  {
    id: 'kb-rocket-league',
    name: 'Rocket League',
    description: 'Fútbol con autos propulsados por cohetes, piruetas aéreas y física competitiva pura.',
    category: 'Deportes / Autos',
    platform: 'Epic Games',
    coverUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    tags: ['Autos', 'Fútbol', 'Competitivo', 'Esports'],
    genres: ['Sports', 'Racing'],
    minPlayers: 1,
    maxPlayers: 6,
    isMultiplayer: true,
    weights: {
      sports_racing: 1.0,
      intensity_high: 0.9,
      mechanical_skill: 1.0,
      short_session: 0.9,
      pvp_competitive: 1.0,
      squad_coordination: 0.9,
      stylized_colorful: 0.8,
    },
  },
  {
    id: 'kb-fall-guys',
    name: 'Fall Guys',
    description: 'Carreras de obstáculos multitudinarias y eliminatorias caóticas llenas de tropiezos y risas.',
    category: 'Party Casual',
    platform: 'Epic Games',
    coverUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80',
    tags: ['Party', 'Carreras', 'Obstáculos', 'Casual'],
    genres: ['Action', 'Casual'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      party_social: 1.0,
      short_session: 0.9,
      social_deduction_chaos: 0.95,
      pvp_competitive: 0.75,
      stylized_colorful: 1.0,
    },
  },
  {
    id: 'kb-warzone',
    name: 'Call of Duty: Warzone',
    description: 'Battle Royale bélico hiperrealista con contratos, Gulag, armamentos personalizados y tiroteos veloces.',
    category: 'Shooter Táctico',
    platform: 'Battle.net',
    coverUrl: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?auto=format&fit=crop&w=800&q=80',
    tags: ['Battle Royale', 'FPS', 'Militar', 'Call of Duty'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      battle_royale: 1.0,
      tactical_shooter: 0.85,
      intensity_high: 0.95,
      mechanical_skill: 0.9,
      pvp_competitive: 1.0,
      squad_coordination: 0.9,
      realistic_military: 0.95,
    },
  },
  {
    id: 'kb-ow2',
    name: 'Overwatch 2',
    description: 'Hero shooter 5v5 con tanques, soportes y DPS coordinando definitivas para capturar objetivos.',
    category: 'Shooter Táctico',
    platform: 'Battle.net',
    coverUrl: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?auto=format&fit=crop&w=800&q=80',
    tags: ['Hero Shooter', 'FPS', 'Competitivo', 'Esports'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 5,
    isMultiplayer: true,
    weights: {
      arena_hero_shooter: 1.0,
      intensity_high: 0.9,
      mechanical_skill: 0.85,
      pvp_competitive: 1.0,
      squad_coordination: 0.95,
      asymmetric_roles: 1.0,
      stylized_colorful: 0.9,
      scifi_futuristic: 0.8,
    },
  },
  {
    id: 'kb-wow',
    name: 'World of Warcraft',
    description: 'El MMORPG legendario de Azeroth con mazmorras míticas, bandas de 20 jugadores y guerras de facciones.',
    category: 'RPG / Aventura',
    platform: 'Battle.net',
    coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    tags: ['MMORPG', 'Fantasía', 'Raids', 'Rol'],
    genres: ['RPG', 'Massively Multiplayer'],
    minPlayers: 1,
    maxPlayers: 20,
    isMultiplayer: true,
    weights: {
      rpg_narrative: 0.9,
      tactical_depth: 0.9,
      long_campaign: 1.0,
      pve_cooperative: 0.95,
      pvp_competitive: 0.8,
      squad_coordination: 1.0,
      fantasy_medieval: 1.0,
      progression_loot: 1.0,
    },
  },
  {
    id: 'kb-diablo4',
    name: 'Diablo IV',
    description: 'ARPG siniestro en Santuario: masacres de demonios, mazmorras de pesadilla y farmeo de items legendarios.',
    category: 'RPG / Aventura',
    platform: 'Battle.net',
    coverUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?auto=format&fit=crop&w=800&q=80',
    tags: ['ARPG', 'Fantasía Oscura', 'Loot', 'Demonios'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      rpg_narrative: 0.85,
      intensity_high: 0.85,
      pve_cooperative: 0.9,
      dark_gritty: 1.0,
      fantasy_medieval: 0.9,
      progression_loot: 1.0,
      open_world_exploration: 0.85,
    },
  },
  {
    id: 'kb-sc2',
    name: 'StarCraft II',
    description: 'El pináculo del RTS competitivo: Terran, Zerg y Protoss en microgestión y macrogestión quirúrgica.',
    category: 'RTS',
    platform: 'Battle.net',
    coverUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
    tags: ['RTS', 'Sci-Fi', 'Esports', 'Competitivo'],
    genres: ['Strategy'],
    minPlayers: 1,
    maxPlayers: 8,
    isMultiplayer: true,
    weights: {
      rts_strategy: 1.0,
      intensity_high: 0.95,
      tactical_depth: 1.0,
      mechanical_skill: 1.0,
      pvp_competitive: 1.0,
      scifi_futuristic: 1.0,
    },
  },
  {
    id: 'kb-tarkov',
    name: 'Escape from Tarkov',
    description: 'Extraction shooter hardcore hiperrealista con balística balística real, heridas y pérdida de loot al morir.',
    category: 'Shooter Táctico',
    platform: 'Otro Launcher',
    coverUrl: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?auto=format&fit=crop&w=800&q=80',
    tags: ['Extracción', 'Milsim', 'Hardcore', 'Supervivencia'],
    genres: ['Action', 'RPG', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 5,
    isMultiplayer: true,
    weights: {
      tactical_shooter: 1.0,
      intensity_high: 1.0,
      tactical_depth: 1.0,
      mechanical_skill: 0.95,
      pvp_competitive: 1.0,
      realistic_military: 1.0,
      dark_gritty: 1.0,
      progression_loot: 0.95,
    },
  },
  {
    id: 'kb-fc25',
    name: 'EA Sports FC 25',
    description: 'Simulador futbolístico de referencia con Clubes Pro para jugar 11 contra 11 con todos tus amigos.',
    category: 'Deportes / Autos',
    platform: 'EA App',
    coverUrl: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=800&q=80',
    tags: ['Fútbol', 'Deportes', 'Clubes Pro', 'Competitivo'],
    genres: ['Sports', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 22,
    isMultiplayer: true,
    weights: {
      sports_racing: 1.0,
      mechanical_skill: 0.85,
      short_session: 0.85,
      pvp_competitive: 0.95,
      squad_coordination: 0.9,
    },
  },
  {
    id: 'kb-gtav',
    steamAppId: 271590,
    name: 'Grand Theft Auto V',
    description: 'Acción en mundo abierto con GTA Online para golpes cooperativos, carreras y caos en Los Santos.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(271590),
    tags: ['Mundo Abierto', 'Co-op', 'Multijugador', 'Acción'],
    genres: ['Action', 'Adventure'],
    minPlayers: 1,
    maxPlayers: 30,
    isMultiplayer: true,
    weights: {
      open_world_exploration: 1.0,
      tactical_shooter: 0.7,
      sandbox_freedom: 0.85,
      pve_cooperative: 0.8,
      social_deduction_chaos: 0.75,
      long_campaign: 0.85,
    },
  },
  {
    id: 'kb-genshin-impact',
    name: 'Genshin Impact',
    description: 'Action RPG de mundo abierto con combate elemental y exploración cooperativa en Teyvat.',
    category: 'RPG / Aventura',
    platform: 'Otro Launcher',
    coverUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80',
    tags: ['RPG', 'Anime', 'Mundo Abierto', 'Co-op'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: true,
    weights: {
      rpg_narrative: 0.9,
      open_world_exploration: 0.95,
      stylized_colorful: 1.0,
      progression_loot: 0.95,
      pve_cooperative: 0.6,
    },
  },
  {
    id: 'kb-roblox',
    name: 'Roblox',
    description: 'Plataforma multijugador con miles de experiencias creadas por la comunidad para jugar con amigos.',
    category: 'Party Casual',
    platform: 'Otro Launcher',
    coverUrl: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=800&q=80',
    tags: ['Sandbox', 'Party', 'Multijugador', 'Casual'],
    genres: ['Casual', 'Simulation'],
    minPlayers: 1,
    maxPlayers: 32,
    isMultiplayer: true,
    weights: {
      party_social: 0.95,
      sandbox_freedom: 0.9,
      social_deduction_chaos: 0.8,
      short_session: 0.9,
      stylized_colorful: 0.7,
    },
  },

  // --------------------------------------------------------------------------
  // ICONIC SINGLEPLAYER PC GAMES (ADN Profiling & Singleplayer Top 3) - 17 Games
  // --------------------------------------------------------------------------
  {
    id: 'kb-elden-ring',
    steamAppId: 1245620,
    name: 'Elden Ring',
    description: 'Campaña colosal de rol de acción en las Tierras Intermedias con combate souls y exploración sublime.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1245620),
    tags: ['Souls-like', 'Mundo Abierto', 'Fantasía Oscura', 'RPG'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 4,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 0.9,
      intensity_high: 0.95,
      mechanical_skill: 0.95,
      long_campaign: 1.0,
      dark_gritty: 0.95,
      fantasy_medieval: 1.0,
      open_world_exploration: 1.0,
      progression_loot: 0.95,
    },
  },
  {
    id: 'kb-witcher-3',
    steamAppId: 292030,
    name: 'The Witcher 3: Wild Hunt',
    description: 'Geralt de Rivia buscando a Ciri en una obra cumbre de narrativa adulta, monstruos y decisiones morales.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(292030),
    tags: ['Historia', 'Mundo Abierto', 'RPG', 'Fantasía'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 1.0,
      long_campaign: 1.0,
      tactical_depth: 0.75,
      dark_gritty: 0.9,
      fantasy_medieval: 1.0,
      open_world_exploration: 1.0,
    },
  },
  {
    id: 'kb-rdr2',
    steamAppId: 1174180,
    name: 'Red Dead Redemption 2',
    description: 'El viaje trágico de Arthur Morgan en un Lejano Oeste hiperdetallado, vivo y cinematográfico.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1174180),
    tags: ['Viejo Oeste', 'Historia', 'Mundo Abierto', 'Inmersivo'],
    genres: ['Action', 'Adventure'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 1.0,
      long_campaign: 1.0,
      chill_relaxed: 0.7,
      dark_gritty: 0.85,
      realistic_military: 0.75,
      open_world_exploration: 1.0,
    },
  },
  {
    id: 'kb-cyberpunk',
    steamAppId: 1091500,
    name: 'Cyberpunk 2077',
    description: 'Night City: implantes cibernéticos, tiroteos viscerales y conspiraciones corporativas en el futuro distópico.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1091500),
    tags: ['Cyberpunk', 'Sci-Fi', 'FPS RPG', 'Historia'],
    genres: ['Action', 'RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 0.95,
      tactical_shooter: 0.8,
      intensity_high: 0.85,
      long_campaign: 0.95,
      dark_gritty: 0.9,
      scifi_futuristic: 1.0,
      open_world_exploration: 0.95,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-hollow-knight',
    steamAppId: 367520,
    name: 'Hollow Knight',
    description: 'Metroidvania sublime en el reino subterráneo de Hallownest con combate preciso, jefes duros y arte dibujado.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(367520),
    tags: ['Metroidvania', 'Souls-like', '2D', 'Difícil'],
    genres: ['Action', 'Indie'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      roguelike_deckbuilder: 0.5,
      intensity_high: 0.9,
      mechanical_skill: 0.95,
      dark_gritty: 0.85,
      stylized_colorful: 0.8,
      open_world_exploration: 0.85,
    },
  },
  {
    id: 'kb-hades',
    steamAppId: 1145360,
    name: 'Hades',
    description: 'Zagreus intentando escapar del Inframundo griego con bendiciones olímpicas, narrativa reactiva y combate ágil.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1145360),
    tags: ['Roguelike', 'Acción Rápida', 'Mitología', 'Indie'],
    genres: ['Action', 'Indie', 'RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      roguelike_deckbuilder: 1.0,
      intensity_high: 0.95,
      mechanical_skill: 0.9,
      short_session: 0.85,
      stylized_colorful: 0.95,
      fantasy_medieval: 0.8,
      progression_loot: 0.85,
    },
  },
  {
    id: 'kb-sekiro',
    steamAppId: 814380,
    name: 'Sekiro: Shadows Die Twice',
    description: 'Duelos samurái con parrys perfectos, sigilo ninja y prótesis de shinobi en el Japón feudal.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(814380),
    tags: ['Souls-like', 'Parry', 'Acción Difícil', 'Ninjas'],
    genres: ['Action', 'Adventure'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 0.85,
      intensity_high: 1.0,
      mechanical_skill: 1.0,
      dark_gritty: 0.9,
      fantasy_medieval: 0.9,
    },
  },
  {
    id: 'kb-balatro',
    steamAppId: 2379780,
    name: 'Balatro',
    description: 'El roguelike de póker hipnótico donde cartas de comodines alteran las reglas y generan sinergias dementes.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(2379780),
    tags: ['Roguelike', 'Cartas', 'Póker', 'Adictivo'],
    genres: ['Casual', 'Indie', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      roguelike_deckbuilder: 1.0,
      tactical_depth: 0.9,
      chill_relaxed: 0.8,
      short_session: 0.9,
      stylized_colorful: 0.85,
    },
  },
  {
    id: 'kb-slay-the-spire',
    steamAppId: 646570,
    name: 'Slay the Spire',
    description: 'El padre del deckbuilder roguelike moderno: armar tu baraja carta a carta para derrotar a los jefes de la torre.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(646570),
    tags: ['Deckbuilder', 'Roguelike', 'Estrategia', 'Cartas'],
    genres: ['Indie', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      roguelike_deckbuilder: 1.0,
      tactical_depth: 0.95,
      short_session: 0.8,
      fantasy_medieval: 0.75,
      progression_loot: 0.85,
    },
  },
  {
    id: 'kb-god-of-war',
    steamAppId: 1593500,
    name: 'God of War',
    description: 'Kratos y Atreus en las tierras nórdicas con el hacha Leviatán y plano secuencia cinematográfico continuo.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1593500),
    tags: ['Acción', 'Mitología Nórdica', 'Historia', 'Hack and Slash'],
    genres: ['Action', 'Adventure', 'RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 0.95,
      intensity_high: 0.9,
      mechanical_skill: 0.85,
      long_campaign: 0.9,
      fantasy_medieval: 0.95,
    },
  },
  {
    id: 'kb-skyrim',
    steamAppId: 489830,
    name: 'The Elder Scrolls V: Skyrim',
    description: 'El Sangre de Dragón en Tamriel: libertad sandbox absoluta, magia, dragones y miles de mods.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(489830),
    tags: ['RPG', 'Mundo Abierto', 'Fantasía', 'Moddable'],
    genres: ['RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 0.9,
      sandbox_freedom: 0.95,
      long_campaign: 1.0,
      fantasy_medieval: 1.0,
      open_world_exploration: 1.0,
      progression_loot: 0.9,
    },
  },
  {
    id: 'kb-rimworld',
    steamAppId: 294100,
    name: 'RimWorld',
    description: 'Generador de historias de colonias espaciales gestionado por una IA cuentacuentos despiadada.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(294100),
    tags: ['Gestión', 'Supervivencia', 'Colonias', 'Sandbox'],
    genres: ['Indie', 'Simulation', 'Strategy'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      survival_craft: 0.9,
      rts_strategy: 0.9,
      tactical_depth: 1.0,
      sandbox_freedom: 1.0,
      scifi_futuristic: 0.85,
      dark_gritty: 0.9,
    },
  },
  {
    id: 'kb-subnautica',
    steamAppId: 264710,
    name: 'Subnautica',
    description: 'Supervivencia y exploración en las profundidades oceánicas de un planeta alienígena con leviatanes.',
    category: 'Survival Sandbox',
    coverUrl: steamHeaderUrl(264710),
    tags: ['Supervivencia', 'Océano', 'Terror Acuático', 'Crafteo'],
    genres: ['Adventure', 'Indie'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      survival_craft: 1.0,
      horror_tension: 0.85,
      chill_relaxed: 0.7,
      sandbox_freedom: 0.9,
      scifi_futuristic: 0.9,
      open_world_exploration: 1.0,
    },
  },
  {
    id: 'kb-doom-eternal',
    steamAppId: 782330,
    name: 'DOOM Eternal',
    description: 'El Doom Slayer despedazando demonios al ritmo de metal con combate de ajedrez violento a máxima velocidad.',
    category: 'Shooter Táctico',
    coverUrl: steamHeaderUrl(782330),
    tags: ['FPS Rápido', 'Gore', 'Demonios', 'Banda Sonora'],
    genres: ['Action'],
    minPlayers: 1,
    maxPlayers: 3,
    isMultiplayer: false,
    weights: {
      arena_hero_shooter: 0.8,
      intensity_high: 1.0,
      mechanical_skill: 1.0,
      dark_gritty: 0.95,
      scifi_futuristic: 0.85,
    },
  },
  {
    id: 'kb-re4',
    steamAppId: 2050650,
    name: 'Resident Evil 4',
    description: 'Remake legendario de Leon S. Kennedy rescatando a Ashley en un pueblo español infestado por Los Iluminados.',
    category: 'Co-op Horror',
    coverUrl: steamHeaderUrl(2050650),
    tags: ['Survival Horror', 'Acción', 'Zombies', 'Tercera Persona'],
    genres: ['Action', 'Adventure'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      coop_horror: 0.85,
      horror_tension: 0.9,
      intensity_high: 0.9,
      tactical_depth: 0.75,
      dark_gritty: 0.95,
    },
  },
  {
    id: 'kb-p5r',
    steamAppId: 1687950,
    name: 'Persona 5 Royal',
    description: 'JRPG con estilo deslumbrante: vida escolar en Tokio de día y ladrones de corazones en el Metaverso de noche.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1687950),
    tags: ['JRPG', 'Anime', 'Por Turnos', 'Historia'],
    genres: ['RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 1.0,
      tactical_depth: 0.85,
      long_campaign: 1.0,
      stylized_colorful: 1.0,
    },
  },
  {
    id: 'kb-clair-obscur',
    steamAppId: 1903340,
    name: 'Clair Obscur: Expedition 33',
    description: 'JRPG por turnos reactivo de inspiración Belle Époque con esquivas y parrys en tiempo real.',
    category: 'RPG / Aventura',
    coverUrl: steamHeaderUrl(1903340),
    tags: ['JRPG', 'Por Turnos', 'Fantasía', 'Historia'],
    genres: ['Action', 'Adventure', 'RPG'],
    minPlayers: 1,
    maxPlayers: 1,
    isMultiplayer: false,
    weights: {
      rpg_narrative: 0.9,
      tactical_depth: 0.85,
      fantasy_medieval: 0.85,
      stylized_colorful: 0.85,
    },
  },
];

// Normalized string helper for fuzzy matching
export function normalizeGameName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// ============================================================================
// 2.1 NON-GAME SOFTWARE & UTILITIES EXCLUSION FILTER (Wallpaper Engine, etc.)
// ============================================================================

export const NON_GAME_STEAM_APP_IDS: ReadonlySet<number> = new Set<number>([
  431960, // Wallpaper Engine
  629520, // Soundpad
  1366800, // Crosshair X
  836600, // Crosshair V2
  1477830, // HudSight
  993090, // Lossless Scaling
  388080, // Borderless Gaming
  250820, // SteamVR
  908520, // fpsVR
  1009850, // OVR Advanced Settings
  1089350, // Desktop+
  382110, // Virtual Desktop
  1905180, // OBS Studio
  365670, // Blender
  431730, // Aseprite
  403560, // ShareX
  223850, // 3DMark
  496100, // PCMark 10
  227260, // DisplayFusion
  1325860, // VTube Studio
  1364390, // Animaze
  274920, // FaceRig
  326590, // PlayClaw 5
  228180, // Action! Gameplay Recording
  719950, // PrprLive
  1283970, // YoloMouse
  607380, // Fences
  678960, // Start10
  1475810, // TranslucentTB
  384300, // CPUCores
]);

const NON_GAME_SOFTWARE_NAMES: ReadonlyArray<string> = [
  'wallpaper engine',
  'lively wallpaper',
  'wallpaper alive',
  'rainmeter',
  'deskscapes',
  'fences',
  'soundpad',
  'voicemod',
  'morphvox',
  'clownfish voice changer',
  'crosshair x',
  'crosshair v2',
  'hudsight',
  'yolomouse',
  'lossless scaling',
  'borderless gaming',
  'cpucores',
  'displayfusion',
  'translucenttb',
  'start10',
  'start11',
  'groupy',
  'obs studio',
  'streamlabs',
  'xsplit',
  'action gameplay recording',
  'playclaw',
  'sharex',
  'fraps',
  'steamvr',
  'fpsvr',
  'ovr advanced settings',
  'ovr toolkit',
  'xsoverlay',
  'virtual desktop',
  'desktop+',
  'driver4vr',
  'ivry',
  '3dmark',
  'pcmark',
  'furmark',
  'geekbench',
  'heaven benchmark',
  'superposition benchmark',
  'blender',
  'aseprite',
  'krita',
  'substance painter',
  'substance designer',
  'marvelous designer',
  'vegas pro',
  'movavi',
  'audacity',
  'fl studio',
  'vtube studio',
  'animaze',
  'facerig',
  'prprlive',
  'vroid studio',
  'rpg maker',
  'gamemaker',
  'godot engine',
  'unreal engine',
  'construct 2',
  'construct 3',
  'clickteam fusion',
  'appgamekit',
  'pixel game maker',
  'razer cortex',
  'msi afterburner',
  'rivatuner',
  'driver booster',
  'ccleaner',
  'steam linux runtime',
  'steamworks common redistributables',
];

const STRUCTURAL_NON_GAME_SUBSTRINGS: ReadonlyArray<string> = [
  'dedicated server',
  'authoring tools',
  'mod tools',
  'creation kit',
  'level editor',
  'benchmark',
  'soundtrack',
  'original soundtrack',
  'digital artbook',
  'art book',
  'bonus content',
];

const NON_GAME_SOFTWARE_LABELS: ReadonlySet<string> = new Set<string>([
  'utilities',
  'utilidades',
  'software',
  'animation & modeling',
  'animacion y modelado',
  'audio production',
  'produccion de audio',
  'video production',
  'produccion de video',
  'design & illustration',
  'diseno e ilustracion',
  'photo editing',
  'edicion de fotos',
  'web publishing',
  'publicacion web',
  'software training',
  'formacion en software',
  'accounting',
  'contabilidad',
  'benchmark',
]);

const CORE_GAMEPLAY_LABELS: ReadonlySet<string> = new Set<string>([
  'fps',
  'shooter',
  'tactical shooter',
  'hero shooter',
  'moba',
  'rts',
  'battle royale',
  'roguelike',
  'roguelite',
  'souls-like',
  'platformer',
  'metroidvania',
  'survival horror',
  'turn-based',
  'hack and slash',
  'fighting',
  'racing',
  'sports',
  'card game',
  'deckbuilding',
  'tower defense',
  'city builder',
  '4x',
  'grand strategy',
  'mmorpg',
  'jrpg',
  'crpg',
  'action rpg',
  'pvp',
  'looter shooter',
]);

function normalizeSoftwareLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeSoftwareTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isNonGameSteamApp(item: {
  appId?: number;
  steamAppId?: number;
  name: string;
  tags?: string[];
  genres?: string[];
  tagVotes?: Record<string, number>;
}): boolean {
  // Layer 1: AppID match (direct fields or `steam:<id>` tag)
  const directAppId = item.appId ?? item.steamAppId;
  if (directAppId !== undefined && NON_GAME_STEAM_APP_IDS.has(directAppId)) {
    return true;
  }
  if (item.tags) {
    for (const tag of item.tags) {
      if (tag.startsWith('steam:')) {
        const parsedId = Number(tag.slice(6));
        if (Number.isFinite(parsedId) && NON_GAME_STEAM_APP_IDS.has(parsedId)) {
          return true;
        }
      }
    }
  }

  // Layer 2: Known non-game software titles & structural SDK/server/soundtrack names
  const normTitle = normalizeSoftwareTitle(item.name || '');
  if (normTitle) {
    for (const swName of NON_GAME_SOFTWARE_NAMES) {
      if (normTitle === swName || normTitle.startsWith(`${swName} `)) {
        return true;
      }
    }
  }

  const lowerRawName = (item.name || '').toLowerCase();
  if (lowerRawName) {
    if (STRUCTURAL_NON_GAME_SUBSTRINGS.some((sub) => lowerRawName.includes(sub))) {
      return true;
    }
    if (/\b(sdk|ost)\b/i.test(item.name) || /^proton\b/i.test(lowerRawName.trim())) {
      return true;
    }
  }

  // Layer 3: Genres & Tags (SteamSpy / IGDB software/utilities signal)
  const normalizedGenres = (item.genres || []).map(normalizeSoftwareLabel).filter(Boolean);
  const normalizedTags = (item.tags || [])
    .filter((t) => !t.startsWith('steam:'))
    .map(normalizeSoftwareLabel)
    .filter(Boolean);
  const allNormalizedLabels = [...normalizedGenres, ...normalizedTags];
  const hasCoreGameplayAnywhere = allNormalizedLabels.some((l) => CORE_GAMEPLAY_LABELS.has(l));

  if (
    normalizedGenres.some((g) => NON_GAME_SOFTWARE_LABELS.has(g)) &&
    !hasCoreGameplayAnywhere
  ) {
    return true;
  }

  if (item.tagVotes && Object.keys(item.tagVotes).length > 0) {
    const sortedVoteLabels = Object.entries(item.tagVotes)
      .filter(([, votes]) => Number.isFinite(votes) && votes > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => normalizeSoftwareLabel(tag));

    const top2 = sortedVoteLabels.slice(0, 2);
    const top3 = sortedVoteLabels.slice(0, 3);
    const top5 = sortedVoteLabels.slice(0, 5);

    const hasSoftInTop2 = top2.some((t) => NON_GAME_SOFTWARE_LABELS.has(t));
    const softCountInTop5 = top5.filter((t) => NON_GAME_SOFTWARE_LABELS.has(t)).length;
    const hasCoreInTop3 = top3.some((t) => CORE_GAMEPLAY_LABELS.has(t));

    if ((hasSoftInTop2 || softCountInTop5 >= 2) && !hasCoreInTop3) {
      return true;
    }
  }

  const first2Tags = normalizedTags.slice(0, 2);
  if (first2Tags.some((t) => NON_GAME_SOFTWARE_LABELS.has(t)) && !hasCoreGameplayAnywhere) {
    return true;
  }
  if (
    (normalizedTags.includes('utilities') ||
      normalizedTags.includes('utilidades') ||
      normalizedTags.includes('software')) &&
    !hasCoreGameplayAnywhere
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// 3. COMPUTED SUGGESTED RATING FROM HOURS (Library-Relative Percentile & Absolute)
// ============================================================================

export function computeSuggestedRatingFromHours(
  hours: number,
  allHoursDescending: number[]
): GameRating {
  if (hours <= 0) return 2;

  const validHours = allHoursDescending.filter(h => h > 0);
  const maxHours = validHours.length > 0 ? validHours[0] : hours;
  const index = validHours.findIndex(h => hours >= h);
  const total = validHours.length || 1;
  const rankPercentile = index >= 0 ? index / total : 1; // 0 is top 1 game
  const ratio = maxHours > 0 ? hours / maxHours : 1;

  // Absolute or relative top tier (>=150h or top 10% or >=85% of player's maximum)
  if (hours >= 150 || (rankPercentile < 0.10 && hours >= 20) || ratio >= 0.85) {
    return 5;
  }
  // Upper-mid tier (>=45h or top 25% or >=50% of maximum)
  if (hours >= 45 || (rankPercentile < 0.25 && hours >= 10) || ratio >= 0.50) {
    return 4;
  }
  // Mid tier (>=10h or top 55% with >=5h or >=20% of maximum)
  if (hours >= 10 || (rankPercentile < 0.55 && hours >= 5) || ratio >= 0.20) {
    return 3;
  }
  // Casual played title
  if (hours >= 2) {
    return 2;
  }
  return 2;
}

// ============================================================================
// 4. IS CONSIDERABLE STEAM GAME
// ============================================================================

export function isConsiderableSteamGame(
  game: Pick<SteamOwnedGame, 'playtimeHours' | 'playtimeRecentHours'>,
  indexInSortedByHours: number
): boolean {
  return (
    game.playtimeHours >= 10 ||
    (game.playtimeRecentHours ?? 0) > 0 ||
    (indexInSortedByHours < 25 && game.playtimeHours >= 2)
  );
}

// ============================================================================
// 5. INFER GAME METADATA AND VECTOR (KB Lookup + 32D Heuristic Inference)
// ============================================================================

export interface InferredGameMetadata {
  category: string;
  tags: string[];
  tagVotes?: Record<string, number>;
  genres: string[];
  minPlayers: number;
  maxPlayers: number;
  isMultiplayer: boolean;
  vector: Record<TasteDimensionKey, number>;
  description?: string;
  coverUrl?: string;
}

export function inferGameMetadataAndVector(params: {
  name: string;
  steamAppId?: number;
  rawGenres?: string[];
  rawTags?: string[];
  category?: string;
  minPlayers?: number;
  maxPlayers?: number;
}): InferredGameMetadata {
  const normName = normalizeGameName(params.name);

  // 1. Check GLOBAL_GAMES_KNOWLEDGE_BASE by steamAppId or normalized name
  const kbEntry = GLOBAL_GAMES_KNOWLEDGE_BASE.find(kb => {
    if (params.steamAppId && kb.steamAppId === params.steamAppId) return true;
    return normalizeGameName(kb.name) === normName;
  });

  if (kbEntry) {
    const fullVector = createZeroVector();
    for (const [key, val] of Object.entries(kbEntry.weights) as Array<[TasteDimensionKey, number]>) {
      if (typeof val === 'number') {
        fullVector[key] = val;
      }
    }
    return {
      category: params.category || kbEntry.category,
      tags: params.rawTags && params.rawTags.length > 0 ? params.rawTags : [...kbEntry.tags],
      genres: params.rawGenres && params.rawGenres.length > 0 ? params.rawGenres : [...kbEntry.genres],
      minPlayers: params.minPlayers ?? kbEntry.minPlayers,
      maxPlayers: params.maxPlayers ?? kbEntry.maxPlayers,
      isMultiplayer: kbEntry.isMultiplayer,
      vector: fullVector,
      description: kbEntry.description,
      coverUrl: kbEntry.coverUrl,
    };
  }

  // 2. Heuristic inference across all 32 dimensions
  const tagsLower = (params.rawTags || []).map(t => t.toLowerCase());
  const genresLower = (params.rawGenres || []).map(g => g.toLowerCase());
  const nameLower = params.name.toLowerCase();
  const cat = params.category || inferCategoryFromTags(tagsLower, genresLower, nameLower);

  const vector = createZeroVector();

  // Helper to test presence in tags, genres, or name
  const has = (terms: string[]): boolean =>
    terms.some(term => {
      const t = term.toLowerCase();
      return (
        tagsLower.some(tag => tag.includes(t)) ||
        genresLower.some(genre => genre.includes(t)) ||
        nameLower.includes(t)
      );
    });

  // --- Dimension Heuristics ---
  if (has(['tactical', 'shooter', 'fps', 'sniper', 'counter-strike', 'cs', 'rainbow six', 'siege', 'milsim', 'valorant'])) {
    vector.tactical_shooter = 0.85;
    vector.mechanical_skill = Math.max(vector.mechanical_skill, 0.7);
    vector.intensity_high = Math.max(vector.intensity_high, 0.7);
  }
  if (has(['hero shooter', 'arena shooter', 'overwatch', 'team fortress', 'marvel rivals', 'paladins', 'class-based'])) {
    vector.arena_hero_shooter = 0.85;
    vector.asymmetric_roles = Math.max(vector.asymmetric_roles, 0.8);
    vector.intensity_high = Math.max(vector.intensity_high, 0.7);
  }
  if (has(['battle royale', 'last man standing', 'pubg', 'warzone', 'apex', 'fortnite'])) {
    vector.battle_royale = 0.9;
    vector.pvp_competitive = Math.max(vector.pvp_competitive, 0.85);
    vector.intensity_high = Math.max(vector.intensity_high, 0.8);
  }
  if (has(['moba', 'dota', 'league of legends', 'smite', 'lane defense'])) {
    vector.moba = 0.95;
    vector.tactical_depth = Math.max(vector.tactical_depth, 0.85);
    vector.asymmetric_roles = Math.max(vector.asymmetric_roles, 0.85);
    vector.pvp_competitive = Math.max(vector.pvp_competitive, 0.85);
  }
  if (has(['rts', 'strategy', 'estrategia', 'real-time strategy', '4x', 'grand strategy', 'civilization', 'crusader kings', 'total war'])) {
    vector.rts_strategy = 0.85;
    vector.tactical_depth = Math.max(vector.tactical_depth, 0.9);
  }
  if (has(['survival', 'crafting', 'crafteo', 'base building', 'supervivencia', 'rust', 'valheim', 'zomboid', 'raft'])) {
    vector.survival_craft = 0.85;
    vector.sandbox_freedom = Math.max(vector.sandbox_freedom, 0.75);
    vector.open_world_exploration = Math.max(vector.open_world_exploration, 0.7);
    vector.progression_loot = Math.max(vector.progression_loot, 0.65);
  }
  if (has(['horror', 'terror', 'psychological horror', 'fantasmas', 'lethal company', 'phasmophobia', 'dead by daylight'])) {
    vector.coop_horror = 0.8;
    vector.horror_tension = 0.85;
    vector.dark_gritty = Math.max(vector.dark_gritty, 0.75);
  }
  if (has(['co-op', 'cooperativo', 'online co-op', 'pve', 'helldivers', 'deep rock', 'left 4 dead', 'payday'])) {
    vector.coop_pve_action = 0.8;
    vector.pve_cooperative = 0.9;
    vector.squad_coordination = Math.max(vector.squad_coordination, 0.8);
  }
  if (has(['rpg', 'rol', 'role-playing', 'story rich', 'narrative', 'jrpg', 'arpg', 'baldurs gate', 'witcher', 'cyberpunk'])) {
    vector.rpg_narrative = 0.85;
    vector.long_campaign = Math.max(vector.long_campaign, 0.8);
    vector.progression_loot = Math.max(vector.progression_loot, 0.75);
  }
  if (has(['party', 'casual', 'minigames', 'social deduction', 'deducción social', 'among us', 'fall guys', 'golf'])) {
    vector.party_social = 0.85;
    vector.social_deduction_chaos = Math.max(vector.social_deduction_chaos, 0.8);
    vector.short_session = Math.max(vector.short_session, 0.75);
    vector.chill_relaxed = Math.max(vector.chill_relaxed, 0.65);
  }
  if (has(['sports', 'racing', 'carreras', 'driving', 'soccer', 'football', 'fifa', 'rocket league', 'autos'])) {
    vector.sports_racing = 0.85;
    vector.mechanical_skill = Math.max(vector.mechanical_skill, 0.7);
    vector.short_session = Math.max(vector.short_session, 0.7);
  }
  if (has(['roguelike', 'roguelite', 'deckbuilder', 'card game', 'cartas', 'balatro', 'slay the spire', 'hades'])) {
    vector.roguelike_deckbuilder = 0.9;
    vector.tactical_depth = Math.max(vector.tactical_depth, 0.7);
    vector.progression_loot = Math.max(vector.progression_loot, 0.7);
  }

  // Pace heuristics
  if (has(['fast-paced', 'intense', 'hardcore', 'fps', 'competitive', 'souls-like', 'bullet hell'])) {
    vector.intensity_high = Math.max(vector.intensity_high, 0.8);
  }
  if (has(['relaxing', 'chill', 'cozy', 'farming', 'calm', 'peaceful', 'stardew'])) {
    vector.chill_relaxed = Math.max(vector.chill_relaxed, 0.85);
  }
  if (has(['tactical', 'strategy', 'complex', 'management', 'simulation', 'deep'])) {
    vector.tactical_depth = Math.max(vector.tactical_depth, 0.85);
  }
  if (has(['difficult', 'precise', 'aim', 'esports', 'mechanical', 'reflexes', 'souls-like', 'parry'])) {
    vector.mechanical_skill = Math.max(vector.mechanical_skill, 0.8);
  }
  if (has(['arcade', 'quick', 'round-based', 'short', 'party', 'match'])) {
    vector.short_session = Math.max(vector.short_session, 0.75);
  }
  if (has(['open world', 'mmo', 'campaign', 'epic', 'long', 'adventure', 'hours'])) {
    vector.long_campaign = Math.max(vector.long_campaign, 0.8);
  }

  // Social dynamics
  if (has(['pvp', 'multiplayer', 'competitive', 'ranked', 'versus'])) {
    vector.pvp_competitive = Math.max(vector.pvp_competitive, 0.85);
  }
  if (has(['co-op', 'cooperative', 'pve', 'teamwork', 'escudería'])) {
    vector.pve_cooperative = Math.max(vector.pve_cooperative, 0.85);
    vector.squad_coordination = Math.max(vector.squad_coordination, 0.75);
  }
  if (has(['sandbox', 'open world', 'creativity', 'moddable', 'physics', 'building'])) {
    vector.sandbox_freedom = Math.max(vector.sandbox_freedom, 0.85);
  }

  // Aesthetic
  if (has(['dark', 'grim', 'apocalyptic', 'zombies', 'post-apocalyptic', 'mature', 'gore'])) {
    vector.dark_gritty = Math.max(vector.dark_gritty, 0.8);
  }
  if (has(['sci-fi', 'futuristic', 'space', 'aliens', 'cyberpunk', 'robots'])) {
    vector.scifi_futuristic = Math.max(vector.scifi_futuristic, 0.85);
  }
  if (has(['fantasy', 'medieval', 'magic', 'swords', 'dragons', 'mythology'])) {
    vector.fantasy_medieval = Math.max(vector.fantasy_medieval, 0.85);
  }
  if (has(['military', 'war', 'realistic', 'milsim', 'ww2', 'army'])) {
    vector.realistic_military = Math.max(vector.realistic_military, 0.85);
  }
  if (has(['stylized', 'colorful', 'cartoon', 'anime', 'pixel graphics', 'cute'])) {
    vector.stylized_colorful = Math.max(vector.stylized_colorful, 0.8);
  }
  if (has(['open world', 'exploration', 'adventure', 'sandbox'])) {
    vector.open_world_exploration = Math.max(vector.open_world_exploration, 0.8);
  }
  if (has(['loot', 'looter', 'progression', 'leveling', 'equipment', 'upgrade', 'arpg'])) {
    vector.progression_loot = Math.max(vector.progression_loot, 0.8);
  }

  // Multiplayer player counts heuristic
  const isMultiplayer =
    has(['multiplayer', 'co-op', 'online co-op', 'pvp', 'mmo', 'massively multiplayer']) ||
    cat === 'Shooter Táctico' ||
    cat === 'MOBA' ||
    cat === 'Party Casual' ||
    cat === 'Deportes / Autos';

  const minPlayers = params.minPlayers ?? 1;
  const maxPlayers =
    params.maxPlayers ??
    (isMultiplayer
      ? cat === 'Party Casual'
        ? 8
        : cat === 'Shooter Táctico' || cat === 'MOBA'
        ? 5
        : cat === 'RTS'
        ? 8
        : 4
      : 1);

  return {
    category: cat,
    tags: params.rawTags || [],
    genres: params.rawGenres || [],
    minPlayers,
    maxPlayers,
    isMultiplayer,
    vector,
    description: `Título detectado automáticamente: ${params.name}`,
    coverUrl: params.steamAppId ? steamHeaderUrl(params.steamAppId) : undefined,
  };
}

function inferCategoryFromTags(tags: string[], genres: string[], name: string): string {
  const allText = [...tags, ...genres, name].join(' ').toLowerCase();
  if (allText.includes('shooter') || allText.includes('fps') || allText.includes('tactical')) return 'Shooter Táctico';
  if (allText.includes('moba') || allText.includes('dota') || allText.includes('league')) return 'MOBA';
  if (allText.includes('horror') || allText.includes('terror') || allText.includes('phasmo')) return 'Co-op Horror';
  if (allText.includes('survival') || allText.includes('sandbox') || allText.includes('crafting')) return 'Survival Sandbox';
  if (allText.includes('rts') || allText.includes('strategy') || allText.includes('estrategia')) return 'RTS';
  if (allText.includes('party') || allText.includes('minigame') || allText.includes('deduction')) return 'Party Casual';
  if (allText.includes('sports') || allText.includes('racing') || allText.includes('soccer')) return 'Deportes / Autos';
  if (allText.includes('rpg') || allText.includes('adventure') || allText.includes('story')) return 'RPG / Aventura';
  return 'Co-op Acción';
}

function createZeroVector(): Record<TasteDimensionKey, number> {
  const vec: Partial<Record<TasteDimensionKey, number>> = {};
  for (const dim of TASTE_DIMENSIONS) {
    vec[dim.key] = 0;
  }
  return vec as Record<TasteDimensionKey, number>;
}

// ============================================================================
// 6. ENRICH AND SORT STEAM LIBRARY
// ============================================================================

export interface EnrichedSteamLibraryResult {
  games: SteamOwnedGame[];
  ownedGames: SteamOwnedGame[];
  totalHours: number;
  considerableGamesCount: number;
}

export function enrichAndSortSteamLibrary(
  rawGames: Array<{
    appId: number;
    igdbId?: number;
    name: string;
    playtimeHours: number;
    playtimeRecentHours: number;
    headerImageUrl: string;
    iconUrl?: string;
    lastPlayedAt?: string;
    genres?: string[];
    tags?: string[];
    tagVotes?: Record<string, number>;
    isMultiplayer?: boolean;
    minPlayers?: number;
    maxPlayers?: number;
    source?: 'igdb' | 'steam' | 'curated';
  }>
): EnrichedSteamLibraryResult {
  const validRawGames = rawGames.filter(
    rg =>
      !isNonGameSteamApp({
        appId: rg.appId,
        name: rg.name,
        genres: rg.genres,
        tags: rg.tags,
        tagVotes: rg.tagVotes,
      })
  );

  const allHoursDescending = validRawGames
    .map(g => g.playtimeHours)
    .sort((a, b) => b - a);

  const totalHoursRaw = validRawGames.reduce((acc, g) => acc + (g.playtimeHours || 0), 0);
  const totalHours = Math.round(totalHoursRaw * 10) / 10;

  // Enrich each game with inferred metadata and suggested rating
  const enriched: SteamOwnedGame[] = validRawGames.map(rg => {
    const meta = inferGameMetadataAndVector({
      name: rg.name,
      steamAppId: rg.appId,
      rawGenres: rg.genres,
      rawTags: rg.tags,
      minPlayers: rg.minPlayers,
      maxPlayers: rg.maxPlayers,
    });
    const suggestedRating = computeSuggestedRatingFromHours(rg.playtimeHours, allHoursDescending);

    return {
      appId: rg.appId,
      igdbId: rg.igdbId,
      name: rg.name,
      playtimeHours: rg.playtimeHours,
      playtimeRecentHours: rg.playtimeRecentHours || 0,
      headerImageUrl: rg.headerImageUrl,
      iconUrl: rg.iconUrl,
      lastPlayedAt: rg.lastPlayedAt,
      genres: rg.genres && rg.genres.length > 0 ? rg.genres : meta.genres,
      tags: rg.tags && rg.tags.length > 0 ? rg.tags : meta.tags,
      ...(rg.tagVotes ? { tagVotes: rg.tagVotes } : {}),
      isMultiplayer: rg.isMultiplayer ?? meta.isMultiplayer,
      minPlayers: rg.minPlayers ?? meta.minPlayers,
      maxPlayers: rg.maxPlayers ?? meta.maxPlayers,
      suggestedRating,
      source: rg.source,
    };
  });

  // Sort initially by composite playtime score to determine considerable rank
  enriched.sort((a, b) => {
    const scoreA = a.playtimeHours + a.playtimeRecentHours * 1.5;
    const scoreB = b.playtimeHours + b.playtimeRecentHours * 1.5;
    return scoreB - scoreA;
  });

  const considerableGames: SteamOwnedGame[] = [];
  const nonConsiderableGames: SteamOwnedGame[] = [];

  enriched.forEach((game, idx) => {
    if (isConsiderableSteamGame(game, idx)) {
      considerableGames.push(game);
    } else {
      nonConsiderableGames.push(game);
    }
  });

  const considerableGamesCount = considerableGames.length;
  // Final sort: considerable games first, both sets sorted descending by hours/recent
  const finalGames = [...considerableGames, ...nonConsiderableGames];

  return {
    games: finalGames,
    ownedGames: finalGames,
    totalHours,
    considerableGamesCount,
  };
}

// ============================================================================
// 7. BUILD PLAYER TASTE VECTOR (Strict Unit L2 Normalization)
// ============================================================================

export type PlayerTasteVector = Record<TasteDimensionKey, number> & {
  topDimensions?: Array<{ key: TasteDimensionKey; label: string; score: number }>;
};

export function buildPlayerTasteVector(
  player: PlayerProfile,
  allPreferences: UserGamePreference[],
  catalogGames: Game[]
): PlayerTasteVector {
  const accumulator: Record<TasteDimensionKey, number> = createZeroVector();
  const seenNormNames = new Set<string>();
  const seenSteamAppIds = new Set<number>();

  const hasSeenGame = (name: string, appId?: number): boolean => {
    if (appId !== undefined && appId > 0 && seenSteamAppIds.has(appId)) {
      return true;
    }
    const norm = normalizeGameName(name);
    return Boolean(norm && seenNormNames.has(norm));
  };

  const markSeenGame = (name: string, appId?: number): void => {
    if (appId !== undefined && appId > 0) {
      seenSteamAppIds.add(appId);
    }
    const norm = normalizeGameName(name);
    if (norm) {
      seenNormNames.add(norm);
    }
  };

  const isGameBurnedOut = (name: string, appId?: number): boolean => {
    const norm = normalizeGameName(name);
    const burnedOnSteam = (player.steamProfile?.ownedGames || []).some(
      g =>
        Boolean(g.burnedOut) &&
        ((appId !== undefined && appId > 0 && g.appId === appId) ||
          (norm !== '' && normalizeGameName(g.name) === norm))
    );
    if (burnedOnSteam) return true;
    return (player.tasteProfile?.externalGames || []).some(
      ext =>
        Boolean(ext.burnedOut) &&
        ((appId !== undefined && appId > 0 && ext.steamAppId === appId) ||
          (norm !== '' && normalizeGameName(ext.name) === norm))
    );
  };

  const addWeights = (weights: Partial<Record<TasteDimensionKey, number>>, multiplier: number) => {
    for (const [key, val] of Object.entries(weights) as Array<[TasteDimensionKey, number]>) {
      if (typeof val === 'number') {
        accumulator[key] = (accumulator[key] || 0) + val * multiplier;
      }
    }
  };

  // 1. Top Multiplayer Games Podium (Rank 1: 3.2, Rank 2: 2.5, Rank 3: 2.0)
  const mpPodium = player.tasteProfile?.topMultiplayerGames || [];
  for (const entry of mpPodium) {
    if (isNonGameSteamApp({ steamAppId: entry.steamAppId, name: entry.name, tags: entry.tags })) {
      continue;
    }
    if (hasSeenGame(entry.name, entry.steamAppId)) {
      continue;
    }
    let mult = entry.rank === 1 ? 3.2 : entry.rank === 2 ? 2.5 : 2.0;
    if (isGameBurnedOut(entry.name, entry.steamAppId)) {
      mult = Math.min(mult, 0.2);
    }
    const meta = inferGameMetadataAndVector({
      name: entry.name,
      steamAppId: entry.steamAppId,
      category: entry.category,
      rawTags: entry.tags,
    });
    addWeights(meta.vector, mult);
    markSeenGame(entry.name, entry.steamAppId);
  }

  // 2. Top Singleplayer Games Podium (Rank 1: 2.2, Rank 2: 1.7, Rank 3: 1.3)
  const spPodium = player.tasteProfile?.topSingleplayerGames || [];
  for (const entry of spPodium) {
    if (isNonGameSteamApp({ steamAppId: entry.steamAppId, name: entry.name, tags: entry.tags })) {
      continue;
    }
    if (hasSeenGame(entry.name, entry.steamAppId)) {
      continue;
    }
    let mult = entry.rank === 1 ? 2.2 : entry.rank === 2 ? 1.7 : 1.3;
    if (isGameBurnedOut(entry.name, entry.steamAppId)) {
      mult = Math.min(mult, 0.2);
    }
    const meta = inferGameMetadataAndVector({
      name: entry.name,
      steamAppId: entry.steamAppId,
      category: entry.category,
      rawTags: entry.tags,
    });
    addWeights(meta.vector, mult);
    markSeenGame(entry.name, entry.steamAppId);
  }

  // 3. Steam Owned Games (Log-scaled playtime normalized by 95th percentile, burnout handling)
  const ownedGames = (player.steamProfile?.ownedGames || []).filter(
    g => g.playsOverride !== false && !isNonGameSteamApp(g)
  );
  if (ownedGames.length > 0) {
    const nonZeroHours = ownedGames
      .map(g => g.manualHoursOverride ?? g.playtimeHours ?? 0)
      .filter(h => h > 0)
      .sort((a, b) => a - b);
    const p95 =
      nonZeroHours.length > 0
        ? nonZeroHours[Math.floor(nonZeroHours.length * 0.95)] || nonZeroHours[nonZeroHours.length - 1]
        : 50;
    const normalizer = Math.max(10, p95);

    for (const game of ownedGames) {
      if (hasSeenGame(game.name, game.appId)) continue;
      const hours = game.manualHoursOverride ?? game.playtimeHours ?? 0;
      const recent = game.manualRecentHoursOverride ?? game.playtimeRecentHours ?? 0;
      if (hours <= 0 && recent <= 0) continue;

      let logNormHours = Math.log1p(hours) / Math.log1p(normalizer);
      if (recent > 0) {
        logNormHours *= 1.25;
      }

      // Sentiment multiplier
      const rating = game.userRating ?? game.suggestedRating ?? 3;
      let sentimentMult = 0.55;
      if (rating === 5) sentimentMult = 1.5;
      else if (rating === 4) sentimentMult = 1.0;
      else if (rating === 3) sentimentMult = 0.55;
      else if (rating === 2) sentimentMult = 0.15;
      else if (rating === 1) sentimentMult = -0.6;

      let effectiveWeight = logNormHours * sentimentMult;

      // Burnout handling: preserve at most 0.2 historical genre affinity
      if (game.burnedOut) {
        effectiveWeight = Math.min(effectiveWeight, 0.2);
      }

      const meta = inferGameMetadataAndVector({
        name: game.name,
        steamAppId: game.appId,
        rawGenres: game.genres,
        rawTags: game.tags,
      });

      addWeights(meta.vector, effectiveWeight);
      markSeenGame(game.name, game.appId);
    }
  }

  // 4. External Rated Games
  const extGames = player.tasteProfile?.externalGames || [];
  for (const ext of extGames) {
    if (
      isNonGameSteamApp({
        steamAppId: ext.steamAppId,
        name: ext.name,
        tags: ext.tags,
        tagVotes: ext.tagVotes,
      })
    ) {
      continue;
    }
    if (hasSeenGame(ext.name, ext.steamAppId)) continue;

    const hours =
      ext.hoursPlayedEstimate && ext.hoursPlayedEstimate > 0 ? ext.hoursPlayedEstimate : 25;
    const logNorm = Math.log1p(hours) / Math.log1p(100);
    const rating = ext.rating ?? 3;
    let sentimentMult = 0.55;
    if (rating === 5) sentimentMult = 1.5;
    else if (rating === 4) sentimentMult = 1.0;
    else if (rating === 3) sentimentMult = 0.55;
    else if (rating === 2) sentimentMult = 0.15;
    else if (rating === 1) sentimentMult = -0.6;

    let effectiveWeight = logNorm * sentimentMult;
    if (ext.burnedOut) {
      effectiveWeight = Math.min(effectiveWeight, 0.2);
    }

    const meta = inferGameMetadataAndVector({
      name: ext.name,
      steamAppId: ext.steamAppId,
      category: ext.category,
      rawTags: ext.tags,
    });
    addWeights(meta.vector, effectiveWeight);
    markSeenGame(ext.name, ext.steamAppId);
  }

  // 5. UserGamePreferences & Category Preferences
  const userPrefs = allPreferences.filter(p => p.userId === player.id && p.plays);
  for (const pref of userPrefs) {
    const catGame = catalogGames.find(g => g.id === pref.gameId);
    if (catGame && !isNonGameSteamApp({ name: catGame.name, tags: catGame.tags })) {
      const catAppId = extractSteamAppIdFromCatalogTags(catGame.tags);
      if (hasSeenGame(catGame.name, catAppId)) continue;

      let prefMult = 0.4;
      if (pref.rating === 5) prefMult = 1.2;
      else if (pref.rating === 4) prefMult = 0.8;
      else if (pref.rating === 3) prefMult = 0.4;
      else if (pref.rating === 2) prefMult = 0.1;
      else if (pref.rating === 1) prefMult = -0.5;

      const meta = inferGameMetadataAndVector({
        name: catGame.name,
        steamAppId: catAppId,
        category: catGame.category,
        rawTags: catGame.tags,
      });
      addWeights(meta.vector, prefMult);
      markSeenGame(catGame.name, catAppId);
    }
  }

  if (player.categoryPreferences) {
    for (const [catName, prefLevel] of Object.entries(player.categoryPreferences)) {
      const dims = CATEGORY_TO_DIMENSIONS_MAP[catName] || [];
      const delta = prefLevel === 'like' ? 0.35 : prefLevel === 'dislike' ? -0.35 : 0;
      if (delta !== 0) {
        for (const dim of dims) {
          accumulator[dim] = (accumulator[dim] || 0) + delta;
        }
      }
    }
  }

  // Positive clamp
  for (const dim of TASTE_DIMENSIONS) {
    accumulator[dim.key] = Math.max(0, accumulator[dim.key] || 0);
  }

  // Strict Unit L2 Normalization (||v|| = 1.0)
  let sumSq = 0;
  for (const dim of TASTE_DIMENSIONS) {
    const val = accumulator[dim.key];
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);

  const normalizedVector: Record<TasteDimensionKey, number> = createZeroVector();
  if (norm > 0.000001) {
    for (const dim of TASTE_DIMENSIONS) {
      normalizedVector[dim.key] = accumulator[dim.key] / norm;
    }
  } else {
    // Uniform unit vector fallback
    const uniform = 1 / Math.sqrt(TASTE_DIMENSIONS.length);
    for (const dim of TASTE_DIMENSIONS) {
      normalizedVector[dim.key] = uniform;
    }
  }

  // Extract top 6 dimensions with relative 0..100 scores
  const topDimensions = extractTopDimensions(normalizedVector, 6);

  const result = normalizedVector as PlayerTasteVector;
  result.topDimensions = topDimensions;
  return result;
}

export function extractTopDimensions(
  vector: Partial<Record<TasteDimensionKey, number>>,
  limit = 6
): Array<{ key: TasteDimensionKey; label: string; score: number }> {
  const sorted = TASTE_DIMENSIONS.map(d => ({
    key: d.key,
    label: d.label,
    value: vector[d.key] || 0,
  })).sort((a, b) => b.value - a.value);

  const maxVal = sorted.length > 0 && sorted[0].value > 0 ? sorted[0].value : 1;

  return sorted.slice(0, limit).map(d => ({
    key: d.key,
    label: d.label,
    score: Math.min(100, Math.max(0, Math.round((d.value / maxVal) * 100))),
  }));
}

export function buildPlayerTasteProfile(
  player: PlayerProfile,
  allPreferences: UserGamePreference[],
  catalogGames: Game[]
): PlayerTasteProfile {
  const tasteVector = buildPlayerTasteVector(player, allPreferences, catalogGames);

  return {
    topMultiplayerGames: player.tasteProfile?.topMultiplayerGames || [],
    topSingleplayerGames: player.tasteProfile?.topSingleplayerGames || [],
    externalGames: player.tasteProfile?.externalGames || [],
    catalogGameHours: player.tasteProfile?.catalogGameHours || {},
    featureVector: tasteVector,
    topDimensions: tasteVector.topDimensions,
    pvjProfile: computePlayerPvj6dProfile(player, allPreferences, catalogGames),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 8. SCORE GAME FOR PLAYER (Cosine Similarity & Direct Preference Calibration)
// ============================================================================

export function scoreGameForPlayer(
  game: Game | KnowledgeGameEntry | SteamOwnedGame,
  player: PlayerProfile,
  playerVector: Record<TasteDimensionKey, number> | PlayerTasteVector,
  allPreferences: UserGamePreference[]
): PlayerAffinityBreakdown {
  const normGameName = normalizeGameName(game.name);

  const rawAppId =
    'appId' in game && typeof (game as { appId?: number }).appId === 'number'
      ? (game as { appId: number }).appId
      : 'steamAppId' in game && typeof (game as { steamAppId?: number }).steamAppId === 'number'
      ? (game as { steamAppId: number }).steamAppId
      : undefined;

  const rawGenres =
    'genres' in game && Array.isArray((game as { genres?: string[] }).genres)
      ? (game as { genres: string[] }).genres
      : undefined;

  const rawTags =
    'tags' in game && Array.isArray((game as { tags?: string[] }).tags)
      ? (game as { tags: string[] }).tags
      : undefined;

  const rawCategory =
    'category' in game && typeof (game as { category?: string }).category === 'string'
      ? (game as { category: string }).category
      : undefined;

  // Infer game metadata and 32D vector
  const gameMeta = inferGameMetadataAndVector({
    name: game.name,
    steamAppId: rawAppId,
    rawGenres,
    rawTags,
    category: rawCategory,
  });

  // Normalize game vector to Unit L2
  let gameSumSq = 0;
  for (const dim of TASTE_DIMENSIONS) {
    const val = gameMeta.vector[dim.key] || 0;
    gameSumSq += val * val;
  }
  const gameNorm = Math.sqrt(gameSumSq);
  const normalizedGameVector: Record<TasteDimensionKey, number> = createZeroVector();
  if (gameNorm > 0.000001) {
    for (const dim of TASTE_DIMENSIONS) {
      normalizedGameVector[dim.key] = (gameMeta.vector[dim.key] || 0) / gameNorm;
    }
  } else {
    const uniform = 1 / Math.sqrt(TASTE_DIMENSIONS.length);
    for (const dim of TASTE_DIMENSIONS) {
      normalizedGameVector[dim.key] = uniform;
    }
  }

  // Cosine dot product
  let dotProduct = 0;
  for (const dim of TASTE_DIMENSIONS) {
    dotProduct += (playerVector[dim.key] || 0) * (normalizedGameVector[dim.key] || 0);
  }
  dotProduct = Math.max(0, Math.min(1, dotProduct));

  // Non-linear calibration: dot product to base 0..100 score
  let baseScore = Math.round(Math.pow(dotProduct, 0.72) * 94);

  // Check Steam owned game match
  const steamMatch = player.steamProfile?.ownedGames?.find(
    g =>
      (rawAppId !== undefined && g.appId === rawAppId) ||
      normalizeGameName(g.name) === normGameName
  );
  const activeSteamMatch =
    steamMatch && steamMatch.playsOverride !== false ? steamMatch : undefined;

  // Check External rated game match
  const extMatch = player.tasteProfile?.externalGames?.find(
    e => normalizeGameName(e.name) === normGameName
  );

  // Check UserGamePreference in catalog
  const gameCatalogId = 'id' in game && typeof (game as { id?: string }).id === 'string'
    ? (game as { id: string }).id
    : undefined;

  const userPref = gameCatalogId
    ? allPreferences.find(p => p.userId === player.id && p.gameId === gameCatalogId)
    : undefined;

  // Check Top Multiplayer or Singleplayer podium
  const mpPodiumEntry = player.tasteProfile?.topMultiplayerGames?.find(
    p =>
      normalizeGameName(p.name) === normGameName ||
      (rawAppId !== undefined && p.steamAppId === rawAppId)
  );
  const spPodiumEntry = player.tasteProfile?.topSingleplayerGames?.find(
    p =>
      normalizeGameName(p.name) === normGameName ||
      (rawAppId !== undefined && p.steamAppId === rawAppId)
  );
  const podiumEntry = mpPodiumEntry || spPodiumEntry;

  // Check Burnout status across all signals
  const isBurnedOut = Boolean(
    ('burnedOut' in game && game.burnedOut) ||
    steamMatch?.burnedOut ||
    extMatch?.burnedOut
  );

  const ownsOrPlays = Boolean(
    userPref?.plays ||
    activeSteamMatch ||
    extMatch ||
    podiumEntry
  );

  // Apply explicit preference bonuses/penalties
  if (podiumEntry) {
    if (podiumEntry.rank === 1) baseScore = Math.max(baseScore + 25, 96);
    else if (podiumEntry.rank === 2) baseScore = Math.max(baseScore + 20, 92);
    else if (podiumEntry.rank === 3) baseScore = Math.max(baseScore + 15, 88);
  }

  if (userPref) {
    if (userPref.rating === 5) baseScore = Math.max(baseScore + 16, 95);
    else if (userPref.rating === 4) baseScore = Math.max(baseScore + 10, 85);
    else if (userPref.rating === 3) baseScore += 2;
    else if (userPref.rating === 2) baseScore -= 12;
    else if (userPref.rating === 1) baseScore = Math.min(baseScore - 30, 25);
  }

  if (activeSteamMatch) {
    const rating = activeSteamMatch.userRating ?? activeSteamMatch.suggestedRating;
    if (rating === 5) baseScore = Math.max(baseScore + 12, 92);
    else if (rating === 4) baseScore = Math.max(baseScore + 8, 82);
    else if (rating === 1) baseScore = Math.min(baseScore - 20, 30);
  }

  if (extMatch) {
    if (extMatch.rating === 5) baseScore = Math.max(baseScore + 12, 92);
    else if (extMatch.rating === 4) baseScore = Math.max(baseScore + 8, 82);
    else if (extMatch.rating === 1) baseScore = Math.min(baseScore - 20, 30);
  }

  const catPref = player.categoryPreferences?.[gameMeta.category];
  if (catPref === 'like') baseScore += 6;
  else if (catPref === 'dislike') baseScore -= 15;

  // CRITICAL: Burnout suppression (affinity forced to <= 15)
  if (isBurnedOut) {
    baseScore = Math.min(baseScore, 15);
  }

  const affinityScore = Math.max(0, Math.min(100, Math.round(baseScore)));

  // Generate clear Spanish matching reasons
  const matchingReasons: string[] = [];
  if (isBurnedOut) {
    matchingReasons.push('Burnout registrado: Necesitás un descanso de este juego');
  } else {
    if (podiumEntry) {
      matchingReasons.push(
        `Top #${podiumEntry.rank} en tu podio ${mpPodiumEntry ? 'multiplayer' : 'singleplayer'}`
      );
    }
    const steamHours = activeSteamMatch
      ? activeSteamMatch.manualHoursOverride ?? activeSteamMatch.playtimeHours ?? 0
      : 0;
    if (activeSteamMatch && steamHours >= 15) {
      matchingReasons.push(`Jugaste ${Math.round(steamHours)}h en Steam`);
    } else if (extMatch && (extMatch.hoursPlayedEstimate ?? 0) >= 15) {
      matchingReasons.push(`Jugaste ~${extMatch.hoursPlayedEstimate}h en ${extMatch.platform}`);
    }
    if (userPref && userPref.rating >= 4) {
      matchingReasons.push(`Calificado con ${userPref.rating}★ en el club`);
    }

    // Top 2 shared dimensions by alignment product
    const sharedAlignment = TASTE_DIMENSIONS
      .map(dim => ({
        dim,
        product: (playerVector[dim.key] || 0) * (normalizedGameVector[dim.key] || 0),
      }))
      .filter(item => item.product > 0.015)
      .sort((a, b) => b.product - a.product)
      .slice(0, 2);

    if (sharedAlignment.length > 0) {
      const labels = sharedAlignment.map(s => s.dim.label).join(' & ');
      matchingReasons.push(`Encaja con tu ADN: ${labels}`);
    }

    if (catPref === 'like') {
      matchingReasons.push(`Coincide con tu categoría favorita (${gameMeta.category})`);
    }
  }

  return {
    userId: player.id,
    displayName: player.displayName,
    avatarUrl: player.avatarUrl,
    affinityScore,
    matchingReasons,
    ownsOrPlays,
    burnedOut: isBurnedOut,
  };
}

// ============================================================================
// 9. GROUP RECOMMENDATIONS ENGINE (Strict Equal-Weight Arithmetic Mean)
// ============================================================================

export interface GenerateGroupRecommendationsParams {
  targetPlayers: PlayerProfile[];
  catalogGames: Game[];
  preferences: UserGamePreference[];
  externalDiscoveryGames?: KnowledgeGameEntry[];
  maxResultsPerCategory?: number;
}

export interface GroupRecommendationsResult {
  readyToPlay: GroupGameRecommendation[];
  discovery: GroupGameRecommendation[];
  all: GroupGameRecommendation[];
}

export function generateGroupGameRecommendations(
  params: GenerateGroupRecommendationsParams
): GroupRecommendationsResult {
  const {
    targetPlayers,
    catalogGames,
    preferences,
    externalDiscoveryGames = [],
    maxResultsPerCategory = 8,
  } = params;

  if (!targetPlayers || targetPlayers.length === 0) {
    return { readyToPlay: [], discovery: [], all: [] };
  }

  const squadSize = targetPlayers.length;

  // 1. Build Unit L2 normalized taste vector for each target player
  const playerVectors: Record<string, PlayerTasteVector> = {};
  for (const player of targetPlayers) {
    playerVectors[player.id] = buildPlayerTasteVector(player, preferences, catalogGames);
  }

  // Filter helper: check if game supports the group size
  const supportsSquad = (minP: number, maxP: number): boolean => {
    if (squadSize <= 1) return maxP >= 1;
    const minThreshold = Math.max(3, Math.min(squadSize, 3));
    return maxP >= squadSize || maxP >= minThreshold;
  };

  // 2. Candidate Pool A: Ready To Play (from catalogGames)
  const readyCandidates = catalogGames.filter(
    g => supportsSquad(g.minPlayers, g.maxPlayers) && !isNonGameSteamApp({ name: g.name, tags: g.tags })
  );

  // 3. Candidate Pool B: Discovery (IGDB live pool + players' Steam MP libraries + Knowledge Base fallback)
  const catalogNames = new Set(catalogGames.map(g => normalizeGameName(g.name)));
  const seenDiscoveryNames = new Set<string>();
  const mergedDiscoveryPool: KnowledgeGameEntry[] = [];

  const appendDiscovery = (entry: KnowledgeGameEntry) => {
    if (
      isNonGameSteamApp({
        steamAppId: entry.steamAppId,
        name: entry.name,
        tags: entry.tags,
        genres: entry.genres,
      })
    ) {
      return;
    }
    const norm = normalizeGameName(entry.name);
    if (!norm || catalogNames.has(norm) || seenDiscoveryNames.has(norm)) return;
    if (!entry.isMultiplayer || entry.maxPlayers < 3) return;
    if (!supportsSquad(entry.minPlayers, entry.maxPlayers)) return;
    seenDiscoveryNames.add(norm);
    mergedDiscoveryPool.push(entry);
  };

  // 3a. Live IGDB / SteamSpy discovery feed
  for (const ext of externalDiscoveryGames) {
    appendDiscovery(ext);
  }

  // 3b. Multiplayer games already owned in friends' Steam libraries (not yet in club catalog)
  for (const player of targetPlayers) {
    for (const sg of player.steamProfile?.ownedGames || []) {
      if (isNonGameSteamApp(sg)) continue;
      if (sg.burnedOut || !sg.isMultiplayer || sg.maxPlayers < 3) continue;
      const meta = inferGameMetadataAndVector({
        name: sg.name,
        steamAppId: sg.appId,
        rawGenres: sg.genres,
        rawTags: sg.tags,
        minPlayers: sg.minPlayers,
        maxPlayers: sg.maxPlayers,
      });
      appendDiscovery({
        id: `steam-${sg.appId}`,
        steamAppId: sg.appId,
        name: sg.name,
        description:
          meta.description ||
          `Presente en la biblioteca Steam de ${player.displayName} (${sg.playtimeHours}h jugadas).`,
        category: meta.category,
        coverUrl: sg.headerImageUrl || meta.coverUrl || steamHeaderUrl(sg.appId),
        tags: sg.tags.length > 0 ? sg.tags : meta.tags,
        genres: sg.genres.length > 0 ? sg.genres : meta.genres,
        minPlayers: sg.minPlayers || meta.minPlayers,
        maxPlayers: sg.maxPlayers || meta.maxPlayers,
        isMultiplayer: true,
        weights: meta.vector,
      });
    }
  }

  // 3c. Curated knowledge base fallback (>= 3 players)
  for (const kb of GLOBAL_GAMES_KNOWLEDGE_BASE) {
    appendDiscovery(kb);
  }

  const discoveryCandidates = mergedDiscoveryPool;

  // Evaluator helper
  const evaluateCandidate = (
    game: Game | KnowledgeGameEntry,
    type: 'ready_to_play' | 'discovery'
  ): GroupGameRecommendation => {
    const breakdowns: PlayerAffinityBreakdown[] = targetPlayers.map(p =>
      scoreGameForPlayer(game, p, playerVectors[p.id], preferences)
    );

    // STRICT EQUAL-WEIGHT ARITHMETIC MEAN across all target players
    const totalAffinity = breakdowns.reduce((acc, b) => acc + b.affinityScore, 0);
    const groupArithmeticScore = Math.round(totalAffinity / targetPlayers.length);

    // Shared dimensions calculation
    const candidateSteamAppId =
      'steamAppId' in game && typeof (game as { steamAppId?: number }).steamAppId === 'number'
        ? (game as { steamAppId: number }).steamAppId
        : undefined;

    const candidateGenres =
      'genres' in game && Array.isArray((game as { genres?: string[] }).genres)
        ? (game as { genres: string[] }).genres
        : undefined;

    const gameMeta = inferGameMetadataAndVector({
      name: game.name,
      steamAppId: candidateSteamAppId,
      category: game.category,
      rawGenres: candidateGenres,
      rawTags: game.tags,
    });

    const sharedDimScores = TASTE_DIMENSIONS.map(dim => {
      const gWeight = gameMeta.vector[dim.key] || 0;
      const groupAvgP =
        targetPlayers.reduce((acc, p) => acc + (playerVectors[p.id][dim.key] || 0), 0) /
        targetPlayers.length;
      return {
        key: dim.key,
        label: dim.label,
        score: gWeight * groupAvgP,
      };
    })
      .filter(d => d.score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const sharedDimensions = sharedDimScores.map(d => d.label);

    // Clear Spanish explanation
    const highAffinityCount = breakdowns.filter(b => b.affinityScore >= 70).length;
    let explanation = '';
    if (sharedDimensions.length > 0) {
      explanation = `Afinidad grupal del ${groupArithmeticScore}%. Destaca por ${sharedDimensions.join(
        ' y '
      )} con ${highAffinityCount} de ${targetPlayers.length} jugadores en sintonía alta.`;
    } else {
      explanation = `Afinidad grupal del ${groupArithmeticScore}% promediada equitativamente para toda la escuadra.`;
    }

    return {
      id: `rec-${type}-${game.id}`,
      name: game.name,
      coverUrl: game.coverUrl,
      category: game.category,
      description: game.description || '',
      tags: game.tags || [],
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      groupArithmeticScore,
      recommendationType: type,
      catalogGameId: type === 'ready_to_play' ? game.id : undefined,
      sharedDimensions,
      explanation,
      playerBreakdowns: breakdowns,
    };
  };

  const readyToPlay = readyCandidates
    .map(g => evaluateCandidate(g, 'ready_to_play'))
    .sort((a, b) => b.groupArithmeticScore - a.groupArithmeticScore)
    .slice(0, maxResultsPerCategory);

  const discovery = discoveryCandidates
    .map(g => evaluateCandidate(g, 'discovery'))
    .sort((a, b) => b.groupArithmeticScore - a.groupArithmeticScore)
    .slice(0, maxResultsPerCategory);

  return {
    readyToPlay,
    discovery,
    all: [...readyToPlay, ...discovery],
  };
}

// ============================================================================
// 10. UNIFIED GAME SELECTOR & STEAM-DRIVEN LIKELIHOOD RANKING
// ============================================================================

export interface UnifiedSearchCandidate {
  igdbId?: number;
  appId?: number;
  steamAppId?: number;
  name: string;
  description?: string;
  summary?: string;
  headerImageUrl?: string;
  coverUrl?: string;
  category?: string;
  genres?: string[];
  tags?: string[];
  tagVotes?: Record<string, number>;
  isMultiplayer?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  rating?: number;
  source?: 'igdb' | 'steam' | 'curated';
  platform?: ExternalGamePlatform | string;
}

export interface BuildUnifiedSelectorInput {
  player: PlayerProfile;
  allPreferences: UserGamePreference[];
  catalogGames: Game[];
  discoveryGames?: UnifiedSearchCandidate[];
  liveSearchResults?: UnifiedSearchCandidate[];
}

interface MutableUnifiedSelectorEntry {
  key: string;
  name: string;
  coverUrl: string;
  category: string;
  tags: string[];
  tagVotes?: Record<string, number>;
  genres: string[];
  minPlayers: number;
  maxPlayers: number;
  isMultiplayer: boolean;
  platform: string;
  source: UnifiedSelectorSource;
  steamAppId?: number;
  igdbId?: number;
  catalogGameId?: string;
  externalGameId?: string;
  ownedOnSteam: boolean;
  steamPlaysOverride?: boolean;
  steamAutoCapExcluded?: boolean;
  steamRawHours?: number;
  steamRawRecentHours?: number;
  playtimeHours: number;
  playtimeRecentHours: number;
  isPlayedOrRatedByUser: boolean;
  effectiveRating: GameRating;
  hasExplicitUserRating: boolean;
  burnedOut: boolean;
  inClubCatalog: boolean;
  fromLiveSearch: boolean;
}

function normalizeUnitVector(
  rawVector: Partial<Record<TasteDimensionKey, number>>
): Record<TasteDimensionKey, number> {
  let sumSq = 0;
  for (const dim of TASTE_DIMENSIONS) {
    const val = rawVector[dim.key] || 0;
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq);
  const unit: Record<TasteDimensionKey, number> = createZeroVector();
  if (norm > 0.000001) {
    for (const dim of TASTE_DIMENSIONS) {
      unit[dim.key] = (rawVector[dim.key] || 0) / norm;
    }
  } else {
    const uniform = 1 / Math.sqrt(TASTE_DIMENSIONS.length);
    for (const dim of TASTE_DIMENSIONS) {
      unit[dim.key] = uniform;
    }
  }
  return unit;
}

function computeCosineSimilarity(
  a: Partial<Record<TasteDimensionKey, number>>,
  b: Partial<Record<TasteDimensionKey, number>>
): number {
  let dot = 0;
  for (const dim of TASTE_DIMENSIONS) {
    dot += (a[dim.key] || 0) * (b[dim.key] || 0);
  }
  return Math.max(0, Math.min(1, dot));
}

function mergeUniqueStrings(existing: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...existing, ...incoming]) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    merged.push(trimmed);
  }
  return merged;
}

function formatHoursCompact(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0';
  if (hours >= 10) return String(Math.round(hours));
  return String(Math.round(hours * 10) / 10);
}

function extractSteamAppIdFromCatalogTags(tags: string[]): number | undefined {
  for (const tag of tags) {
    if (tag.startsWith('steam:')) {
      const parsed = Number(tag.slice(6));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

function playerHasTasteSignal(
  player: PlayerProfile,
  userPrefs: UserGamePreference[]
): boolean {
  const hasPlayedSteam = (player.steamProfile?.ownedGames || []).some(
    g =>
      g.playsOverride !== false &&
      ((g.manualHoursOverride ?? g.playtimeHours ?? 0) > 0 ||
        (g.manualRecentHoursOverride ?? g.playtimeRecentHours ?? 0) > 0 ||
        g.userRating !== undefined ||
        g.playsOverride === true)
  );
  const hasPodium =
    (player.tasteProfile?.topMultiplayerGames?.length || 0) > 0 ||
    (player.tasteProfile?.topSingleplayerGames?.length || 0) > 0;
  const hasExternal = (player.tasteProfile?.externalGames?.length || 0) > 0;
  const hasPlayedPrefs = userPrefs.some(p => p.plays);
  const hasCatPrefs = Object.values(player.categoryPreferences || {}).some(
    v => v === 'like' || v === 'dislike'
  );
  return hasPlayedSteam || hasPodium || hasExternal || hasPlayedPrefs || hasCatPrefs;
}

function buildSteamTagAffinityMap(ownedGames: SteamOwnedGame[]): Map<string, number> {
  const weights = new Map<string, number>();
  let maxWeight = 0;

  for (const sg of ownedGames) {
    if (sg.playsOverride === false || isNonGameSteamApp(sg)) continue;
    const hours = sg.manualHoursOverride ?? sg.playtimeHours ?? 0;
    const recent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours ?? 0;
    if (hours < 1 && recent <= 0) continue;
    const baseWeight =
      (Math.log1p(hours) + recent * 0.35) *
      (sg.burnedOut ? 0.25 : 1);

    for (const label of [...sg.genres, ...sg.tags]) {
      const normLabel = label.trim().toLowerCase();
      if (!normLabel || normLabel.startsWith('steam:')) continue;
      const next = (weights.get(normLabel) || 0) + baseWeight;
      weights.set(normLabel, next);
      if (next > maxWeight) maxWeight = next;
    }
  }

  if (maxWeight > 0) {
    for (const [k, v] of weights.entries()) {
      weights.set(k, v / maxWeight);
    }
  }
  return weights;
}

function buildUnifiedLikelihoodBadge(params: {
  entry: MutableUnifiedSelectorEntry;
  tasteAffinityPct: number;
  hasTasteSignal: boolean;
  podiumMatch?: { type: 'MP' | 'SP'; rank: 1 | 2 | 3 };
}): string {
  const { entry, tasteAffinityPct, hasTasteSignal, podiumMatch } = params;
  if (entry.burnedOut) {
    return '🔥 Ya te quemó';
  }
  if (podiumMatch) {
    return `🏆 Podio ${podiumMatch.type} #${podiumMatch.rank}`;
  }
  if (entry.ownedOnSteam) {
    if (entry.playtimeHours >= 10 && entry.playtimeRecentHours > 0) {
      return `🔥 ${formatHoursCompact(entry.playtimeHours)}h Steam • ⚡ ${formatHoursCompact(
        entry.playtimeRecentHours
      )}h 2 sem`;
    }
    if (entry.playtimeRecentHours > 0) {
      return `⚡ ${formatHoursCompact(entry.playtimeRecentHours)}h recientes en Steam`;
    }
    if (entry.playtimeHours >= 10) {
      return `🔥 ${formatHoursCompact(entry.playtimeHours)}h en tu Steam`;
    }
    if (entry.playtimeHours > 0) {
      return `⏱️ ${formatHoursCompact(entry.playtimeHours)}h Steam • ${tasteAffinityPct}% afín`;
    }
  }
  if (entry.isPlayedOrRatedByUser && entry.hasExplicitUserRating) {
    return `⭐ ${entry.effectiveRating}★ en tu perfil (${entry.platform})`;
  }
  if (hasTasteSignal) {
    return `🎯 ${tasteAffinityPct}% afín a tu Steam`;
  }
  if (entry.inClubCatalog) {
    return '📚 Catálogo del Club';
  }
  return `🌐 ${entry.platform}`;
}

export const MAX_AUTO_SELECTED_STEAM_GAMES = 10;

export const GAME_POPULARITY_INDEX: Record<string, { recent: number; allTime: number }> = {
  // Major Non-Steam Titles
  'valorant': { recent: 92, allTime: 90 },
  'league of legends': { recent: 94, allTime: 98 },
  'fortnite': { recent: 93, allTime: 96 },
  'minecraft': { recent: 90, allTime: 99 },
  'rocket league': { recent: 82, allTime: 88 },
  'call of duty warzone': { recent: 86, allTime: 88 },
  'overwatch 2': { recent: 76, allTime: 82 },
  'teamfight tactics': { recent: 80, allTime: 80 },
  'world of warcraft': { recent: 78, allTime: 95 },
  'diablo iv': { recent: 74, allTime: 78 },
  'escape from tarkov': { recent: 77, allTime: 79 },
  'starcraft ii': { recent: 60, allTime: 84 },
  'fall guys': { recent: 66, allTime: 78 },
  'ea sports fc 25': { recent: 88, allTime: 82 },
  'ea sports fc 24': { recent: 72, allTime: 80 },
  'genshin impact': { recent: 85, allTime: 88 },
  'roblox': { recent: 91, allTime: 94 },

  // Major Steam Hits
  'counter strike 2': { recent: 97, allTime: 98 },
  'dota 2': { recent: 91, allTime: 96 },
  'pubg battlegrounds': { recent: 89, allTime: 93 },
  'apex legends': { recent: 84, allTime: 89 },
  'grand theft auto v': { recent: 87, allTime: 97 },
  'rust': { recent: 85, allTime: 88 },
  'helldivers 2': { recent: 86, allTime: 84 },
  'elden ring': { recent: 88, allTime: 94 },
  'baldur s gate 3': { recent: 87, allTime: 92 },
  'baldurs gate 3': { recent: 87, allTime: 92 },
  'lethal company': { recent: 80, allTime: 83 },
  'left 4 dead 2': { recent: 78, allTime: 91 },
  'tom clancy s rainbow six siege': { recent: 83, allTime: 88 },
  'tom clancys rainbow six siege': { recent: 83, allTime: 88 },
  'dead by daylight': { recent: 81, allTime: 85 },
  'phasmophobia': { recent: 79, allTime: 82 },
  'stardew valley': { recent: 84, allTime: 91 },
  'terraria': { recent: 82, allTime: 92 },
  'cyberpunk 2077': { recent: 84, allTime: 89 },
  'red dead redemption 2': { recent: 85, allTime: 93 },
  'the witcher 3 wild hunt': { recent: 80, allTime: 94 },
  'hollow knight': { recent: 78, allTime: 89 },
  'hades': { recent: 77, allTime: 87 },
  'palworld': { recent: 83, allTime: 84 },
  'valheim': { recent: 76, allTime: 84 },
  'among us': { recent: 74, allTime: 88 },
  'deep rock galactic': { recent: 79, allTime: 85 },
  'monster hunter world': { recent: 78, allTime: 86 },
  'dayz': { recent: 80, allTime: 83 },
  'payday 2': { recent: 71, allTime: 84 },
  'warframe': { recent: 82, allTime: 87 },
  'destiny 2': { recent: 79, allTime: 86 },
  'halo infinite': { recent: 68, allTime: 75 },
  'black myth wukong': { recent: 88, allTime: 86 },
  'path of exile 2': { recent: 89, allTime: 83 },
  'marvel rivals': { recent: 91, allTime: 84 },
};

function getGamePopularityScore(
  normKey: string,
  entry: Pick<MutableUnifiedSelectorEntry, 'source' | 'inClubCatalog' | 'ownedOnSteam'>
): number {
  const indexed = GAME_POPULARITY_INDEX[normKey];
  if (indexed) {
    return (indexed.recent * 0.55 + indexed.allTime * 0.45) * 9;
  }
  if (entry.inClubCatalog || entry.source === 'catalog') {
    return 260;
  }
  if (entry.source === 'knowledge_base') {
    return 220;
  }
  if (entry.source === 'igdb_discovery' || entry.source === 'live_search') {
    return 160;
  }
  if (entry.ownedOnSteam) {
    return 120;
  }
  return 100;
}

export function buildUnifiedGameSelectorList(
  input: BuildUnifiedSelectorInput
): UnifiedSelectorGame[] {
  const {
    player,
    allPreferences,
    catalogGames,
    discoveryGames = [],
    liveSearchResults = [],
  } = input;

  const ownedGames = (player.steamProfile?.ownedGames || []).filter(
    g => !isNonGameSteamApp(g)
  );
  const externalGames = (player.tasteProfile?.externalGames || []).filter(
    ext =>
      !isNonGameSteamApp({
        steamAppId: ext.steamAppId,
        name: ext.name,
        tags: ext.tags,
        tagVotes: ext.tagVotes,
      })
  );
  const catalogGameHours = player.tasteProfile?.catalogGameHours || {};
  const userPrefs = allPreferences.filter(p => p.userId === player.id);
  const prefByCatalogId = new Map<string, UserGamePreference>();
  for (const p of userPrefs) {
    prefByCatalogId.set(p.gameId, p);
  }

  const entriesMap = new Map<string, MutableUnifiedSelectorEntry>();
  const normBySteamAppId = new Map<number, string>();
  const normByIgdbId = new Map<number, string>();

  const resolveCanonicalKey = (
    name: string,
    steamAppId?: number,
    igdbId?: number
  ): string => {
    if (steamAppId !== undefined && normBySteamAppId.has(steamAppId)) {
      return normBySteamAppId.get(steamAppId)!;
    }
    if (igdbId !== undefined && normByIgdbId.has(igdbId)) {
      return normByIgdbId.get(igdbId)!;
    }
    return normalizeGameName(name);
  };

  const registerIds = (normKey: string, steamAppId?: number, igdbId?: number) => {
    if (steamAppId !== undefined && steamAppId > 0 && !normBySteamAppId.has(steamAppId)) {
      normBySteamAppId.set(steamAppId, normKey);
    }
    if (igdbId !== undefined && igdbId > 0 && !normByIgdbId.has(igdbId)) {
      normByIgdbId.set(igdbId, normKey);
    }
  };

  // 1. Owned Steam library games (auto-select at most top 10 played games by hours)
  const autoSelectedSteamAppIds = new Set<number>(
    [...ownedGames]
      .filter((sg) => {
        const effectiveHours = sg.manualHoursOverride ?? sg.playtimeHours ?? 0;
        const effectiveRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours ?? 0;
        return !sg.burnedOut && (effectiveHours >= 2 || effectiveRecent > 0);
      })
      .sort((a, b) => {
        const ha = a.manualHoursOverride ?? a.playtimeHours ?? 0;
        const hb = b.manualHoursOverride ?? b.playtimeHours ?? 0;
        if (hb !== ha) return hb - ha;
        const ra = a.manualRecentHoursOverride ?? a.playtimeRecentHours ?? 0;
        const rb = b.manualRecentHoursOverride ?? b.playtimeRecentHours ?? 0;
        return rb - ra;
      })
      .slice(0, MAX_AUTO_SELECTED_STEAM_GAMES)
      .map((sg) => sg.appId)
  );

  ownedGames.forEach((sg) => {
    const inferred = inferGameMetadataAndVector({
      name: sg.name,
      steamAppId: sg.appId,
      rawGenres: sg.genres,
      rawTags: sg.tags,
      minPlayers: sg.minPlayers,
      maxPlayers: sg.maxPlayers,
    });
    const normKey = resolveCanonicalKey(sg.name, sg.appId, sg.igdbId);
    if (!normKey) return;

    const effectiveHours = sg.manualHoursOverride ?? sg.playtimeHours ?? 0;
    const effectiveRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours ?? 0;

    const playedOrRated =
      sg.playsOverride !== undefined
        ? sg.playsOverride
        : sg.userRating !== undefined
        ? true
        : autoSelectedSteamAppIds.has(sg.appId);

    entriesMap.set(normKey, {
      key: `steam-${sg.appId}`,
      name: sg.name,
      coverUrl: sg.headerImageUrl || inferred.coverUrl || '',
      category: inferred.category,
      tags: mergeUniqueStrings(sg.tags || [], inferred.tags),
      ...(sg.tagVotes ? { tagVotes: sg.tagVotes } : {}),
      genres: mergeUniqueStrings(sg.genres || [], inferred.genres),
      minPlayers: Math.max(1, sg.minPlayers || inferred.minPlayers || 1),
      maxPlayers: Math.max(1, sg.maxPlayers || inferred.maxPlayers || 1),
      isMultiplayer: sg.isMultiplayer ?? inferred.isMultiplayer,
      platform: 'Steam',
      source: 'steam_owned',
      steamAppId: sg.appId,
      igdbId: sg.igdbId,
      ownedOnSteam: true,
      ...(sg.playsOverride !== undefined ? { steamPlaysOverride: sg.playsOverride } : {}),
      steamAutoCapExcluded: !playedOrRated,
      steamRawHours: sg.playtimeHours ?? 0,
      steamRawRecentHours: sg.playtimeRecentHours ?? 0,
      playtimeHours: effectiveHours,
      playtimeRecentHours: effectiveRecent,
      isPlayedOrRatedByUser: playedOrRated,
      effectiveRating: sg.userRating ?? sg.suggestedRating ?? 3,
      hasExplicitUserRating: sg.userRating !== undefined,
      burnedOut: Boolean(sg.burnedOut),
      inClubCatalog: Boolean(sg.selectedForCatalog),
      fromLiveSearch: false,
    });
    registerIds(normKey, sg.appId, sg.igdbId);
  });

  // 2. External rated / multi-launcher games
  for (const ext of externalGames) {
    const inferred = inferGameMetadataAndVector({
      name: ext.name,
      steamAppId: ext.steamAppId,
      category: ext.category,
      rawTags: ext.tags,
      minPlayers: ext.minPlayers,
      maxPlayers: ext.maxPlayers,
    });
    const normKey = resolveCanonicalKey(ext.name, ext.steamAppId, ext.igdbId);
    if (!normKey) continue;

    const existing = entriesMap.get(normKey);
    if (existing) {
      existing.externalGameId = ext.gameId;
      existing.igdbId = existing.igdbId ?? ext.igdbId;
      existing.steamAppId = existing.steamAppId ?? ext.steamAppId;
      existing.tags = mergeUniqueStrings(existing.tags, ext.tags || []);
      if (!existing.tagVotes && ext.tagVotes) {
        existing.tagVotes = ext.tagVotes;
      }
      existing.coverUrl = existing.coverUrl || ext.coverUrl || inferred.coverUrl || '';
      existing.isPlayedOrRatedByUser = true;
      existing.hasExplicitUserRating = true;
      existing.effectiveRating = ext.rating;
      existing.burnedOut = existing.burnedOut || Boolean(ext.burnedOut);
      if (!existing.ownedOnSteam) {
        existing.platform = ext.platform;
        existing.source = 'external_rated';
        if (ext.hoursPlayedEstimate !== undefined) {
          existing.playtimeHours = ext.hoursPlayedEstimate;
        }
        if (ext.recentHoursPlayed !== undefined) {
          existing.playtimeRecentHours = ext.recentHoursPlayed;
        }
      } else {
        if (existing.playtimeHours === 0 && (ext.hoursPlayedEstimate ?? 0) > 0) {
          existing.playtimeHours = ext.hoursPlayedEstimate!;
        }
        if (existing.playtimeRecentHours === 0 && (ext.recentHoursPlayed ?? 0) > 0) {
          existing.playtimeRecentHours = ext.recentHoursPlayed!;
        }
      }
    } else {
      entriesMap.set(normKey, {
        key: `ext-${ext.gameId}`,
        name: ext.name,
        coverUrl: ext.coverUrl || inferred.coverUrl || '',
        category: ext.category || inferred.category,
        tags: mergeUniqueStrings(ext.tags || [], inferred.tags),
        ...(ext.tagVotes ? { tagVotes: ext.tagVotes } : {}),
        genres: inferred.genres,
        minPlayers: Math.max(1, ext.minPlayers || inferred.minPlayers || 1),
        maxPlayers: Math.max(1, ext.maxPlayers || inferred.maxPlayers || 1),
        isMultiplayer: ext.isMultiplayer ?? inferred.isMultiplayer,
        platform: ext.platform,
        source: 'external_rated',
        steamAppId: ext.steamAppId,
        igdbId: ext.igdbId,
        externalGameId: ext.gameId,
        ownedOnSteam: false,
        playtimeHours: ext.hoursPlayedEstimate ?? 0,
        playtimeRecentHours: ext.recentHoursPlayed ?? 0,
        isPlayedOrRatedByUser: true,
        effectiveRating: ext.rating,
        hasExplicitUserRating: true,
        burnedOut: Boolean(ext.burnedOut),
        inClubCatalog: false,
        fromLiveSearch: false,
      });
    }
    registerIds(normKey, ext.steamAppId, ext.igdbId);
  }

  // 3. Club catalog games
  for (const cg of catalogGames) {
    const steamAppId = extractSteamAppIdFromCatalogTags(cg.tags);
    if (isNonGameSteamApp({ steamAppId, name: cg.name, tags: cg.tags })) continue;
    const inferred = inferGameMetadataAndVector({
      name: cg.name,
      steamAppId,
      category: cg.category,
      rawTags: cg.tags,
      minPlayers: cg.minPlayers,
      maxPlayers: cg.maxPlayers,
    });
    const normKey = resolveCanonicalKey(cg.name, steamAppId, undefined);
    if (!normKey) continue;

    const pref = prefByCatalogId.get(cg.id);
    const catHoursEntry = catalogGameHours[cg.id];
    const resolvedCatHours = pref?.hoursPlayed ?? catHoursEntry?.hoursPlayed;
    const resolvedCatRecentHours = pref?.recentHoursPlayed ?? catHoursEntry?.recentHoursPlayed;
    const existing = entriesMap.get(normKey);

    if (existing) {
      existing.catalogGameId = cg.id;
      existing.inClubCatalog = true;
      existing.steamAppId = existing.steamAppId ?? steamAppId;
      existing.tags = mergeUniqueStrings(existing.tags, cg.tags || []);
      existing.coverUrl = existing.coverUrl || cg.coverUrl || inferred.coverUrl || '';
      existing.minPlayers = Math.min(existing.minPlayers, cg.minPlayers);
      existing.maxPlayers = Math.max(existing.maxPlayers, cg.maxPlayers);
      existing.isMultiplayer = existing.isMultiplayer || cg.maxPlayers >= 2;
      if (resolvedCatHours !== undefined && resolvedCatHours > 0) {
        existing.playtimeHours = Math.max(existing.playtimeHours, resolvedCatHours);
      } else if (!existing.ownedOnSteam && !existing.externalGameId && resolvedCatHours !== undefined) {
        existing.playtimeHours = resolvedCatHours;
      }
      if (resolvedCatRecentHours !== undefined && resolvedCatRecentHours > 0) {
        existing.playtimeRecentHours = Math.max(
          existing.playtimeRecentHours,
          resolvedCatRecentHours
        );
      } else if (
        !existing.ownedOnSteam &&
        !existing.externalGameId &&
        resolvedCatRecentHours !== undefined
      ) {
        existing.playtimeRecentHours = resolvedCatRecentHours;
      }
      if (pref?.plays && (!existing.ownedOnSteam || existing.steamPlaysOverride === true)) {
        existing.isPlayedOrRatedByUser = true;
        if (!existing.hasExplicitUserRating) {
          existing.hasExplicitUserRating = true;
          existing.effectiveRating = pref.rating;
        }
      }
    } else {
      const prefPlays = Boolean(pref?.plays);
      entriesMap.set(normKey, {
        key: `cat-${cg.id}`,
        name: cg.name,
        coverUrl: cg.coverUrl || inferred.coverUrl || '',
        category: cg.category || inferred.category,
        tags: mergeUniqueStrings(cg.tags || [], inferred.tags),
        genres: inferred.genres,
        minPlayers: Math.max(1, cg.minPlayers || 1),
        maxPlayers: Math.max(1, cg.maxPlayers || 1),
        isMultiplayer: cg.maxPlayers >= 2,
        platform: inferred.genres.length > 0 && steamAppId ? 'Steam / Catálogo' : 'Catálogo',
        source: 'catalog',
        steamAppId,
        catalogGameId: cg.id,
        ownedOnSteam: false,
        playtimeHours: resolvedCatHours ?? 0,
        playtimeRecentHours: resolvedCatRecentHours ?? 0,
        isPlayedOrRatedByUser: prefPlays,
        effectiveRating: pref?.rating ?? 3,
        hasExplicitUserRating: prefPlays,
        burnedOut: false,
        inClubCatalog: true,
        fromLiveSearch: false,
      });
    }
    registerIds(normKey, steamAppId, undefined);
  }

  // 4. Curated Knowledge Base (non-Steam & flagship multiplayer/SP games)
  for (const kb of GLOBAL_GAMES_KNOWLEDGE_BASE) {
    const normKey = resolveCanonicalKey(kb.name, kb.steamAppId, undefined);
    if (!normKey) continue;

    const existing = entriesMap.get(normKey);
    if (existing) {
      existing.steamAppId = existing.steamAppId ?? kb.steamAppId;
      existing.tags = mergeUniqueStrings(existing.tags, kb.tags);
      existing.genres = mergeUniqueStrings(existing.genres, kb.genres);
      existing.coverUrl = existing.coverUrl || kb.coverUrl;
      existing.minPlayers = Math.min(existing.minPlayers, kb.minPlayers);
      existing.maxPlayers = Math.max(existing.maxPlayers, kb.maxPlayers);
      existing.isMultiplayer = existing.isMultiplayer || kb.isMultiplayer;
      if (kb.platform && !existing.ownedOnSteam && !existing.externalGameId) {
        existing.platform = kb.platform;
      }
    } else {
      entriesMap.set(normKey, {
        key: `kb-${kb.id}`,
        name: kb.name,
        coverUrl: kb.coverUrl,
        category: kb.category,
        tags: [...kb.tags],
        genres: [...kb.genres],
        minPlayers: Math.max(1, kb.minPlayers),
        maxPlayers: Math.max(1, kb.maxPlayers),
        isMultiplayer: kb.isMultiplayer,
        platform: kb.platform || 'IGDB / Steam',
        source: 'knowledge_base',
        steamAppId: kb.steamAppId,
        ownedOnSteam: false,
        playtimeHours: 0,
        playtimeRecentHours: 0,
        isPlayedOrRatedByUser: false,
        effectiveRating: 3,
        hasExplicitUserRating: false,
        burnedOut: false,
        inClubCatalog: false,
        fromLiveSearch: false,
      });
    }
    registerIds(normKey, kb.steamAppId, undefined);
  }

  // 5. Merge Discovery & Live Search Candidates
  const mergeExternalPool = (
    items: UnifiedSearchCandidate[],
    sourceType: 'igdb_discovery' | 'live_search'
  ) => {
    items.forEach((item, idx) => {
      const appId = item.appId ?? item.steamAppId;
      if (
        isNonGameSteamApp({
          appId,
          steamAppId: item.steamAppId,
          name: item.name,
          genres: item.genres,
          tags: item.tags,
          tagVotes: item.tagVotes,
        })
      ) {
        return;
      }
      const normKey = resolveCanonicalKey(item.name, appId, item.igdbId);
      if (!normKey) return;

      const inferred = inferGameMetadataAndVector({
        name: item.name,
        steamAppId: appId,
        rawGenres: item.genres,
        rawTags: item.tags,
        category: item.category,
        minPlayers: item.minPlayers,
        maxPlayers: item.maxPlayers,
      });

      const resolvedCover = item.headerImageUrl || item.coverUrl || inferred.coverUrl || '';
      const resolvedPlatform =
        item.platform || (item.source === 'igdb' || item.igdbId ? 'IGDB' : 'IGDB / Steam');

      const existing = entriesMap.get(normKey);
      if (existing) {
        existing.igdbId = existing.igdbId ?? item.igdbId;
        existing.steamAppId = existing.steamAppId ?? appId;
        existing.tags = mergeUniqueStrings(existing.tags, item.tags || []);
        if (!existing.tagVotes && item.tagVotes) {
          existing.tagVotes = item.tagVotes;
        }
        existing.genres = mergeUniqueStrings(existing.genres, item.genres || []);
        existing.coverUrl = existing.coverUrl || resolvedCover;
        if (sourceType === 'live_search') {
          existing.fromLiveSearch = true;
        }
      } else {
        entriesMap.set(normKey, {
          key:
            item.igdbId
              ? `igdb-${item.igdbId}`
              : appId
              ? `steam-ext-${appId}`
              : `${sourceType}-${idx}-${normKey}`,
          name: item.name,
          coverUrl: resolvedCover,
          category: item.category || inferred.category,
          tags: mergeUniqueStrings(item.tags || [], inferred.tags),
          ...(item.tagVotes ? { tagVotes: item.tagVotes } : {}),
          genres: mergeUniqueStrings(item.genres || [], inferred.genres),
          minPlayers: Math.max(1, item.minPlayers ?? inferred.minPlayers),
          maxPlayers: Math.max(1, item.maxPlayers ?? inferred.maxPlayers),
          isMultiplayer: item.isMultiplayer ?? inferred.isMultiplayer,
          platform: String(resolvedPlatform),
          source: sourceType,
          steamAppId: appId,
          igdbId: item.igdbId,
          ownedOnSteam: false,
          playtimeHours: 0,
          playtimeRecentHours: 0,
          isPlayedOrRatedByUser: false,
          effectiveRating: 3,
          hasExplicitUserRating: false,
          burnedOut: false,
          inClubCatalog: false,
          fromLiveSearch: sourceType === 'live_search',
        });
      }
      registerIds(normKey, appId, item.igdbId);
    });
  };

  mergeExternalPool(discoveryGames, 'igdb_discovery');
  mergeExternalPool(liveSearchResults, 'live_search');

  // 6. Score every candidate against the user's Steam / Taste Profile
  const playerVector = buildPlayerTasteVector(player, allPreferences, catalogGames);
  const hasTasteSignal = playerHasTasteSignal(player, userPrefs);
  const steamTagWeights = buildSteamTagAffinityMap(ownedGames);

  const mpPodium = player.tasteProfile?.topMultiplayerGames || [];
  const spPodium = player.tasteProfile?.topSingleplayerGames || [];

  const findPodiumMatch = (
    normName: string,
    steamAppId?: number
  ): { type: 'MP' | 'SP'; rank: 1 | 2 | 3; podiumEntry: PodiumGameEntry } | undefined => {
    const mp = mpPodium.find(
      p => normalizeGameName(p.name) === normName || (steamAppId !== undefined && p.steamAppId === steamAppId)
    );
    if (mp) return { type: 'MP', rank: mp.rank, podiumEntry: mp };
    const sp = spPodium.find(
      p => normalizeGameName(p.name) === normName || (steamAppId !== undefined && p.steamAppId === steamAppId)
    );
    if (sp) return { type: 'SP', rank: sp.rank, podiumEntry: sp };
    return undefined;
  };

  const unifiedResults: UnifiedSelectorGame[] = [];

  for (const [normKey, entry] of entriesMap.entries()) {
    const gameMeta = inferGameMetadataAndVector({
      name: entry.name,
      steamAppId: entry.steamAppId,
      rawGenres: entry.genres,
      rawTags: entry.tags,
      category: entry.category,
      minPlayers: entry.minPlayers,
      maxPlayers: entry.maxPlayers,
    });

    const normalizedGameVector = normalizeUnitVector(gameMeta.vector);
    const cosineSim = computeCosineSimilarity(playerVector, normalizedGameVector);

    let tagOverlapSum = 0;
    for (const label of [...entry.genres, ...entry.tags]) {
      const w = steamTagWeights.get(label.trim().toLowerCase());
      if (w) tagOverlapSum += w;
    }
    const tagOverlapBoost = Math.min(0.15, tagOverlapSum / 3);
    const catPref = player.categoryPreferences?.[gameMeta.category];
    const catBonus = catPref === 'like' ? 0.08 : catPref === 'dislike' ? -0.18 : 0;

    const tasteAffinityPct = hasTasteSignal
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              Math.max(0, Math.min(1, Math.pow(cosineSim, 0.72) * 0.88 + tagOverlapBoost + catBonus)) *
                100
            )
          )
        )
      : 50;

    const podiumMatch = findPodiumMatch(normKey, entry.steamAppId);
    const resolvedPlaytimeHours = Math.max(
      entry.playtimeHours,
      podiumMatch?.podiumEntry.hoursPlayed ?? 0
    );
    const resolvedRecentHours = Math.max(
      entry.playtimeRecentHours,
      podiumMatch?.podiumEntry.recentHoursPlayed ?? 0
    );
    const effectiveEntry =
      resolvedPlaytimeHours !== entry.playtimeHours ||
      resolvedRecentHours !== entry.playtimeRecentHours
        ? {
            ...entry,
            playtimeHours: resolvedPlaytimeHours,
            playtimeRecentHours: resolvedRecentHours,
          }
        : entry;

    const popularityScore = getGamePopularityScore(normKey, effectiveEntry);
    const steamOwnedRawHours = entry.steamRawHours ?? 0;
    const steamOwnedRawRecentHours = entry.steamRawRecentHours ?? 0;

    let likelihoodScore = 0;
    if (effectiveEntry.burnedOut) {
      likelihoodScore = -2500;
    } else if (effectiveEntry.ownedOnSteam && steamOwnedRawHours > 0) {
      likelihoodScore =
        1200 +
        Math.min(500, Math.log1p(steamOwnedRawHours) * 65) +
        Math.min(250, Math.log1p(steamOwnedRawRecentHours * 4) * 65) +
        popularityScore * 0.25;
    } else {
      likelihoodScore =
        popularityScore +
        (hasTasteSignal ? tasteAffinityPct * 0.35 : 0) +
        (effectiveEntry.inClubCatalog ? 25 : 0) +
        (effectiveEntry.fromLiveSearch ? 15 : 0);
    }

    const likelihoodBadge = buildUnifiedLikelihoodBadge({
      entry: effectiveEntry,
      tasteAffinityPct,
      hasTasteSignal,
      podiumMatch,
    });

    const needsHoursInput = Boolean(
      (effectiveEntry.isPlayedOrRatedByUser || podiumMatch) && resolvedPlaytimeHours < 1
    );

    unifiedResults.push({
      key: entry.key,
      name: entry.name,
      coverUrl: entry.coverUrl,
      category: entry.category || gameMeta.category,
      tags: entry.tags,
      ...(entry.tagVotes ? { tagVotes: entry.tagVotes } : {}),
      genres: entry.genres,
      minPlayers: entry.minPlayers,
      maxPlayers: entry.maxPlayers,
      isMultiplayer: entry.isMultiplayer,
      platform: entry.platform,
      source: entry.source,
      steamAppId: entry.steamAppId,
      igdbId: entry.igdbId,
      catalogGameId: entry.catalogGameId,
      externalGameId: entry.externalGameId,
      ownedOnSteam: entry.ownedOnSteam,
      playtimeHours: resolvedPlaytimeHours,
      playtimeRecentHours: resolvedRecentHours,
      isPlayedOrRatedByUser: entry.isPlayedOrRatedByUser,
      effectiveRating: entry.effectiveRating,
      hasExplicitUserRating: entry.hasExplicitUserRating,
      burnedOut: entry.burnedOut,
      inClubCatalog: entry.inClubCatalog,
      needsHoursInput,
      tasteAffinityPct,
      likelihoodScore: Math.round(likelihoodScore * 100) / 100,
      likelihoodBadge,
    });
  }

  unifiedResults.sort((a, b) => {
    if (a.burnedOut !== b.burnedOut) {
      return a.burnedOut ? 1 : -1;
    }
    if (a.isPlayedOrRatedByUser !== b.isPlayedOrRatedByUser) {
      return a.isPlayedOrRatedByUser ? -1 : 1;
    }
    if (b.likelihoodScore !== a.likelihoodScore) {
      return b.likelihoodScore - a.likelihoodScore;
    }
    if (b.playtimeHours !== a.playtimeHours) {
      return b.playtimeHours - a.playtimeHours;
    }
    return a.name.localeCompare(b.name);
  });

  return unifiedResults;
}
