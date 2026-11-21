export const DEFAULT_DDRAGON_VERSION = '15.22.1';

export interface DdragonSpellMeta {
  id: number;
  key: string;
  name: string;
  description?: string;
}

export interface DdragonRuneMeta {
  id: number;
  key: string;
  name: string;
  icon: string;
  shortDesc?: string;
  styleId?: number;
}

export interface DdragonStyleMeta {
  id: number;
  key: string;
  name: string;
  icon: string;
}

export const LOL_PLATFORM_OPTIONS = [
  { id: 'la2', label: 'LAS (LA2)', short: 'LAS' },
  { id: 'la1', label: 'LAN (LA1)', short: 'LAN' },
  { id: 'br1', label: 'Brasil (BR1)', short: 'BR' },
  { id: 'na1', label: 'Norteamérica (NA1)', short: 'NA' },
  { id: 'euw1', label: 'Europa Oeste (EUW1)', short: 'EUW' },
  { id: 'eun1', label: 'Europa Nórdica (EUN1)', short: 'EUNE' },
  { id: 'kr', label: 'Corea (KR)', short: 'KR' },
  { id: 'jp1', label: 'Japón (JP1)', short: 'JP' },
  { id: 'oc1', label: 'Oceanía (OC1)', short: 'OCE' },
] as const;

export const FALLBACK_SUMMONER_SPELLS: Record<number, DdragonSpellMeta> = {
  1: { id: 1, key: 'SummonerBoost', name: 'Purificación' },
  3: { id: 3, key: 'SummonerExhaust', name: 'Extenuación' },
  4: { id: 4, key: 'SummonerFlash', name: 'Destello' },
  6: { id: 6, key: 'SummonerHaste', name: 'Fantasmal' },
  7: { id: 7, key: 'SummonerHeal', name: 'Curación' },
  11: { id: 11, key: 'SummonerSmite', name: 'Castigo' },
  12: { id: 12, key: 'SummonerTeleport', name: 'Teleportación' },
  13: { id: 13, key: 'SummonerMana', name: 'Claridad' },
  14: { id: 14, key: 'SummonerDot', name: 'Ignición' },
  21: { id: 21, key: 'SummonerBarrier', name: 'Barrera' },
  32: { id: 32, key: 'SummonerSnowball', name: 'Marca' },
  39: { id: 39, key: 'SummonerSnowURFSnowball_Mark', name: 'Marca' },
  2201: { id: 2201, key: 'SummonerCherryHold', name: 'Huida' },
  2202: { id: 2202, key: 'SummonerCherryFlash', name: 'Destello (Arena)' },
};

export const FALLBACK_RUNE_STYLES: Record<number, DdragonStyleMeta> = {
  8000: {
    id: 8000,
    key: 'Precision',
    name: 'Precisión',
    icon: 'perk-images/Styles/7201_Precision.png',
  },
  8100: {
    id: 8100,
    key: 'Domination',
    name: 'Dominación',
    icon: 'perk-images/Styles/7200_Domination.png',
  },
  8200: {
    id: 8200,
    key: 'Sorcery',
    name: 'Brujería',
    icon: 'perk-images/Styles/7202_Sorcery.png',
  },
  8300: {
    id: 8300,
    key: 'Inspiration',
    name: 'Inspiración',
    icon: 'perk-images/Styles/7203_Whimsy.png',
  },
  8400: {
    id: 8400,
    key: 'Resolve',
    name: 'Valor',
    icon: 'perk-images/Styles/7204_Resolve.png',
  },
};

export const FALLBACK_KEYSTONE_RUNES: Record<number, DdragonRuneMeta> = {
  // Precision
  8005: {
    id: 8005,
    key: 'PressTheAttack',
    name: 'Ataque Intensificado',
    icon: 'perk-images/Styles/Precision/PressTheAttack/PressTheAttack.png',
    styleId: 8000,
  },
  8008: {
    id: 8008,
    key: 'LethalTempo',
    name: 'Compás Letal',
    icon: 'perk-images/Styles/Precision/LethalTempo/LethalTempoTemp.png',
    styleId: 8000,
  },
  8021: {
    id: 8021,
    key: 'FleetFootwork',
    name: 'Pies Veloces',
    icon: 'perk-images/Styles/Precision/FleetFootwork/FleetFootwork.png',
    styleId: 8000,
  },
  8010: {
    id: 8010,
    key: 'Conqueror',
    name: 'Conquistador',
    icon: 'perk-images/Styles/Precision/Conqueror/Conqueror.png',
    styleId: 8000,
  },
  // Domination
  8112: {
    id: 8112,
    key: 'Electrocute',
    name: 'Electrocutar',
    icon: 'perk-images/Styles/Domination/Electrocute/Electrocute.png',
    styleId: 8100,
  },
  8128: {
    id: 8128,
    key: 'DarkHarvest',
    name: 'Cosecha Oscura',
    icon: 'perk-images/Styles/Domination/DarkHarvest/DarkHarvest.png',
    styleId: 8100,
  },
  9923: {
    id: 9923,
    key: 'HailOfBlades',
    name: 'Lluvia de Espadas',
    icon: 'perk-images/Styles/Domination/HailOfBlades/HailOfBlades.png',
    styleId: 8100,
  },
  // Sorcery
  8214: {
    id: 8214,
    key: 'SummonAery',
    name: 'Invocar a Aery',
    icon: 'perk-images/Styles/Sorcery/SummonAery/SummonAery.png',
    styleId: 8200,
  },
  8229: {
    id: 8229,
    key: 'ArcaneComet',
    name: 'Cometa Arcano',
    icon: 'perk-images/Styles/Sorcery/ArcaneComet/ArcaneComet.png',
    styleId: 8200,
  },
  8230: {
    id: 8230,
    key: 'PhaseRush',
    name: 'Irrupción de Fase',
    icon: 'perk-images/Styles/Sorcery/PhaseRush/PhaseRush.png',
    styleId: 8200,
  },
  // Resolve
  8437: {
    id: 8437,
    key: 'GraspOfTheUndying',
    name: 'Aliento del Agónico',
    icon: 'perk-images/Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png',
    styleId: 8400,
  },
  8439: {
    id: 8439,
    key: 'Aftershock',
    name: 'Réplica',
    icon: 'perk-images/Styles/Resolve/VeteranAftershock/VeteranAftershock.png',
    styleId: 8400,
  },
  8465: {
    id: 8465,
    key: 'Guardian',
    name: 'Guardián',
    icon: 'perk-images/Styles/Resolve/Guardian/Guardian.png',
    styleId: 8400,
  },
  // Inspiration
  8351: {
    id: 8351,
    key: 'GlacialAugment',
    name: 'Aumento Glacial',
    icon: 'perk-images/Styles/Inspiration/GlacialAugment/GlacialAugment.png',
    styleId: 8300,
  },
  8360: {
    id: 8360,
    key: 'UnsealedSpellbook',
    name: 'Libro de Hechizos Abierto',
    icon: 'perk-images/Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png',
    styleId: 8300,
  },
  8369: {
    id: 8369,
    key: 'FirstStrike',
    name: 'Primer Golpe',
    icon: 'perk-images/Styles/Inspiration/FirstStrike/FirstStrike.png',
    styleId: 8300,
  },
};

export const STAT_SHARD_META: Record<number, { name: string; short: string; icon: string }> = {
  5001: {
    name: 'Vida Escalable (+10-180)',
    short: 'HP+',
    icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png',
  },
  5002: {
    name: 'Armadura',
    short: 'ARM',
    icon: 'perk-images/StatMods/StatModsArmorIcon.png',
  },
  5003: {
    name: 'Resistencia Mágica',
    short: 'MR',
    icon: 'perk-images/StatMods/StatModsMagicResIcon.png',
  },
  5005: {
    name: 'Velocidad de Ataque (+10%)',
    short: 'AS',
    icon: 'perk-images/StatMods/StatModsAttackSpeedIcon.png',
  },
  5007: {
    name: 'Aceleración de Habilidad (+8)',
    short: 'AH',
    icon: 'perk-images/StatMods/StatModsCDRScalingIcon.png',
  },
  5008: {
    name: 'Fuerza Adaptable (+9)',
    short: 'AF',
    icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png',
  },
  5010: {
    name: 'Velocidad de Movimiento (+2%)',
    short: 'MS',
    icon: 'perk-images/StatMods/StatModsMovementSpeedIcon.png',
  },
  5011: {
    name: 'Vida Fija (+65)',
    short: 'HP',
    icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png',
  },
  5013: {
    name: 'Tenacidad y Resist. Ralent. (+10%)',
    short: 'TEN',
    icon: 'perk-images/StatMods/StatModsTenacityIcon.png',
  },
};

export const QUEUE_LABELS: Record<number, string> = {
  0: 'Personalizada',
  400: 'Normal Reclutamiento',
  420: 'Ranked Solo/Duo',
  430: 'Normal Oculta',
  440: 'Ranked Flex',
  450: 'ARAM',
  480: 'Partida Rápida',
  490: 'Quickplay',
  700: 'Clash',
  720: 'ARAM Clash',
  830: 'Co-op Intro',
  840: 'Co-op Principiante',
  850: 'Co-op Intermedio',
  870: 'Co-op Intro',
  880: 'Co-op Principiante',
  890: 'Co-op Intermedio',
  900: 'ARURF',
  1020: 'Todos para Uno',
  1300: 'Nexus Blitz',
  1400: 'Libro Definitivo',
  1700: 'Arena',
  1710: 'Arena',
  1900: 'URF',
};

export const MAP_LABELS: Record<number, string> = {
  11: 'Grieta del Invocador',
  12: 'Abismo de los Lamentos',
  21: 'Nexus Blitz',
  30: 'Coliseo (Arena)',
};

export const ROLE_LABELS: Record<string, string> = {
  TOP: 'Top',
  JUNGLE: 'Jungla',
  MIDDLE: 'Mid',
  BOTTOM: 'ADC',
  UTILITY: 'Support',
  ARAM: 'ARAM',
  ARENA: 'Arena',
};

const CHAMPION_KEY_FIXES: Record<string, string> = {
  fiddlesticks: 'Fiddlesticks',
  wukong: 'MonkeyKing',
  monkeyking: 'MonkeyKing',
  renataglasc: 'Renata',
  renata: 'Renata',
  nunuwillump: 'Nunu',
  nunu: 'Nunu',
  belveth: 'Belveth',
  kaisa: 'Kaisa',
  khazix: 'Khazix',
  chogath: 'Chogath',
  velkoz: 'Velkoz',
  reksai: 'RekSai',
  kogmaw: 'KogMaw',
  ksante: 'KSante',
  drmundo: 'DrMundo',
  jarvaniv: 'JarvanIV',
  leesin: 'LeeSin',
  masteryi: 'MasterYi',
  missfortune: 'MissFortune',
  tahmkench: 'TahmKench',
  twistedfate: 'TwistedFate',
  xinzhao: 'XinZhao',
  aurelionsol: 'AurelionSol',
};

export function normalizeChampionKey(championName: string): string {
  const raw = (championName || '').trim();
  if (!raw) return 'Aatrox';
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (CHAMPION_KEY_FIXES[compact]) {
    return CHAMPION_KEY_FIXES[compact];
  }
  if (raw === 'FiddleSticks') return 'Fiddlesticks';
  return raw.replace(/['.\s&]/g, '');
}

export function getChampionIconUrl(
  championName: string,
  version: string = DEFAULT_DDRAGON_VERSION
): string {
  const key = normalizeChampionKey(championName);
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${key}.png`;
}

export function getProfileIconUrl(
  iconId: number,
  version: string = DEFAULT_DDRAGON_VERSION
): string {
  const safeId = Number.isFinite(iconId) && iconId > 0 ? iconId : 29;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${safeId}.png`;
}

export function getItemIconUrl(
  itemId: number,
  version: string = DEFAULT_DDRAGON_VERSION
): string | null {
  if (!Number.isFinite(itemId) || itemId <= 0) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export function getSpellMeta(spellId: number): DdragonSpellMeta | null {
  return liveSpellMap.get(spellId) ?? FALLBACK_SUMMONER_SPELLS[spellId] ?? null;
}

export function getSpellIconUrl(
  spellId: number,
  version: string = DEFAULT_DDRAGON_VERSION
): string | null {
  const meta = getSpellMeta(spellId);
  if (!meta) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${meta.key}.png`;
}

export function getRuneMeta(runeId: number): DdragonRuneMeta | null {
  return liveRuneMap.get(runeId) ?? FALLBACK_KEYSTONE_RUNES[runeId] ?? null;
}

export function getRuneIconUrl(runeId: number): string | null {
  const meta = getRuneMeta(runeId);
  if (meta?.icon) {
    return `https://ddragon.leagueoflegends.com/cdn/img/${meta.icon}`;
  }
  const shard = STAT_SHARD_META[runeId];
  if (shard?.icon) {
    return `https://ddragon.leagueoflegends.com/cdn/img/${shard.icon}`;
  }
  return null;
}

export function getRuneStyleMeta(styleId: number): DdragonStyleMeta | null {
  return liveStyleMap.get(styleId) ?? FALLBACK_RUNE_STYLES[styleId] ?? null;
}

export function getRuneStyleIconUrl(styleId: number): string | null {
  const meta = getRuneStyleMeta(styleId);
  if (!meta?.icon) return null;
  return `https://ddragon.leagueoflegends.com/cdn/img/${meta.icon}`;
}

export function formatQueueLabel(queueId: number, gameMode?: string): string {
  if (QUEUE_LABELS[queueId]) return QUEUE_LABELS[queueId];
  if (gameMode === 'ARAM') return 'ARAM';
  if (gameMode === 'CHERRY') return 'Arena';
  if (gameMode === 'CLASSIC') return 'Grieta';
  return gameMode || `Cola ${queueId}`;
}

export function formatMapLabel(mapId: number): string {
  return MAP_LABELS[mapId] || `Mapa ${mapId}`;
}

export function formatRoleLabel(role: string): string {
  const upper = (role || '').toUpperCase();
  return ROLE_LABELS[upper] || upper || 'Flex';
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatRelativeTime(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '—';
  const diffMs = Math.max(0, Date.now() - timestampMs);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Recién';
  if (mins < 60) return `Hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  const months = Math.floor(days / 30);
  return `Hace ${months}mes`;
}

export function formatCompactNumber(num: number): string {
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return String(Math.round(num));
}

export function formatTierLabel(tier?: string, rank?: string): string {
  if (!tier) return 'Unranked';
  const tierNames: Record<string, string> = {
    IRON: 'Hierro',
    BRONZE: 'Bronce',
    SILVER: 'Plata',
    GOLD: 'Oro',
    PLATINUM: 'Platino',
    EMERALD: 'Esmeralda',
    DIAMOND: 'Diamante',
    MASTER: 'Master',
    GRANDMASTER: 'Grandmaster',
    CHALLENGER: 'Challenger',
  };
  const label = tierNames[tier.toUpperCase()] || tier;
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier.toUpperCase())) {
    return label;
  }
  return rank ? `${label} ${rank}` : label;
}

export function getTierColorClasses(tier?: string): string {
  switch ((tier || '').toUpperCase()) {
    case 'IRON':
      return 'border-zinc-500/40 bg-zinc-500/15 text-zinc-300';
    case 'BRONZE':
      return 'border-amber-700/40 bg-amber-700/15 text-amber-400';
    case 'SILVER':
      return 'border-slate-400/40 bg-slate-400/15 text-slate-300';
    case 'GOLD':
      return 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300';
    case 'PLATINUM':
      return 'border-cyan-400/40 bg-cyan-400/15 text-cyan-300';
    case 'EMERALD':
      return 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300';
    case 'DIAMOND':
      return 'border-sky-400/40 bg-sky-400/15 text-sky-300';
    case 'MASTER':
      return 'border-purple-400/40 bg-purple-400/15 text-purple-300';
    case 'GRANDMASTER':
      return 'border-rose-400/40 bg-rose-400/15 text-rose-300';
    case 'CHALLENGER':
      return 'border-amber-300/50 bg-amber-300/20 text-amber-200';
    default:
      return 'border-border bg-secondary/60 text-muted-foreground';
  }
}

export function getGradeColorClasses(grade: string): string {
  switch (grade) {
    case 'S+':
      return 'border-amber-400/60 bg-amber-400/20 text-amber-300';
    case 'S':
      return 'border-amber-500/45 bg-amber-500/15 text-amber-300';
    case 'A+':
      return 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300';
    case 'A':
      return 'border-success/45 bg-success/15 text-success';
    case 'B':
      return 'border-primary/45 bg-primary/15 text-primary';
    case 'C':
      return 'border-border bg-secondary text-muted-foreground';
    default:
      return 'border-destructive/45 bg-destructive/15 text-destructive';
  }
}

// ---------------------------------------------------------------------------
// Live Data Dragon Cache & Loader
// ---------------------------------------------------------------------------

let cachedLatestVersion: string | null = null;
let versionFetchPromise: Promise<string> | null = null;

const liveSpellMap = new Map<number, DdragonSpellMeta>();
const liveRuneMap = new Map<number, DdragonRuneMeta>();
const liveStyleMap = new Map<number, DdragonStyleMeta>();
const loadedVersions = new Set<string>();
let staticFetchPromise: Promise<void> | null = null;

export async function fetchLatestDdragonVersion(): Promise<string> {
  if (cachedLatestVersion) return cachedLatestVersion;
  if (versionFetchPromise) return versionFetchPromise;

  versionFetchPromise = (async () => {
    try {
      const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      if (!res.ok) return DEFAULT_DDRAGON_VERSION;
      const versions = (await res.json()) as unknown;
      if (Array.isArray(versions) && typeof versions[0] === 'string') {
        cachedLatestVersion = versions[0];
        return cachedLatestVersion;
      }
      return DEFAULT_DDRAGON_VERSION;
    } catch {
      return DEFAULT_DDRAGON_VERSION;
    } finally {
      versionFetchPromise = null;
    }
  })();

  return versionFetchPromise;
}

interface RawDdragonRuneNode {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc?: string;
}

interface RawDdragonStyleNode {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: Array<{ runes: RawDdragonRuneNode[] }>;
}

interface RawDdragonSummonerJson {
  data?: Record<
    string,
    {
      id: string;
      key: string;
      name: string;
      description?: string;
    }
  >;
}

export async function loadDdragonRunesAndSpells(preferredVersion?: string): Promise<string> {
  const version = preferredVersion || (await fetchLatestDdragonVersion());
  if (loadedVersions.has(version)) return version;

  if (!staticFetchPromise) {
    staticFetchPromise = (async () => {
      const tryFetchJson = async <T>(urls: string[]): Promise<T | null> => {
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              return (await res.json()) as T;
            }
          } catch {
            // Try fallback locale
          }
        }
        return null;
      };

      const [runesData, spellsData] = await Promise.all([
        tryFetchJson<RawDdragonStyleNode[]>([
          `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_AR/runesReforged.json`,
          `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/runesReforged.json`,
        ]),
        tryFetchJson<RawDdragonSummonerJson>([
          `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_AR/summoner.json`,
          `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/summoner.json`,
        ]),
      ]);

      if (Array.isArray(runesData)) {
        for (const style of runesData) {
          liveStyleMap.set(style.id, {
            id: style.id,
            key: style.key,
            name: style.name,
            icon: style.icon,
          });
          for (const slot of style.slots || []) {
            for (const rune of slot.runes || []) {
              liveRuneMap.set(rune.id, {
                id: rune.id,
                key: rune.key,
                name: rune.name,
                icon: rune.icon,
                shortDesc: rune.shortDesc,
                styleId: style.id,
              });
            }
          }
        }
      }

      if (spellsData?.data) {
        for (const spell of Object.values(spellsData.data)) {
          const numericId = Number(spell.key);
          if (Number.isFinite(numericId) && numericId > 0) {
            liveSpellMap.set(numericId, {
              id: numericId,
              key: spell.id,
              name: spell.name,
              description: spell.description,
            });
          }
        }
      }

      loadedVersions.add(version);
    })().finally(() => {
      staticFetchPromise = null;
    });
  }

  await staticFetchPromise;
  return version;
}
