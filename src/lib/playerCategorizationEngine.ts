import {
  Game,
  GameRating,
  PlayerProfile,
  PvjClassificationType,
  PvjDimensionKey,
  PvjPlayerCategorizationResult,
  PvjTopInfluencingGame,
  PvjVector6D,
  UserGamePreference,
} from '../types/domain';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  isNonGameSteamApp,
  normalizeGameName,
} from './tasteProfileEngine';

// ============================================================================
// 1. DEFINICIÓN DEL ESPACIO VECTORIAL (6 DIMENSIONES PVJ-6D)
// ============================================================================

export interface PvjDimensionMeta {
  key: PvjDimensionKey;
  code: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';
  label: string;
  shortLabel: string;
  emoji: string;
  color: string;
  description: string;
}

export const PVJ_DIMENSIONS: PvjDimensionMeta[] = [
  {
    key: 'D1_agonia',
    code: 'D1',
    label: 'Agonía',
    shortLabel: 'Agonía',
    emoji: '⚔️',
    color: '#f43f5e',
    description:
      'Competencia directa, tiempo de reacción, ejecución mecánica, PvP y superación de dificultad hostil.',
  },
  {
    key: 'D2_ingenio',
    code: 'D2',
    label: 'Ingenio',
    shortLabel: 'Ingenio',
    emoji: '🧠',
    color: '#38bdf8',
    description:
      'Optimización lógica, planificación estratégica, gestión de recursos y resolución de sistemas complejos.',
  },
  {
    key: 'D3_expresion',
    code: 'D3',
    label: 'Expresión',
    shortLabel: 'Expresión',
    emoji: '🎨',
    color: '#a855f7',
    description:
      'Construcción libre, diseño espacial/estético, experimentación en entornos abiertos (sandbox) y modificación.',
  },
  {
    key: 'D4_narrativa',
    code: 'D4',
    label: 'Narrativa',
    shortLabel: 'Narrativa',
    emoji: '📖',
    color: '#f59e0b',
    description:
      'Inmersión en historias, rol, exploración contemplativa, desarrollo de personajes y lore.',
  },
  {
    key: 'D5_acumulacion',
    code: 'D5',
    label: 'Acumulación',
    shortLabel: 'Acumulación',
    emoji: '💎',
    color: '#eab308',
    description:
      'Progresión numérica, recolección (looting), maximización de estadísticas (min-maxing) y completismo de metas.',
  },
  {
    key: 'D6_sinergia',
    code: 'D6',
    label: 'Sinergia',
    shortLabel: 'Sinergia',
    emoji: '🤝',
    color: '#10b981',
    description:
      'Cooperación sincrónica, interacción comunitaria, dependencia grupal y dinámicas sociales.',
  },
];

export const PVJ_DIMENSION_KEYS: PvjDimensionKey[] = PVJ_DIMENSIONS.map((d) => d.key);

export const PVJ_DIMENSION_MAP = new Map<PvjDimensionKey, PvjDimensionMeta>(
  PVJ_DIMENSIONS.map((d) => [d.key, d])
);

export function createZeroPvjVector(): PvjVector6D {
  return {
    D1_agonia: 0,
    D2_ingenio: 0,
    D3_expresion: 0,
    D4_narrativa: 0,
    D5_acumulacion: 0,
    D6_sinergia: 0,
  };
}

// Tuple helper ordered [D1_agonia, D2_ingenio, D3_expresion, D4_narrativa, D5_acumulacion, D6_sinergia]
type PvjTuple = [number, number, number, number, number, number];

function tupleToVector(t: PvjTuple): PvjVector6D {
  return {
    D1_agonia: t[0],
    D2_ingenio: t[1],
    D3_expresion: t[2],
    D4_narrativa: t[3],
    D5_acumulacion: t[4],
    D6_sinergia: t[5],
  };
}

function normalizeTagKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

// ============================================================================
// 2. MATRIZ DE TRADUCCIÓN DE ETIQUETAS M (K × 6)
// Orden de tupla: [D1 Agonía, D2 Ingenio, D3 Expresión, D4 Narrativa, D5 Acumulación, D6 Sinergia]
// ============================================================================

export const TAG_TRANSLATION_MATRIX_M: Record<string, PvjTuple> = {
  // --- Ejemplos canónicos de la especificación ---
  competitive: [1.0, 0.3, 0.0, 0.0, 0.1, 0.2],
  competitivo: [1.0, 0.3, 0.0, 0.0, 0.1, 0.2],
  automation: [0.0, 1.0, 0.6, 0.0, 0.3, 0.0],
  automatizacion: [0.0, 1.0, 0.6, 0.0, 0.3, 0.0],
  'story rich': [0.0, 0.1, 0.0, 1.0, 0.1, 0.0],
  historia: [0.0, 0.1, 0.0, 1.0, 0.1, 0.0],
  'looter shooter': [0.6, 0.2, 0.0, 0.1, 1.0, 0.5],

  // --- D1: Agonía (Competencia, Ejecución, PvP, Dificultad Hostil) ---
  fps: [0.9, 0.2, 0.0, 0.05, 0.1, 0.35],
  shooter: [0.85, 0.2, 0.0, 0.05, 0.15, 0.3],
  'first person': [0.55, 0.15, 0.1, 0.25, 0.1, 0.2],
  'tactical shooter': [0.95, 0.55, 0.0, 0.0, 0.05, 0.65],
  'shooter tactico': [0.95, 0.55, 0.0, 0.0, 0.05, 0.65],
  'hero shooter': [0.9, 0.35, 0.05, 0.1, 0.15, 0.75],
  'arena shooter': [1.0, 0.15, 0.0, 0.0, 0.05, 0.25],
  pvp: [0.95, 0.3, 0.0, 0.0, 0.15, 0.45],
  esports: [1.0, 0.45, 0.0, 0.0, 0.05, 0.65],
  'battle royale': [0.9, 0.35, 0.0, 0.0, 0.2, 0.55],
  'fast paced': [0.85, 0.15, 0.0, 0.05, 0.1, 0.2],
  rapido: [0.85, 0.15, 0.0, 0.05, 0.1, 0.2],
  difficult: [0.85, 0.4, 0.0, 0.15, 0.25, 0.1],
  hardcore: [0.85, 0.45, 0.05, 0.1, 0.35, 0.2],
  'souls like': [0.95, 0.3, 0.05, 0.45, 0.45, 0.1],
  action: [0.75, 0.15, 0.05, 0.2, 0.25, 0.2],
  accion: [0.75, 0.15, 0.05, 0.2, 0.25, 0.2],
  fighting: [1.0, 0.35, 0.05, 0.1, 0.1, 0.15],
  '2d fighter': [1.0, 0.35, 0.05, 0.1, 0.1, 0.15],
  'hack and slash': [0.75, 0.15, 0.0, 0.2, 0.7, 0.2],
  'bullet hell': [0.95, 0.25, 0.0, 0.05, 0.2, 0.0],
  precision: [0.9, 0.2, 0.0, 0.0, 0.1, 0.1],
  'action roguelike': [0.85, 0.4, 0.05, 0.15, 0.65, 0.1],
  'third person shooter': [0.75, 0.2, 0.05, 0.15, 0.3, 0.45],
  'tercera persona': [0.6, 0.15, 0.1, 0.35, 0.25, 0.35],
  extraction: [0.85, 0.4, 0.0, 0.05, 0.75, 0.55],
  extraccion: [0.85, 0.4, 0.0, 0.05, 0.75, 0.55],
  military: [0.75, 0.55, 0.05, 0.1, 0.1, 0.5],
  militar: [0.75, 0.55, 0.05, 0.1, 0.1, 0.5],
  sports: [0.8, 0.25, 0.05, 0.0, 0.2, 0.55],
  deportes: [0.8, 0.25, 0.05, 0.0, 0.2, 0.55],
  racing: [0.85, 0.2, 0.2, 0.0, 0.25, 0.25],
  carreras: [0.85, 0.2, 0.2, 0.0, 0.25, 0.25],
  driving: [0.65, 0.15, 0.3, 0.1, 0.2, 0.2],
  futbol: [0.8, 0.3, 0.0, 0.0, 0.2, 0.65],

  // --- D2: Ingenio (Estrategia, Táctica, Logística, Sistemas) ---
  strategy: [0.25, 1.0, 0.15, 0.15, 0.25, 0.25],
  estrategia: [0.25, 1.0, 0.15, 0.15, 0.25, 0.25],
  rts: [0.55, 1.0, 0.1, 0.1, 0.2, 0.4],
  'real time strategy': [0.55, 1.0, 0.1, 0.1, 0.2, 0.4],
  tactical: [0.65, 0.9, 0.05, 0.1, 0.1, 0.55],
  tactico: [0.65, 0.9, 0.05, 0.1, 0.1, 0.55],
  'turn based strategy': [0.15, 1.0, 0.1, 0.25, 0.3, 0.15],
  'turn based tactics': [0.25, 1.0, 0.05, 0.3, 0.3, 0.15],
  'turn based': [0.1, 0.9, 0.05, 0.45, 0.35, 0.15],
  'por turnos': [0.1, 0.9, 0.05, 0.45, 0.35, 0.15],
  '4x': [0.15, 1.0, 0.3, 0.2, 0.45, 0.2],
  'grand strategy': [0.15, 1.0, 0.2, 0.35, 0.35, 0.2],
  management: [0.05, 0.95, 0.55, 0.1, 0.45, 0.1],
  gestion: [0.05, 0.95, 0.55, 0.1, 0.45, 0.1],
  'resource management': [0.1, 0.95, 0.4, 0.05, 0.5, 0.15],
  logistics: [0.0, 1.0, 0.5, 0.0, 0.35, 0.1],
  logistica: [0.0, 1.0, 0.5, 0.0, 0.35, 0.1],
  puzzle: [0.05, 0.95, 0.2, 0.25, 0.1, 0.1],
  deckbuilding: [0.25, 0.95, 0.25, 0.1, 0.55, 0.05],
  'card game': [0.3, 0.9, 0.2, 0.1, 0.5, 0.15],
  cartas: [0.3, 0.9, 0.2, 0.1, 0.5, 0.15],
  roguelike: [0.65, 0.75, 0.1, 0.15, 0.7, 0.1],
  roguelite: [0.6, 0.65, 0.1, 0.2, 0.8, 0.15],
  'tower defense': [0.25, 0.95, 0.3, 0.0, 0.35, 0.2],
  moba: [0.85, 0.85, 0.0, 0.05, 0.25, 0.85],
  simulation: [0.1, 0.75, 0.75, 0.15, 0.35, 0.2],
  simulacion: [0.1, 0.75, 0.75, 0.15, 0.35, 0.2],
  'economy': [0.05, 0.9, 0.35, 0.05, 0.6, 0.2],
  'stealth': [0.45, 0.8, 0.15, 0.45, 0.15, 0.25],
  sigilo: [0.45, 0.8, 0.15, 0.45, 0.15, 0.25],
  investigation: [0.1, 0.8, 0.05, 0.75, 0.1, 0.45],
  investigacion: [0.1, 0.8, 0.05, 0.75, 0.1, 0.45],

  // --- D3: Expresión (Sandbox, Construcción, Creatividad, Mods) ---
  sandbox: [0.15, 0.4, 1.0, 0.2, 0.35, 0.45],
  building: [0.05, 0.45, 1.0, 0.1, 0.4, 0.3],
  construccion: [0.05, 0.45, 1.0, 0.1, 0.4, 0.3],
  'base building': [0.2, 0.65, 0.95, 0.05, 0.55, 0.4],
  'city builder': [0.0, 0.75, 0.95, 0.1, 0.4, 0.05],
  crafting: [0.15, 0.45, 0.85, 0.1, 0.75, 0.35],
  crafteo: [0.15, 0.45, 0.85, 0.1, 0.75, 0.35],
  moddable: [0.1, 0.35, 1.0, 0.15, 0.2, 0.45],
  mods: [0.1, 0.35, 1.0, 0.15, 0.2, 0.45],
  physics: [0.25, 0.3, 0.85, 0.0, 0.05, 0.6],
  fisica: [0.25, 0.3, 0.85, 0.0, 0.05, 0.6],
  'character customization': [0.05, 0.1, 0.85, 0.55, 0.5, 0.25],
  'level editor': [0.1, 0.35, 1.0, 0.05, 0.1, 0.35],
  design: [0.0, 0.5, 1.0, 0.1, 0.15, 0.1],
  voxel: [0.1, 0.25, 0.95, 0.1, 0.4, 0.4],
  creative: [0.0, 0.25, 1.0, 0.25, 0.15, 0.2],
  creatividad: [0.0, 0.25, 1.0, 0.25, 0.15, 0.2],
  farming: [0.0, 0.35, 0.7, 0.35, 0.75, 0.35],
  granja: [0.0, 0.35, 0.7, 0.35, 0.75, 0.35],
  'life sim': [0.0, 0.25, 0.8, 0.55, 0.5, 0.4],
  relaxing: [0.0, 0.15, 0.75, 0.55, 0.4, 0.3],
  relajante: [0.0, 0.15, 0.75, 0.55, 0.4, 0.3],
  cozy: [0.0, 0.15, 0.8, 0.6, 0.4, 0.35],

  // --- D4: Narrativa (Historia, Rol, Exploración Contemplativa, Lore) ---
  rpg: [0.3, 0.4, 0.2, 0.9, 0.75, 0.2],
  rol: [0.3, 0.4, 0.2, 0.9, 0.75, 0.2],
  crpg: [0.2, 0.7, 0.25, 1.0, 0.65, 0.3],
  jrpg: [0.3, 0.4, 0.05, 0.95, 0.75, 0.05],
  adventure: [0.25, 0.2, 0.2, 0.85, 0.35, 0.2],
  aventura: [0.25, 0.2, 0.2, 0.85, 0.35, 0.2],
  'choices matter': [0.05, 0.3, 0.25, 1.0, 0.15, 0.15],
  'multiple endings': [0.05, 0.2, 0.15, 1.0, 0.35, 0.05],
  lore: [0.1, 0.2, 0.1, 1.0, 0.25, 0.1],
  'lore rich': [0.1, 0.2, 0.1, 1.0, 0.25, 0.1],
  atmospheric: [0.15, 0.15, 0.2, 0.9, 0.15, 0.1],
  exploration: [0.15, 0.2, 0.45, 0.85, 0.5, 0.25],
  exploracion: [0.15, 0.2, 0.45, 0.85, 0.5, 0.25],
  'open world': [0.35, 0.2, 0.65, 0.75, 0.65, 0.35],
  'mundo abierto': [0.35, 0.2, 0.65, 0.75, 0.65, 0.35],
  fantasy: [0.25, 0.25, 0.2, 0.85, 0.55, 0.2],
  fantasia: [0.25, 0.25, 0.2, 0.85, 0.55, 0.2],
  'dark fantasy': [0.6, 0.25, 0.1, 0.85, 0.5, 0.1],
  'sci fi': [0.35, 0.45, 0.35, 0.7, 0.45, 0.3],
  'sci-fi': [0.35, 0.45, 0.35, 0.7, 0.45, 0.3],
  cyberpunk: [0.4, 0.25, 0.2, 0.9, 0.5, 0.1],
  singleplayer: [0.3, 0.35, 0.25, 0.85, 0.45, 0.0],
  'great soundtrack': [0.2, 0.15, 0.2, 0.8, 0.15, 0.1],
  narrative: [0.0, 0.1, 0.1, 1.0, 0.1, 0.05],
  'walking simulator': [0.0, 0.05, 0.15, 1.0, 0.05, 0.0],
  mystery: [0.05, 0.55, 0.05, 0.95, 0.1, 0.2],
  crime: [0.5, 0.25, 0.3, 0.65, 0.35, 0.45],
  pirates: [0.4, 0.2, 0.35, 0.6, 0.6, 0.8],
  piratas: [0.4, 0.2, 0.35, 0.6, 0.6, 0.8],
  medieval: [0.4, 0.55, 0.3, 0.65, 0.3, 0.3],
  historico: [0.3, 0.8, 0.25, 0.55, 0.2, 0.3],

  // --- D5: Acumulación (Looting, Progresión Numérica, Min-Maxing, Completismo) ---
  loot: [0.35, 0.25, 0.1, 0.15, 1.0, 0.4],
  looter: [0.45, 0.25, 0.05, 0.1, 1.0, 0.45],
  'action rpg': [0.65, 0.35, 0.05, 0.45, 0.95, 0.25],
  arpg: [0.6, 0.45, 0.05, 0.3, 1.0, 0.3],
  mmorpg: [0.35, 0.35, 0.25, 0.55, 0.95, 0.9],
  mmo: [0.4, 0.3, 0.2, 0.35, 0.85, 0.95],
  'character action game': [0.75, 0.2, 0.05, 0.45, 0.6, 0.1],
  grind: [0.25, 0.25, 0.1, 0.1, 1.0, 0.4],
  grinding: [0.25, 0.25, 0.1, 0.1, 1.0, 0.4],
  'min max': [0.2, 0.75, 0.1, 0.05, 1.0, 0.2],
  progression: [0.2, 0.3, 0.2, 0.25, 0.95, 0.3],
  'collectathon': [0.1, 0.15, 0.25, 0.3, 1.0, 0.1],
  survival: [0.45, 0.45, 0.65, 0.25, 0.8, 0.55],
  supervivencia: [0.45, 0.45, 0.65, 0.25, 0.8, 0.55],
  'open world survival craft': [0.35, 0.45, 0.85, 0.25, 0.85, 0.55],
  zombies: [0.55, 0.35, 0.35, 0.3, 0.6, 0.65],
  'post apocalyptic': [0.45, 0.4, 0.45, 0.55, 0.65, 0.4],
  mining: [0.1, 0.35, 0.6, 0.05, 0.9, 0.5],
  mineria: [0.1, 0.35, 0.6, 0.05, 0.9, 0.5],
  'free to play': [0.55, 0.3, 0.1, 0.05, 0.6, 0.55],
  f2p: [0.55, 0.3, 0.1, 0.05, 0.6, 0.55],

  // --- D6: Sinergia (Cooperación, Comunidad, Dependencia Grupal, Social) ---
  'co op': [0.35, 0.35, 0.2, 0.2, 0.35, 1.0],
  coop: [0.35, 0.35, 0.2, 0.2, 0.35, 1.0],
  'online co op': [0.35, 0.35, 0.2, 0.2, 0.35, 1.0],
  'co operative': [0.35, 0.35, 0.2, 0.2, 0.35, 1.0],
  cooperativo: [0.35, 0.35, 0.2, 0.2, 0.35, 1.0],
  multiplayer: [0.55, 0.3, 0.2, 0.05, 0.3, 0.9],
  multijugador: [0.55, 0.3, 0.2, 0.05, 0.3, 0.9],
  'massively multiplayer': [0.35, 0.3, 0.3, 0.3, 0.8, 0.95],
  'team based': [0.65, 0.5, 0.05, 0.05, 0.15, 0.95],
  'class based': [0.6, 0.45, 0.1, 0.1, 0.2, 0.85],
  'party': [0.15, 0.15, 0.2, 0.05, 0.05, 1.0],
  'party game': [0.15, 0.15, 0.2, 0.05, 0.05, 1.0],
  'social deduction': [0.2, 0.65, 0.05, 0.15, 0.0, 1.0],
  'deduccion social': [0.2, 0.65, 0.05, 0.15, 0.0, 1.0],
  'proximity voice chat': [0.2, 0.1, 0.1, 0.2, 0.1, 1.0],
  'chat proximidad': [0.2, 0.1, 0.1, 0.2, 0.1, 1.0],
  comedy: [0.1, 0.1, 0.35, 0.3, 0.05, 0.85],
  comedia: [0.1, 0.1, 0.35, 0.3, 0.05, 0.85],
  funny: [0.1, 0.1, 0.4, 0.25, 0.05, 0.85],
  risas: [0.1, 0.1, 0.35, 0.2, 0.05, 0.95],
  casual: [0.05, 0.15, 0.45, 0.25, 0.25, 0.8],
  'co op campaign': [0.35, 0.35, 0.1, 0.7, 0.4, 0.95],
  pve: [0.45, 0.35, 0.15, 0.25, 0.65, 0.85],
  pvpve: [0.8, 0.45, 0.1, 0.1, 0.65, 0.75],
  raids: [0.55, 0.55, 0.15, 0.15, 0.85, 0.95],
  'heist': [0.55, 0.55, 0.1, 0.25, 0.65, 0.9],
  atracos: [0.55, 0.55, 0.1, 0.25, 0.65, 0.9],
  horror: [0.45, 0.25, 0.05, 0.65, 0.15, 0.55],
  terror: [0.45, 0.25, 0.05, 0.65, 0.15, 0.55],
  'co op horror': [0.4, 0.25, 0.05, 0.45, 0.2, 0.95],
  'psychological horror': [0.25, 0.3, 0.05, 0.85, 0.05, 0.35],
  'asymmetrical': [0.7, 0.45, 0.05, 0.1, 0.2, 0.85],
  'terror asimetrico': [0.65, 0.4, 0.05, 0.15, 0.2, 0.85],
  caos: [0.45, 0.15, 0.35, 0.1, 0.15, 0.9],
  chaos: [0.45, 0.15, 0.35, 0.1, 0.15, 0.9],
  indie: [0.2, 0.35, 0.45, 0.45, 0.3, 0.35],
  platformer: [0.65, 0.2, 0.25, 0.25, 0.25, 0.35],
  plataformas: [0.65, 0.2, 0.25, 0.25, 0.25, 0.35],
  '2d': [0.35, 0.35, 0.4, 0.4, 0.4, 0.2],
  'pixel graphics': [0.25, 0.35, 0.45, 0.5, 0.45, 0.25],
  'pixel art': [0.25, 0.35, 0.45, 0.5, 0.45, 0.25],
  clasico: [0.45, 0.45, 0.2, 0.4, 0.25, 0.45],
  '3d': [0.35, 0.25, 0.35, 0.35, 0.3, 0.3],
};

// ============================================================================
// 3. PERFILES DE TAGS COMUNITARIOS PRE-CARGADOS (Offline / Fallback de SteamSpy)
// ============================================================================

const CURATED_GAME_TAG_VOTES_BY_APPID: Record<number, Record<string, number>> = {
  // Counter-Strike 2 (Agonía + Sinergia alta especificidad)
  730: {
    FPS: 91000,
    Shooter: 65000,
    Multiplayer: 62000,
    Competitive: 54000,
    'Team-Based': 46000,
    Tactical: 42000,
    'First-Person': 40000,
    Esports: 35000,
    Action: 32000,
    Military: 25000,
  },
  // Dota 2 (Agonía + Ingenio + Sinergia)
  570: {
    MOBA: 55000,
    Strategy: 41000,
    Multiplayer: 38000,
    Competitive: 35000,
    'Team-Based': 31000,
    'Free to Play': 29000,
    Tactical: 22000,
    Esports: 21000,
    'Co-op': 16000,
  },
  // Factorio (Ingenio + Expresión muy alta especificidad)
  427520: {
    Automation: 12000,
    'Base Building': 10500,
    Strategy: 9200,
    'Resource Management': 8500,
    Sandbox: 7800,
    Management: 7400,
    Building: 6900,
    Simulation: 6100,
    Logistics: 5800,
    'Co-op': 4100,
  },
  // Satisfactory
  526870: {
    Automation: 9800,
    'Base Building': 8700,
    Building: 8100,
    Sandbox: 7400,
    'Open World': 6500,
    Management: 6200,
    'Online Co-Op': 5800,
    Crafting: 5300,
    'Resource Management': 5000,
  },
  // Grand Theft Auto V (Juego Comodín: disperso en las 6 dimensiones -> baja ω_i)
  271590: {
    'Open World': 34000,
    Action: 29000,
    Multiplayer: 28000,
    Crime: 24000,
    Sandbox: 22000,
    'Story Rich': 21000,
    Driving: 19000,
    Shooter: 18500,
    'Co-op': 17000,
    RPG: 14000,
    Heist: 13500,
    Moddable: 12000,
  },
  // Garry's Mod (Juego Comodín)
  4000: {
    Sandbox: 45000,
    Multiplayer: 39000,
    Funny: 33000,
    Moddable: 31000,
    Building: 27000,
    Physics: 26000,
    'Co-op': 22000,
    FPS: 18000,
    'Social Deduction': 16000,
    RPG: 14000,
  },
  // Baldur's Gate 3 (Narrativa + Ingenio + Sinergia)
  1086940: {
    'Story Rich': 22000,
    CRPG: 20500,
    RPG: 19800,
    'Choices Matter': 18400,
    'Turn-Based Combat': 16200,
    'Turn-Based': 16000,
    Fantasy: 15200,
    'Online Co-Op': 12500,
    Exploration: 11000,
    Lore: 10200,
  },
  // Elden Ring (Agonía + Narrativa + Acumulación)
  1245620: {
    'Souls-like': 25000,
    Difficult: 21000,
    'Dark Fantasy': 19500,
    RPG: 18900,
    'Open World': 18200,
    Action: 17000,
    'Action RPG': 16400,
    Exploration: 14500,
    'Lore Rich': 13000,
  },
  // Rust (Agonía + Expresión + Acumulación + Sinergia)
  252490: {
    Survival: 29000,
    Crafting: 24000,
    Multiplayer: 23500,
    'Open World': 21000,
    PvP: 20500,
    'Base Building': 19000,
    Sandbox: 17500,
    Hardcore: 15000,
    Loot: 14000,
  },
  // Project Zomboid
  108600: {
    Survival: 18000,
    Zombies: 16500,
    Sandbox: 14200,
    Hardcore: 12000,
    'Open World': 11500,
    'Base Building': 10200,
    'Online Co-Op': 9600,
    Crafting: 9200,
    RPG: 7500,
  },
  // Helldivers 2
  553850: {
    'Online Co-Op': 19000,
    'Co-op': 18500,
    'Third-Person Shooter': 16000,
    PvE: 15500,
    Action: 14800,
    'Team-Based': 13500,
    'Sci-Fi': 12500,
    Shooter: 11800,
  },
  // Lethal Company
  1966720: {
    'Co-op Horror': 14000,
    'Online Co-Op': 13200,
    Funny: 11800,
    'Proximity Voice Chat': 11000,
    Horror: 10500,
    Comedy: 9800,
    Extraction: 7500,
  },
  // Phasmophobia
  739630: {
    'Co-op Horror': 18000,
    Horror: 17200,
    'Online Co-Op': 15600,
    Investigation: 13400,
    'Psychological Horror': 11800,
    Multiplayer: 11200,
  },
  // Age of Empires II: DE
  813780: {
    RTS: 14000,
    Strategy: 13500,
    Medieval: 11000,
    'Base Building': 9500,
    Multiplayer: 9100,
    Competitive: 7800,
    'Resource Management': 7400,
  },
  // Terraria
  105600: {
    'Open World Survival Craft': 28000,
    Sandbox: 26500,
    Crafting: 24000,
    Building: 22500,
    Exploration: 20000,
    Loot: 18500,
    'Co-op': 17000,
    RPG: 14500,
  },
  // Valheim
  892970: {
    Survival: 17000,
    'Open World Survival Craft': 16200,
    'Online Co-Op': 14800,
    'Base Building': 13900,
    Exploration: 12400,
    Crafting: 11900,
    Sandbox: 10200,
  },
  // Stardew Valley
  413150: {
    Farming: 24000,
    'Life Sim': 20000,
    Relaxing: 19200,
    Cozy: 17500,
    Crafting: 14500,
    RPG: 13000,
    'Co-op': 12500,
  },
  // Among Us
  945360: {
    'Social Deduction': 21000,
    Multiplayer: 19500,
    'Party Game': 17000,
    Casual: 14500,
    Funny: 13800,
    Strategy: 9000,
  },
  // Warframe
  230410: {
    'Looter Shooter': 22000,
    'Free to Play': 19000,
    'Co-op': 17500,
    Loot: 17000,
    'Sci-Fi': 15500,
    Action: 14500,
    Grind: 13000,
    PvE: 12500,
  },
  // Destiny 2
  1085660: {
    'Looter Shooter': 24000,
    FPS: 20000,
    'Online Co-Op': 18500,
    Raids: 17000,
    Loot: 16500,
    PvE: 14500,
    'Sci-Fi': 13800,
    PvP: 11500,
  },
  // Path of Exile
  238960: {
    'Action RPG': 24000,
    ARPG: 23000,
    Loot: 21500,
    'Hack and Slash': 19000,
    'Min-Max': 17500,
    'Dark Fantasy': 15000,
    Grind: 14500,
  },
  // Rocket League
  252950: {
    Sports: 28000,
    Competitive: 25000,
    Multiplayer: 24000,
    Racing: 16500,
    'Team-Based': 15500,
    Esports: 14000,
  },
  // PUBG
  578080: {
    'Battle Royale': 32000,
    Survival: 25000,
    Shooter: 24000,
    FPS: 22000,
    Multiplayer: 21500,
    Competitive: 18500,
    Tactical: 16500,
  },
  // Apex Legends
  1172470: {
    'Battle Royale': 25000,
    FPS: 22000,
    'Hero Shooter': 19500,
    Competitive: 18000,
    'Team-Based': 16500,
    'Fast-Paced': 15000,
  },
  // Rainbow Six Siege
  359550: {
    'Tactical Shooter': 28000,
    FPS: 26000,
    Tactical: 24500,
    Competitive: 22000,
    'Team-Based': 20000,
    Multiplayer: 19500,
    Esports: 16000,
  },
  // Deep Rock Galactic
  548430: {
    'Online Co-Op': 19000,
    'Co-op': 18500,
    PvE: 16500,
    FPS: 15000,
    Mining: 14000,
    'Class-Based': 13000,
    Loot: 11000,
  },
  // Payday 2
  218620: {
    'Co-op': 25000,
    Heist: 23000,
    FPS: 20000,
    'Online Co-Op': 19000,
    Stealth: 16500,
    Loot: 14000,
    Action: 13500,
  },
  // Left 4 Dead 2
  550: {
    'Co-op': 38000,
    Zombies: 36000,
    FPS: 31000,
    'Online Co-Op': 28000,
    Action: 24000,
    'Team-Based': 20000,
  },
  // Sea of Thieves
  1172620: {
    Pirates: 17000,
    'Online Co-Op': 16000,
    'Open World': 14500,
    Exploration: 13000,
    Multiplayer: 12500,
    Loot: 10500,
  },
  // The Witcher 3
  292030: {
    'Story Rich': 42000,
    RPG: 39000,
    'Open World': 34000,
    Fantasy: 29000,
    'Choices Matter': 26000,
    Singleplayer: 25000,
    Lore: 22000,
  },
  // Cyberpunk 2077
  1091500: {
    Cyberpunk: 29000,
    'Story Rich': 26000,
    RPG: 24500,
    'Open World': 23000,
    FPS: 18500,
    'Choices Matter': 17000,
    Singleplayer: 16000,
  },
  // Red Dead Redemption 2
  1174180: {
    'Story Rich': 32000,
    'Open World': 30000,
    Adventure: 24000,
    Singleplayer: 21000,
    Exploration: 19500,
    Lore: 17000,
    Action: 16000,
  },
};

const CURATED_GAME_TAG_VOTES_BY_NAME: Record<string, Record<string, number>> = {
  minecraft: {
    Sandbox: 48000,
    Building: 42000,
    Survival: 39000,
    Crafting: 36000,
    Multiplayer: 34000,
    'Open World': 32000,
    Moddable: 29000,
    Exploration: 26000,
    Creative: 25000,
    'Co-op': 22000,
    Adventure: 19000,
    Loot: 15000,
  },
  valorant: {
    'Tactical Shooter': 42000,
    FPS: 38000,
    Competitive: 36000,
    'Hero Shooter': 30000,
    'Team-Based': 28000,
    Esports: 26000,
    Tactical: 25000,
    Multiplayer: 24000,
  },
  leagueoflegends: {
    MOBA: 48000,
    Competitive: 42000,
    Strategy: 35000,
    'Team-Based': 33000,
    Multiplayer: 31000,
    Esports: 29000,
    PvP: 27000,
    Tactical: 22000,
  },
  worldofwarcraft: {
    MMORPG: 45000,
    Raids: 36000,
    Loot: 34000,
    RPG: 32000,
    Fantasy: 29000,
    Multiplayer: 28000,
    'Co-op': 26000,
    Lore: 24000,
  },
  escapefromtarkov: {
    Extraction: 32000,
    'Tactical Shooter': 29000,
    Hardcore: 27000,
    FPS: 26000,
    Loot: 24000,
    Survival: 22000,
    PvPvE: 20000,
    'Team-Based': 15000,
  },
  easportsfc25: {
    Sports: 28000,
    Futbol: 26000,
    Competitive: 22000,
    Multiplayer: 20000,
    'Team-Based': 17000,
  },
};

const CATEGORY_FALLBACK_TUPLES: Record<string, PvjTuple> = {
  'Shooter Táctico': [0.95, 0.45, 0.0, 0.05, 0.1, 0.65],
  MOBA: [0.85, 0.85, 0.0, 0.05, 0.25, 0.85],
  'Co-op Horror': [0.4, 0.25, 0.05, 0.45, 0.2, 0.95],
  'Co-op Acción': [0.65, 0.3, 0.1, 0.2, 0.55, 0.95],
  'Survival Sandbox': [0.3, 0.45, 0.9, 0.2, 0.75, 0.55],
  RTS: [0.45, 1.0, 0.2, 0.15, 0.25, 0.4],
  'Party Casual': [0.15, 0.2, 0.3, 0.1, 0.05, 1.0],
  'Deportes / Autos': [0.85, 0.25, 0.1, 0.0, 0.2, 0.55],
  'RPG / Aventura': [0.25, 0.45, 0.2, 0.95, 0.75, 0.35],
};

function lookupTagVectorInMatrix(tagName: string): PvjTuple | null {
  const norm = normalizeTagKey(tagName);
  if (!norm) return null;
  if (TAG_TRANSLATION_MATRIX_M[norm]) {
    return TAG_TRANSLATION_MATRIX_M[norm];
  }

  // Partial substring match fallback for compound SteamSpy/IGDB tags
  for (const [key, vec] of Object.entries(TAG_TRANSLATION_MATRIX_M)) {
    if (norm.includes(key) || key.includes(norm)) {
      return vec;
    }
  }
  return null;
}

// ============================================================================
// 4. PASO 1: VECTORIZACIÓN DE CADA JUEGO (g_i ∈ [0, 1]^6)
// ============================================================================

export interface GameVectorizationInput {
  appId?: number;
  name: string;
  tags?: string[];
  genres?: string[];
  category?: string;
  tagVotes?: Record<string, number>;
}

export function computeGameVector6D(input: GameVectorizationInput): PvjVector6D {
  const normName = normalizeGameName(input.name);

  // Resolve top 15 tags with relevance weights v_{i,k}
  let resolvedTagEntries: Array<[string, number]> = [];

  if (input.tagVotes && Object.keys(input.tagVotes).length > 0) {
    resolvedTagEntries = Object.entries(input.tagVotes)
      .filter(([, votes]) => Number.isFinite(votes) && votes > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
  } else if (input.appId && CURATED_GAME_TAG_VOTES_BY_APPID[input.appId]) {
    resolvedTagEntries = Object.entries(CURATED_GAME_TAG_VOTES_BY_APPID[input.appId])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
  } else if (normName && CURATED_GAME_TAG_VOTES_BY_NAME[normName]) {
    resolvedTagEntries = Object.entries(CURATED_GAME_TAG_VOTES_BY_NAME[normName])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
  } else {
    const mergedLabels = Array.from(
      new Set([...(input.tags || []), ...(input.genres || [])].map((s) => s.trim()).filter(Boolean))
    )
      .filter((t) => !t.startsWith('steam:'))
      .slice(0, 15);

    resolvedTagEntries = mergedLabels.map((label, idx) => [
      label,
      Math.max(10, Math.round(100 * Math.pow(0.88, idx))),
    ]);
  }

  const maxVote =
    resolvedTagEntries.length > 0
      ? Math.max(...resolvedTagEntries.map(([, v]) => v))
      : 1;

  const raw: PvjTuple = [0, 0, 0, 0, 0, 0];
  let matchedTagsCount = 0;

  for (const [tag, votes] of resolvedTagEntries) {
    const mVec = lookupTagVectorInMatrix(tag);
    if (!mVec) continue;
    matchedTagsCount++;
    const normalizedVote = maxVote > 0 ? votes / maxVote : 1;
    for (let d = 0; d < 6; d++) {
      raw[d] += normalizedVote * mVec[d];
    }
  }

  // Fallback to category or knowledge base if no tags matched Matrix M
  if (matchedTagsCount === 0) {
    const kbMatch = GLOBAL_GAMES_KNOWLEDGE_BASE.find(
      (kb) =>
        (input.appId !== undefined && kb.steamAppId === input.appId) ||
        normalizeGameName(kb.name) === normName
    );
    if (kbMatch) {
      for (let idx = 0; idx < kbMatch.tags.length; idx++) {
        const mVec = lookupTagVectorInMatrix(kbMatch.tags[idx]);
        if (!mVec) continue;
        matchedTagsCount++;
        const w = Math.pow(0.88, idx);
        for (let d = 0; d < 6; d++) {
          raw[d] += w * mVec[d];
        }
      }
    }
    if (matchedTagsCount === 0 && input.category && CATEGORY_FALLBACK_TUPLES[input.category]) {
      const catVec = CATEGORY_FALLBACK_TUPLES[input.category];
      for (let d = 0; d < 6; d++) {
        raw[d] = catVec[d];
      }
    }
  }

  const maxDimVal = Math.max(...raw);
  if (maxDimVal <= 0) {
    return createZeroPvjVector();
  }

  // Upper-bound normalization to [0, 1]
  const normalized: PvjTuple = [
    raw[0] / maxDimVal,
    raw[1] / maxDimVal,
    raw[2] / maxDimVal,
    raw[3] / maxDimVal,
    raw[4] / maxDimVal,
    raw[5] / maxDimVal,
  ];

  return tupleToVector(normalized);
}

// ============================================================================
// 5. PASO 2: ENTROPÍA DE SHANNON Y ESPECIFICIDAD DEL JUEGO (ω_i)
// ============================================================================

export function computeGameSpecificityOmega(
  vectorG: PvjVector6D,
  gamma = 2
): {
  entropyH: number;
  specificityOmega: number;
  dominantDimension: PvjDimensionKey;
} {
  let sum = 0;
  let dominantDimension: PvjDimensionKey = 'D1_agonia';
  let dominantVal = -1;

  for (const key of PVJ_DIMENSION_KEYS) {
    const val = Math.max(0, vectorG[key] || 0);
    sum += val;
    if (val > dominantVal) {
      dominantVal = val;
      dominantDimension = key;
    }
  }

  if (sum <= 0) {
    return {
      entropyH: 1,
      specificityOmega: 0,
      dominantDimension,
    };
  }

  const ln6 = Math.log(6);
  let entropySum = 0;

  for (const key of PVJ_DIMENSION_KEYS) {
    const val = Math.max(0, vectorG[key] || 0);
    const p = val / sum;
    if (p > 0) {
      entropySum += p * Math.log(p);
    }
  }

  const entropyH = Math.min(1, Math.max(0, -entropySum / ln6));
  const specificityOmega = Math.min(1, Math.max(0, 1 - Math.pow(entropyH, gamma)));

  return {
    entropyH,
    specificityOmega,
    dominantDimension,
  };
}

// ============================================================================
// 6. PASO 3: PONDERACIÓN LOGARÍTMICA DEL TIEMPO + MODULADOR DE PREFERENCIA (W_i)
// ============================================================================

export interface TimeWeightParams {
  hours: number;
  recentHours?: number;
  rating?: GameRating;
  podiumRank?: 1 | 2 | 3;
  burnedOut?: boolean;
  alpha?: number;
  beta?: number;
}

export function getRatingMultiplier(rating?: GameRating): number {
  if (rating === 5) return 1.25;
  if (rating === 4) return 1.1;
  if (rating === 2) return 0.5;
  if (rating === 1) return 0.15;
  return 1.0; // 3★ or unrated explicit neutral
}

export function getPodiumMultiplier(rank?: 1 | 2 | 3): number {
  if (rank === 1) return 1.35;
  if (rank === 2) return 1.25;
  if (rank === 3) return 1.15;
  return 1.0;
}

export function computeLogarithmicTimeWeightW(params: TimeWeightParams): number {
  const {
    hours,
    recentHours = 0,
    rating,
    podiumRank,
    burnedOut = false,
    alpha = 0.5,
    beta = 1.5,
  } = params;

  // Discard noise: t_i < 60 mins (h_i < 1h)
  if (!Number.isFinite(hours) || hours < 1) {
    return 0;
  }

  const safeRecent = Number.isFinite(recentHours) && recentHours > 0 ? recentHours : 0;
  const baseW =
    Math.log(1 + hours) + alpha * Math.sqrt(hours) + beta * Math.log(1 + safeRecent);

  const podiumMult = getPodiumMultiplier(podiumRank);
  const ratingMult = getRatingMultiplier(rating);
  const burnoutMult = burnedOut ? 0.25 : 1.0;

  return baseW * podiumMult * ratingMult * burnoutMult;
}

// ============================================================================
// 7. MATRIZ SIMÉTRICA DE ARQUETIPOS (6 × 6) Y CLASIFICACIÓN (SECCIÓN 4)
// ============================================================================

export interface ArchetypeMeta {
  name: string;
  emoji: string;
  description: string;
}

export const POLYMATH_ARCHETYPE: ArchetypeMeta = {
  name: 'El Polímata / Nómada Digital',
  emoji: '🌌',
  description:
    'Disfrutás de todo el espectro gamer de manera equilibrada: pasás de la acción competitiva a la estrategia, la narrativa o el sandbox sin encerrarte en un único estilo.',
};

export const ARCHETYPE_MATRIX_6X6: Record<PvjDimensionKey, Record<PvjDimensionKey, ArchetypeMeta>> = {
  D1_agonia: {
    D1_agonia: {
      name: 'El Gladiador Puro',
      emoji: '⚔️',
      description:
        'Vivís para la adrenalina competitiva, la precisión mecánica y superar desafíos hostiles al límite.',
    },
    D2_ingenio: {
      name: 'Estratega de Combate',
      emoji: '🎯',
      description:
        'Combinás reflejos letales con lectura táctica del mapa, economía de partida y toma de decisiones bajo presión.',
    },
    D3_expresion: {
      name: 'Duelista Creativo',
      emoji: '⚡',
      description:
        'Buscás intensidad mecánica pero con libertad para improvisar builds, rutas o estilos poco convencionales.',
    },
    D4_narrativa: {
      name: 'Campeón del Lore',
      emoji: '🛡️',
      description:
        'Te motivan los combates exigentes cuando están envueltos en mundos profundos, épicos y memorables.',
    },
    D5_acumulacion: {
      name: 'Cazador de Élite',
      emoji: '🏹',
      description:
        'Competís duro para cazar el mejor loot, desbloquear maestrías y llevar tu equipamiento al máximo nivel.',
    },
    D6_sinergia: {
      name: 'Comandante de Escuadrón',
      emoji: '🎖️',
      description:
        'Liderás y coordinás al equipo en partidas de alta tensión: brillás cuando la mecánica se une al trabajo grupal.',
    },
  },
  D2_ingenio: {
    D1_agonia: {
      name: 'Estratega de Combate',
      emoji: '🎯',
      description:
        'Combinás reflejos letales con lectura táctica del mapa, economía de partida y toma de decisiones bajo presión.',
    },
    D2_ingenio: {
      name: 'La Mente Maestra',
      emoji: '🧠',
      description:
        'Tu combustible es la optimización pura, la macrogestión impecable y dominar sistemas complejos.',
    },
    D3_expresion: {
      name: 'Ingeniero de Sistemas',
      emoji: '⚙️',
      description:
        'Diseñás fábricas, arquitecturas y soluciones elegantes donde la lógica se convierte en creatividad espacial.',
    },
    D4_narrativa: {
      name: 'Táctico Narrativo',
      emoji: '📜',
      description:
        'Disfrutás planificando cada movimiento en campañas con historias densas, decisiones morales y consecuencias.',
    },
    D5_acumulacion: {
      name: 'Optimizador Teórico (Min-Maxer)',
      emoji: '📊',
      description:
        'Calculás sinergias, builds y estadísticas hasta exprimir el 100% matemático de cada progresión.',
    },
    D6_sinergia: {
      name: 'Coordinador Táctico',
      emoji: '🧭',
      description:
        'Sos el cerebro logístico de la escuadra: organizás roles, recursos y estrategias para que el grupo gane.',
    },
  },
  D3_expresion: {
    D1_agonia: {
      name: 'Duelista Creativo',
      emoji: '⚡',
      description:
        'Buscás intensidad mecánica pero con libertad para improvisar builds, rutas o estilos poco convencionales.',
    },
    D2_ingenio: {
      name: 'Ingeniero de Sistemas',
      emoji: '⚙️',
      description:
        'Diseñás fábricas, arquitecturas y soluciones elegantes donde la lógica se convierte en creatividad espacial.',
    },
    D3_expresion: {
      name: 'El Arquitecto Puro',
      emoji: '🎨',
      description:
        'Los mundos son tu lienzo: construís, experimentás, moddeás y redefinís las reglas del juego.',
    },
    D4_narrativa: {
      name: 'Demiurgo / Creador de Mundos',
      emoji: '🌍',
      description:
        'Construís espacios cargados de historia y atmósfera propia, disfrutando tanto crear como habitar el mundo.',
    },
    D5_acumulacion: {
      name: 'Artesano Coleccionista',
      emoji: '⚒️',
      description:
        'Recolectás materiales raros y desbloqueás planos para levantar bases cada vez más ambiciosas.',
    },
    D6_sinergia: {
      name: 'Constructor Comunitario',
      emoji: '🏗️',
      description:
        'Armás servidores, bases compartidas y proyectos creativos para que todo el grupo los disfrute.',
    },
  },
  D4_narrativa: {
    D1_agonia: {
      name: 'Campeón del Lore',
      emoji: '🛡️',
      description:
        'Te motivan los combates exigentes cuando están envueltos en mundos profundos, épicos y memorables.',
    },
    D2_ingenio: {
      name: 'Táctico Narrativo',
      emoji: '📜',
      description:
        'Disfrutás planificando cada movimiento en campañas con historias densas, decisiones morales y consecuencias.',
    },
    D3_expresion: {
      name: 'Demiurgo / Creador de Mundos',
      emoji: '🌍',
      description:
        'Construís espacios cargados de historia y atmósfera propia, disfrutando tanto crear como habitar el mundo.',
    },
    D4_narrativa: {
      name: 'El Viajero Inmersivo',
      emoji: '📖',
      description:
        'Buscás mundos vivos, personajes inolvidables, secretos y una inmersión total en cada relato.',
    },
    D5_acumulacion: {
      name: 'Cronista Completista',
      emoji: '🗝️',
      description:
        'Explorás cada rincón del mapa para completar misiones, códices, logros y coleccionables de la historia.',
    },
    D6_sinergia: {
      name: 'Bardo / Rolero Social',
      emoji: '🎭',
      description:
        'Convertís cada partida cooperativa en una anécdota épica compartida con tus amigos.',
    },
  },
  D5_acumulacion: {
    D1_agonia: {
      name: 'Cazador de Élite',
      emoji: '🏹',
      description:
        'Competís duro para cazar el mejor loot, desbloquear maestrías y llevar tu equipamiento al máximo nivel.',
    },
    D2_ingenio: {
      name: 'Optimizador Teórico (Min-Maxer)',
      emoji: '📊',
      description:
        'Calculás sinergias, builds y estadísticas hasta exprimir el 100% matemático de cada progresión.',
    },
    D3_expresion: {
      name: 'Artesano Coleccionista',
      emoji: '⚒️',
      description:
        'Recolectás materiales raros y desbloqueás planos para levantar bases cada vez más ambiciosas.',
    },
    D4_narrativa: {
      name: 'Cronista Completista',
      emoji: '🗝️',
      description:
        'Explorás cada rincón del mapa para completar misiones, códices, logros y coleccionables de la historia.',
    },
    D5_acumulacion: {
      name: 'El Coleccionista Absoluto',
      emoji: '💎',
      description:
        'Tu motor es el progreso continuo: subir números, perfeccionar equipamiento y alcanzar el 100%.',
    },
    D6_sinergia: {
      name: 'Veterano de Gremio',
      emoji: '🏰',
      description:
        'Farmear, raidear y equiparse siempre es mejor en grupo: sos el pilar constante de las campañas largas.',
    },
  },
  D6_sinergia: {
    D1_agonia: {
      name: 'Comandante de Escuadrón',
      emoji: '🎖️',
      description:
        'Liderás y coordinás al equipo en partidas de alta tensión: brillás cuando la mecánica se une al trabajo grupal.',
    },
    D2_ingenio: {
      name: 'Coordinador Táctico',
      emoji: '🧭',
      description:
        'Sos el cerebro logístico de la escuadra: organizás roles, recursos y estrategias para que el grupo gane.',
    },
    D3_expresion: {
      name: 'Constructor Comunitario',
      emoji: '🏗️',
      description:
        'Armás servidores, bases compartidas y proyectos creativos para que todo el grupo los disfrute.',
    },
    D4_narrativa: {
      name: 'Bardo / Rolero Social',
      emoji: '🎭',
      description:
        'Convertís cada partida cooperativa en una anécdota épica compartida con tus amigos.',
    },
    D5_acumulacion: {
      name: 'Veterano de Gremio',
      emoji: '🏰',
      description:
        'Farmear, raidear y equiparse siempre es mejor en grupo: sos el pilar constante de las campañas largas.',
    },
    D6_sinergia: {
      name: 'El Pilar Social',
      emoji: '🤝',
      description:
        'La previa, el Discord y las risas en equipo valen más que cualquier ranking: sos el alma de la juntada.',
    },
  },
};

export function classifyPvjVectorP(relativeP: PvjVector6D): {
  type: PvjClassificationType;
  primary_dimension: PvjDimensionKey;
  secondary_dimension: PvjDimensionKey | null;
  archetype_name: string;
  archetype_emoji: string;
  archetype_description: string;
} {
  const sorted = PVJ_DIMENSION_KEYS.map((key) => ({
    key,
    val: relativeP[key] || 0,
  })).sort((a, b) => b.val - a.val);

  const p1 = sorted[0];
  const p2 = sorted[1];
  const p4 = sorted[3];

  // Caso A: Arquetipo Puro (Especialista)
  if (p1.val >= 32 && p1.val - p2.val >= 10) {
    const meta = ARCHETYPE_MATRIX_6X6[p1.key][p1.key];
    return {
      type: 'PURE',
      primary_dimension: p1.key,
      secondary_dimension: null,
      archetype_name: meta.name,
      archetype_emoji: meta.emoji,
      archetype_description: meta.description,
    };
  }

  // Caso B: Arquetipo Polivalente (Omnijugador)
  if (p1.val < 22 && p1.val - p4.val < 8) {
    return {
      type: 'POLYMATH',
      primary_dimension: p1.key,
      secondary_dimension: null,
      archetype_name: POLYMATH_ARCHETYPE.name,
      archetype_emoji: POLYMATH_ARCHETYPE.emoji,
      archetype_description: POLYMATH_ARCHETYPE.description,
    };
  }

  // Caso C: Arquetipo Compuesto (Biclase)
  const meta = ARCHETYPE_MATRIX_6X6[p1.key][p2.key];
  return {
    type: 'COMPOUND',
    primary_dimension: p1.key,
    secondary_dimension: p2.key,
    archetype_name: meta.name,
    archetype_emoji: meta.emoji,
    archetype_description: meta.description,
  };
}

// ============================================================================
// 8. CONSOLIDACIÓN DE BIBLIOTECA DEL JUGADOR Y PIPELINE COMPLETO (PASOS 1 A 6)
// ============================================================================

interface ConsolidatedPlayerGame {
  normKey: string;
  appId: number;
  name: string;
  hours: number;
  recentHours: number;
  tags: string[];
  genres: string[];
  category?: string;
  tagVotes?: Record<string, number>;
  rating?: GameRating;
  podiumRank?: 1 | 2 | 3;
  burnedOut: boolean;
  isExplicitlyChosen: boolean;
}

function resolveBestPodiumRank(
  a?: 1 | 2 | 3,
  b?: 1 | 2 | 3
): 1 | 2 | 3 | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a < b ? a : b;
}

function mergeTagsUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  const out = [...existing];
  for (const tag of incoming) {
    const clean = tag.trim();
    if (!clean || clean.startsWith('steam:')) continue;
    const lower = clean.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      out.push(clean);
    }
  }
  return out;
}

export function computePlayerPvj6dProfile(
  player: PlayerProfile,
  allPreferences: UserGamePreference[] = [],
  catalogGames: Game[] = []
): PvjPlayerCategorizationResult {
  const gamesMap = new Map<string, ConsolidatedPlayerGame>();
  const appIdToKey = new Map<number, string>();

  const upsertGame = (incoming: {
    appId?: number;
    name: string;
    hours?: number;
    recentHours?: number;
    tags?: string[];
    genres?: string[];
    category?: string;
    tagVotes?: Record<string, number>;
    rating?: GameRating;
    podiumRank?: 1 | 2 | 3;
    burnedOut?: boolean;
    isExplicitlyChosen?: boolean;
  }) => {
    if (
      isNonGameSteamApp({
        appId: incoming.appId,
        name: incoming.name,
        tags: incoming.tags,
        genres: incoming.genres,
        tagVotes: incoming.tagVotes,
      })
    ) {
      return;
    }

    const normByName = normalizeGameName(incoming.name);
    if (!normByName) return;

    const canonicalKey =
      incoming.appId !== undefined && appIdToKey.has(incoming.appId)
        ? appIdToKey.get(incoming.appId)!
        : normByName;

    if (incoming.appId !== undefined && incoming.appId > 0) {
      appIdToKey.set(incoming.appId, canonicalKey);
    }

    const existing = gamesMap.get(canonicalKey);
    if (existing) {
      if (incoming.appId && existing.appId === 0) {
        existing.appId = incoming.appId;
      }
      if (incoming.hours !== undefined && incoming.hours > existing.hours) {
        existing.hours = incoming.hours;
      }
      if (incoming.recentHours !== undefined && incoming.recentHours > existing.recentHours) {
        existing.recentHours = incoming.recentHours;
      }
      if (incoming.tags && incoming.tags.length > 0) {
        existing.tags = mergeTagsUnique(existing.tags, incoming.tags);
      }
      if (incoming.genres && incoming.genres.length > 0) {
        existing.genres = mergeTagsUnique(existing.genres, incoming.genres);
      }
      if (!existing.category && incoming.category) {
        existing.category = incoming.category;
      }
      if (incoming.tagVotes && Object.keys(incoming.tagVotes).length > 0 && !existing.tagVotes) {
        existing.tagVotes = incoming.tagVotes;
      }
      if (incoming.rating !== undefined) {
        existing.rating = incoming.rating;
      }
      existing.podiumRank = resolveBestPodiumRank(existing.podiumRank, incoming.podiumRank);
      existing.burnedOut = existing.burnedOut || Boolean(incoming.burnedOut);
      existing.isExplicitlyChosen =
        existing.isExplicitlyChosen || Boolean(incoming.isExplicitlyChosen);
    } else {
      gamesMap.set(canonicalKey, {
        normKey: canonicalKey,
        appId: incoming.appId ?? 0,
        name: incoming.name,
        hours: incoming.hours ?? 0,
        recentHours: incoming.recentHours ?? 0,
        tags: mergeTagsUnique([], incoming.tags || []),
        genres: mergeTagsUnique([], incoming.genres || []),
        category: incoming.category,
        tagVotes: incoming.tagVotes,
        rating: incoming.rating,
        podiumRank: incoming.podiumRank,
        burnedOut: Boolean(incoming.burnedOut),
        isExplicitlyChosen: Boolean(incoming.isExplicitlyChosen),
      });
    }
  };

  // 1. Steam Owned Games
  for (const sg of player.steamProfile?.ownedGames || []) {
    if (sg.playsOverride === false) continue;
    const effectiveHours = sg.manualHoursOverride ?? sg.playtimeHours ?? 0;
    const effectiveRecent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours ?? 0;
    upsertGame({
      appId: sg.appId,
      name: sg.name,
      hours: effectiveHours,
      recentHours: effectiveRecent,
      tags: sg.tags,
      genres: sg.genres,
      tagVotes: sg.tagVotes,
      rating: sg.userRating,
      burnedOut: sg.burnedOut,
      isExplicitlyChosen: sg.playsOverride === true || sg.userRating !== undefined,
    });
  }

  // 2. External Rated Games (Riot, Epic, Battle.net, Game Pass, Steam Verde, etc.)
  for (const ext of player.tasteProfile?.externalGames || []) {
    upsertGame({
      appId: ext.steamAppId,
      name: ext.name,
      hours: ext.hoursPlayedEstimate ?? 0,
      recentHours: ext.recentHoursPlayed ?? 0,
      tags: ext.tags,
      category: ext.category,
      tagVotes: ext.tagVotes,
      rating: ext.rating,
      burnedOut: ext.burnedOut,
      isExplicitlyChosen: true,
    });
  }

  // 3. Club Catalog UserGamePreferences (plays === true)
  const catalogById = new Map<string, Game>(catalogGames.map((g) => [g.id, g]));
  const catalogHoursMap = player.tasteProfile?.catalogGameHours || {};
  for (const pref of allPreferences) {
    if (pref.userId !== player.id || !pref.plays) continue;
    const cg = catalogById.get(pref.gameId);
    if (!cg) continue;
    const steamTag = cg.tags.find((t) => t.startsWith('steam:'));
    const parsedAppId = steamTag ? Number(steamTag.slice(6)) : undefined;
    const persistedHours = catalogHoursMap[cg.id];
    upsertGame({
      appId: Number.isFinite(parsedAppId) ? parsedAppId : undefined,
      name: cg.name,
      hours: pref.hoursPlayed ?? persistedHours?.hoursPlayed ?? 0,
      recentHours: pref.recentHoursPlayed ?? persistedHours?.recentHoursPlayed ?? 0,
      tags: cg.tags,
      category: cg.category,
      rating: pref.rating,
      isExplicitlyChosen: true,
    });
  }

  // 4. Podio Top 3 Multiplayer & Singleplayer
  for (const p of player.tasteProfile?.topMultiplayerGames || []) {
    upsertGame({
      appId: p.steamAppId,
      name: p.name,
      hours: p.hoursPlayed ?? 0,
      recentHours: p.recentHoursPlayed ?? 0,
      tags: p.tags,
      category: p.category,
      podiumRank: p.rank,
      isExplicitlyChosen: true,
    });
  }
  for (const p of player.tasteProfile?.topSingleplayerGames || []) {
    upsertGame({
      appId: p.steamAppId,
      name: p.name,
      hours: p.hoursPlayed ?? 0,
      recentHours: p.recentHoursPlayed ?? 0,
      tags: p.tags,
      category: p.category,
      podiumRank: p.rank,
      isExplicitlyChosen: true,
    });
  }

  const allConsolidated = Array.from(gamesMap.values());
  const pendingHoursGamesCount = allConsolidated.filter(
    (g) => g.isExplicitlyChosen && g.hours < 1
  ).length;

  // Discard noise: t_i < 60 min (hours < 1), unless user only selected games without entering hours
  const gamesWithExplicitHours = allConsolidated.filter((g) => g.hours >= 1);
  const chosenFallback =
    gamesWithExplicitHours.length === 0
      ? allConsolidated
          .filter((g) => g.isExplicitlyChosen && !g.burnedOut)
          .map((g) => ({
            ...g,
            hours:
              g.podiumRank === 1
                ? 60
                : g.podiumRank === 2
                ? 45
                : g.podiumRank === 3
                ? 30
                : 25,
          }))
      : [];

  const validGames =
    gamesWithExplicitHours.length > 0 ? gamesWithExplicitHours : chosenFallback;

  if (validGames.length === 0) {
    return {
      steam_id: player.steamProfile?.steamId64 || player.id,
      valid_games_analyzed: 0,
      total_hours_analyzed: 0,
      pending_hours_games_count: pendingHoursGamesCount,
      vectors: {
        relative_distribution_P: createZeroPvjVector(),
        radar_scores_S: createZeroPvjVector(),
      },
      classification: {
        type: 'POLYMATH',
        primary_dimension: 'D6_sinergia',
        secondary_dimension: null,
        archetype_name: 'Sin Categorizar (Cargá ≥1h en tus juegos)',
        confidence_score: 0,
        archetype_emoji: '🧩',
        archetype_description:
          'Vinculá tu Steam o elegí tus juegos preferidos ingresando sus horas aproximadas (mínimo 1h) para calcular tu vector PVJ-6D.',
      },
      top_influencing_games: [],
    };
  }

  // Steps 1, 2, 3 per valid game
  interface ProcessedGameEntry {
    game: ConsolidatedPlayerGame;
    vectorG: PvjVector6D;
    omega: number;
    weightW: number;
    dominantDimension: PvjDimensionKey;
  }

  const processed: ProcessedGameEntry[] = [];
  let totalHoursAnalyzed = 0;

  for (const g of validGames) {
    const vectorG = computeGameVector6D({
      appId: g.appId > 0 ? g.appId : undefined,
      name: g.name,
      tags: g.tags,
      genres: g.genres,
      category: g.category,
      tagVotes: g.tagVotes,
    });

    const { specificityOmega, dominantDimension } = computeGameSpecificityOmega(vectorG, 2);
    const weightW = computeLogarithmicTimeWeightW({
      hours: g.hours,
      recentHours: g.recentHours,
      rating: g.rating,
      podiumRank: g.podiumRank,
      burnedOut: g.burnedOut,
    });

    if (weightW <= 0) continue;

    totalHoursAnalyzed += g.hours;
    processed.push({
      game: g,
      vectorG,
      omega: specificityOmega,
      weightW,
      dominantDimension,
    });
  }

  if (processed.length === 0) {
    return {
      steam_id: player.steamProfile?.steamId64 || player.id,
      valid_games_analyzed: 0,
      total_hours_analyzed: 0,
      pending_hours_games_count: pendingHoursGamesCount,
      vectors: {
        relative_distribution_P: createZeroPvjVector(),
        radar_scores_S: createZeroPvjVector(),
      },
      classification: {
        type: 'POLYMATH',
        primary_dimension: 'D6_sinergia',
        secondary_dimension: null,
        archetype_name: 'Sin Categorizar (Cargá ≥1h en tus juegos)',
        confidence_score: 0,
        archetype_emoji: '🧩',
        archetype_description:
          'Vinculá tu Steam o elegí tus juegos preferidos ingresando sus horas aproximadas (mínimo 1h) para calcular tu vector PVJ-6D.',
      },
      top_influencing_games: [],
    };
  }

  // Step 4: Agregación del Vector Bruto del Usuario (U^raw)
  const uRaw = createZeroPvjVector();
  let sumWeights = 0;
  let sumWeightedOmega = 0;

  for (const item of processed) {
    sumWeights += item.weightW;
    sumWeightedOmega += item.weightW * item.omega;
    for (const key of PVJ_DIMENSION_KEYS) {
      uRaw[key] += item.weightW * item.omega * item.vectorG[key];
    }
  }

  const maxURaw = Math.max(...PVJ_DIMENSION_KEYS.map((k) => uRaw[k]));

  // Step 5: Re-contextualización Bayesiana de Juegos Comodín (Always Active)
  const uFinal = createZeroPvjVector();
  if (maxURaw > 0) {
    for (const key of PVJ_DIMENSION_KEYS) {
      uFinal[key] = uRaw[key];
    }
    for (const item of processed) {
      const wildcardShare = 1 - item.omega;
      if (wildcardShare <= 0) continue;
      for (const key of PVJ_DIMENSION_KEYS) {
        const priorRatio = uRaw[key] / maxURaw;
        uFinal[key] += item.weightW * wildcardShare * (item.vectorG[key] * priorRatio);
      }
    }
  } else {
    // Graceful edge-case fallback when all games have omega === 0
    for (const item of processed) {
      for (const key of PVJ_DIMENSION_KEYS) {
        uFinal[key] += item.weightW * item.vectorG[key];
      }
    }
  }

  // Step 6: Normalización Final (P suma 100%, S escala 0..100)
  const sumUFinal = PVJ_DIMENSION_KEYS.reduce((acc, k) => acc + uFinal[k], 0);
  const maxUFinal = Math.max(...PVJ_DIMENSION_KEYS.map((k) => uFinal[k]));

  const relativeP = createZeroPvjVector();
  const radarS = createZeroPvjVector();

  for (const key of PVJ_DIMENSION_KEYS) {
    relativeP[key] =
      sumUFinal > 0 ? Math.round((uFinal[key] / sumUFinal) * 10000) / 100 : 0;
    radarS[key] =
      maxUFinal > 0 ? Math.round((uFinal[key] / maxUFinal) * 1000) / 10 : 0;
  }

  // Classification (Section 4)
  const classificationMeta = classifyPvjVectorP(relativeP);
  const weightedMeanOmega = sumWeights > 0 ? sumWeightedOmega / sumWeights : 0;
  const coverageFactor = Math.min(1, processed.length / 3);
  const confidenceScore =
    Math.round(Math.min(1, Math.max(0, weightedMeanOmega * coverageFactor)) * 1000) / 1000;

  // Top influencing games sorted by effective weight W_i
  const topInfluencingGames: PvjTopInfluencingGame[] = [...processed]
    .sort((a, b) => b.weightW - a.weightW)
    .slice(0, 8)
    .map((item) => ({
      app_id: item.game.appId,
      name: item.game.name,
      hours: Math.round(item.game.hours * 10) / 10,
      recent_hours:
        item.game.recentHours > 0
          ? Math.round(item.game.recentHours * 10) / 10
          : undefined,
      specificity_omega: Math.round(item.omega * 1000) / 1000,
      effective_weight_W: Math.round(item.weightW * 100) / 100,
      dominant_dimension: item.dominantDimension,
      dominant_dimension_label: PVJ_DIMENSION_MAP.get(item.dominantDimension)?.label,
      vector_g: item.vectorG,
    }));

  return {
    steam_id: player.steamProfile?.steamId64 || player.id,
    valid_games_analyzed: processed.length,
    total_hours_analyzed: Math.round(totalHoursAnalyzed * 10) / 10,
    pending_hours_games_count: pendingHoursGamesCount,
    vectors: {
      relative_distribution_P: relativeP,
      radar_scores_S: radarS,
    },
    classification: {
      type: classificationMeta.type,
      primary_dimension: classificationMeta.primary_dimension,
      secondary_dimension: classificationMeta.secondary_dimension,
      archetype_name: classificationMeta.archetype_name,
      confidence_score: confidenceScore,
      archetype_emoji: classificationMeta.archetype_emoji,
      archetype_description: classificationMeta.archetype_description,
    },
    top_influencing_games: topInfluencingGames,
  };
}

// ============================================================================
// 9. HELPERS DE CONTRATO JSON (SECCIÓN 5) E INSIGNIA PARA UI
// ============================================================================

export interface PvjStrictJsonContract {
  steam_id: string;
  valid_games_analyzed: number;
  total_hours_analyzed: number;
  vectors: {
    relative_distribution_P: PvjVector6D;
    radar_scores_S: PvjVector6D;
  };
  classification: {
    type: PvjClassificationType;
    primary_dimension: PvjDimensionKey;
    secondary_dimension: PvjDimensionKey | null;
    archetype_name: string;
    confidence_score: number;
  };
  top_influencing_games: Array<{
    app_id: number;
    name: string;
    hours: number;
    specificity_omega: number;
    effective_weight_W: number;
    dominant_dimension: PvjDimensionKey;
  }>;
}

export function buildStrictPvjContractJson(
  profile: PvjPlayerCategorizationResult
): PvjStrictJsonContract {
  return {
    steam_id: profile.steam_id,
    valid_games_analyzed: profile.valid_games_analyzed,
    total_hours_analyzed: profile.total_hours_analyzed,
    vectors: {
      relative_distribution_P: { ...profile.vectors.relative_distribution_P },
      radar_scores_S: { ...profile.vectors.radar_scores_S },
    },
    classification: {
      type: profile.classification.type,
      primary_dimension: profile.classification.primary_dimension,
      secondary_dimension: profile.classification.secondary_dimension,
      archetype_name: profile.classification.archetype_name,
      confidence_score: profile.classification.confidence_score,
    },
    top_influencing_games: profile.top_influencing_games.map((g) => ({
      app_id: g.app_id,
      name: g.name,
      hours: g.hours,
      specificity_omega: g.specificity_omega,
      effective_weight_W: g.effective_weight_W,
      dominant_dimension: g.dominant_dimension,
    })),
  };
}

export interface PlayerArchetypeBadgeInfo {
  hasData: boolean;
  name: string;
  emoji: string;
  type: PvjClassificationType;
  primaryDimension: PvjDimensionKey;
  secondaryDimension: PvjDimensionKey | null;
  primaryLabel: string;
  secondaryLabel?: string;
  confidencePct: number;
}

export function getPlayerArchetypeBadge(
  player: PlayerProfile,
  allPreferences: UserGamePreference[] = [],
  catalogGames: Game[] = []
): PlayerArchetypeBadgeInfo {
  const pvj =
    player.tasteProfile?.pvjProfile ??
    computePlayerPvj6dProfile(player, allPreferences, catalogGames);

  const hasData = pvj.valid_games_analyzed > 0;
  const primaryMeta = PVJ_DIMENSION_MAP.get(pvj.classification.primary_dimension);
  const secondaryMeta = pvj.classification.secondary_dimension
    ? PVJ_DIMENSION_MAP.get(pvj.classification.secondary_dimension)
    : undefined;

  return {
    hasData,
    name: hasData ? pvj.classification.archetype_name : 'Sin Categorizar',
    emoji: hasData ? pvj.classification.archetype_emoji || '🎮' : '🧩',
    type: pvj.classification.type,
    primaryDimension: pvj.classification.primary_dimension,
    secondaryDimension: pvj.classification.secondary_dimension,
    primaryLabel: primaryMeta ? primaryMeta.label : '',
    secondaryLabel: secondaryMeta ? secondaryMeta.label : undefined,
    confidencePct: Math.round(pvj.classification.confidence_score * 100),
  };
}
