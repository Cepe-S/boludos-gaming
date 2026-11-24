import { z } from 'zod';
import { GroupSubTab } from '@/lib/routes';
import {
  Game,
  GameRating,
  GamingGroup,
  PlayerProfile,
  UserGamePreference,
} from '@/types/domain';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  KnowledgeGameEntry,
  normalizeGameName,
} from '@/lib/tasteProfileEngine';
import { SearchedSteamGame } from '@/lib/steamService';

export type DetailSubTab = GroupSubTab;

export interface ColorPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  tailwindBg: string;
}

export const GROUP_COLOR_PRESETS: ColorPreset[] = [
  {
    id: 'blurple',
    label: 'Discord Blurple',
    from: '#5865F2',
    to: '#4752C4',
    tailwindBg: 'from-[#5865F2] to-[#4752C4]',
  },
  {
    id: 'emerald',
    label: 'Esmeralda',
    from: '#10b981',
    to: '#047857',
    tailwindBg: 'from-emerald-500 to-emerald-700',
  },
  {
    id: 'amber',
    label: 'Ámbar',
    from: '#f59e0b',
    to: '#b45309',
    tailwindBg: 'from-amber-500 to-amber-700',
  },
  {
    id: 'rose',
    label: 'Carmesí',
    from: '#f43f5e',
    to: '#be123c',
    tailwindBg: 'from-rose-500 to-rose-700',
  },
  {
    id: 'purple',
    label: 'Violeta',
    from: '#a855f7',
    to: '#6d28d9',
    tailwindBg: 'from-purple-500 to-violet-700',
  },
];

export function getGroupInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 'BG';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function getDeterministicGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return GROUP_COLOR_PRESETS[hash % GROUP_COLOR_PRESETS.length].tailwindBg;
}

export function buildInitialsSvgDataUrl(name: string, preset: ColorPreset): string {
  const initials = getGroupInitials(name || 'Nuevo Grupo');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${preset.from}"/><stop offset="100%" stop-color="${preset.to}"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="46">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del grupo debe tener al menos 2 caracteres.'),
  description: z.string().trim().max(280),
  avatarUrl: z.string().trim().optional(),
});

export type CreateGroupValues = z.infer<typeof createGroupSchema>;

export const identitySchema = z.object({
  name: z.string().trim().min(2, 'Ingresá al menos 2 caracteres.'),
  description: z.string().trim().max(280),
  avatarUrl: z.string().trim().optional(),
});

export type IdentityValues = z.infer<typeof identitySchema>;

export interface GroupGameMemberAffinity {
  player: PlayerProfile;
  rating?: GameRating;
  hoursPlayed?: number;
  recentHoursPlayed?: number;
  burnedOut?: boolean;
  sourceLabel: string;
}

export interface GroupGameCandidate {
  key: string;
  catalogGameId?: string;
  name: string;
  category: string;
  coverUrl: string;
  minPlayers: number;
  maxPlayers: number;
  tags: string[];
  averageDurationMins: number;
  memberAffinities: GroupGameMemberAffinity[];
  avgRating: number;
  totalHours: number;
}

export interface BuildGroupGameCandidatesParams {
  activeGroup: GamingGroup | null;
  groupGames: Game[];
  currentMembers: PlayerProfile[];
  games: Game[];
  preferences: UserGamePreference[];
  groupDiscoveryGames: KnowledgeGameEntry[];
  groupLiveSearchResults: SearchedSteamGame[];
  groupGameSearch: string;
}

/**
 * Aggregates candidate games from catalog, member preferences, Steam/external libraries,
 * discovery pool, and live search results with per-member affinity metadata.
 */
export function buildGroupGameCandidates({
  activeGroup,
  groupGames,
  currentMembers,
  games,
  preferences,
  groupDiscoveryGames,
  groupLiveSearchResults,
  groupGameSearch,
}: BuildGroupGameCandidatesParams): GroupGameCandidate[] {
  if (!activeGroup) return [];

  const linkedIds = new Set(activeGroup.gameIds);
  const linkedNames = new Set(groupGames.map((g) => normalizeGameName(g.name)));
  const memberById = new Map(currentMembers.map((m) => [m.id, m]));
  const map = new Map<
    string,
    Omit<GroupGameCandidate, 'memberAffinities' | 'avgRating' | 'totalHours'> & {
      affinityByUser: Map<string, GroupGameMemberAffinity>;
    }
  >();

  const ensureCandidate = (
    name: string,
    patch: Partial<
      Omit<GroupGameCandidate, 'key' | 'name' | 'memberAffinities' | 'avgRating' | 'totalHours'>
    >
  ) => {
    const key = normalizeGameName(name);
    if (!key || linkedNames.has(key)) return null;
    const existing = map.get(key);
    if (existing) {
      if (!existing.catalogGameId && patch.catalogGameId) {
        existing.catalogGameId = patch.catalogGameId;
      }
      if (!existing.coverUrl && patch.coverUrl) {
        existing.coverUrl = patch.coverUrl;
      }
      if (existing.tags.length === 0 && patch.tags && patch.tags.length > 0) {
        existing.tags = patch.tags;
      }
      return existing;
    }
    const created = {
      key,
      catalogGameId: patch.catalogGameId,
      name: name.trim(),
      category: patch.category || 'Co-op Acción',
      coverUrl: patch.coverUrl || '',
      minPlayers: patch.minPlayers ?? 1,
      maxPlayers: patch.maxPlayers ?? 4,
      tags: patch.tags ?? [],
      averageDurationMins: patch.averageDurationMins ?? 90,
      affinityByUser: new Map<string, GroupGameMemberAffinity>(),
    };
    map.set(key, created);
    return created;
  };

  const mergeAffinity = (
    entry: ReturnType<typeof ensureCandidate>,
    player: PlayerProfile,
    aff: Omit<GroupGameMemberAffinity, 'player'>
  ) => {
    if (!entry) return;
    const prev = entry.affinityByUser.get(player.id);
    if (!prev) {
      entry.affinityByUser.set(player.id, { player, ...aff });
      return;
    }
    entry.affinityByUser.set(player.id, {
      player,
      rating: prev.rating ?? aff.rating,
      hoursPlayed: Math.max(prev.hoursPlayed ?? 0, aff.hoursPlayed ?? 0) || undefined,
      recentHoursPlayed:
        Math.max(prev.recentHoursPlayed ?? 0, aff.recentHoursPlayed ?? 0) || undefined,
      burnedOut: Boolean(prev.burnedOut || aff.burnedOut),
      sourceLabel: prev.sourceLabel.includes(aff.sourceLabel)
        ? prev.sourceLabel
        : `${prev.sourceLabel} · ${aff.sourceLabel}`,
    });
  };

  // 1. Catalog games (Supabase)
  const catalogById = new Map<string, Game>();
  for (const g of games) {
    catalogById.set(g.id, g);
    if (linkedIds.has(g.id)) continue;
    ensureCandidate(g.name, {
      catalogGameId: g.id,
      category: g.category,
      coverUrl: g.coverUrl,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      tags: g.tags,
      averageDurationMins: g.averageDurationMins,
    });
  }

  // 2. Group members' explicit preferences
  for (const pref of preferences) {
    if (!pref.plays) continue;
    const member = memberById.get(pref.userId);
    const catGame = catalogById.get(pref.gameId);
    if (!member || !catGame || linkedIds.has(catGame.id)) continue;
    const entry = ensureCandidate(catGame.name, {
      catalogGameId: catGame.id,
      category: catGame.category,
      coverUrl: catGame.coverUrl,
      minPlayers: catGame.minPlayers,
      maxPlayers: catGame.maxPlayers,
      tags: catGame.tags,
      averageDurationMins: catGame.averageDurationMins,
    });
    mergeAffinity(entry, member, {
      rating: pref.rating,
      hoursPlayed: pref.hoursPlayed,
      recentHoursPlayed: pref.recentHoursPlayed,
      sourceLabel: 'Librería',
    });
  }

  // 3. Group members' Steam libraries & external games
  for (const member of currentMembers) {
    for (const sg of member.steamProfile?.ownedGames || []) {
      const hours = sg.manualHoursOverride ?? sg.playtimeHours;
      const recent = sg.manualRecentHoursOverride ?? sg.playtimeRecentHours;
      if (!sg.userRating && hours <= 0 && !sg.selectedForCatalog) continue;
      const entry = ensureCandidate(sg.name, {
        category: sg.genres[0] || 'Co-op Acción',
        coverUrl: sg.headerImageUrl,
        minPlayers: sg.minPlayers || 1,
        maxPlayers: sg.isMultiplayer ? Math.max(4, sg.minPlayers || 4) : 1,
        tags: sg.tags || [],
      });
      mergeAffinity(entry, member, {
        rating: sg.userRating,
        hoursPlayed: hours > 0 ? Math.round(hours * 10) / 10 : undefined,
        recentHoursPlayed: recent > 0 ? Math.round(recent * 10) / 10 : undefined,
        burnedOut: sg.burnedOut,
        sourceLabel: 'Steam',
      });
    }

    for (const ext of member.tasteProfile?.externalGames || []) {
      const entry = ensureCandidate(ext.name, {
        category: ext.category || 'Co-op Acción',
        coverUrl: ext.coverUrl || '',
        minPlayers: ext.minPlayers || 1,
        maxPlayers: ext.maxPlayers || 4,
        tags: ext.tags || [],
      });
      mergeAffinity(entry, member, {
        rating: ext.rating,
        hoursPlayed: ext.hoursPlayedEstimate,
        burnedOut: ext.burnedOut,
        sourceLabel: ext.platform,
      });
    }
  }

  // 4. Discovery pool (IGDB / SteamSpy or Knowledge Base fallback)
  const discoveryPool =
    groupDiscoveryGames.length > 0 ? groupDiscoveryGames : GLOBAL_GAMES_KNOWLEDGE_BASE;
  for (const dg of discoveryPool) {
    ensureCandidate(dg.name, {
      category: dg.category,
      coverUrl: dg.coverUrl,
      minPlayers: dg.minPlayers,
      maxPlayers: dg.maxPlayers,
      tags: dg.tags,
    });
  }

  // 5. Live search results
  for (const lr of groupLiveSearchResults) {
    ensureCandidate(lr.name, {
      category: lr.category,
      coverUrl: lr.headerImageUrl,
      minPlayers: lr.minPlayers,
      maxPlayers: lr.maxPlayers,
      tags: lr.tags,
    });
  }

  const query = groupGameSearch.trim().toLowerCase();
  const list: GroupGameCandidate[] = [];

  for (const raw of map.values()) {
    const affinities = Array.from(raw.affinityByUser.values()).sort(
      (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.hoursPlayed ?? 0) - (a.hoursPlayed ?? 0)
    );
    if (query) {
      const matchesQuery =
        raw.name.toLowerCase().includes(query) ||
        raw.category.toLowerCase().includes(query) ||
        raw.tags.some((t) => t.toLowerCase().includes(query)) ||
        affinities.some((a) => a.player.displayName.toLowerCase().includes(query));
      if (!matchesQuery) continue;
    }

    const rated = affinities.filter((a) => typeof a.rating === 'number');
    const avgRating =
      rated.length > 0
        ? rated.reduce((sum, a) => sum + (a.rating ?? 0), 0) / rated.length
        : 0;
    const totalHours = affinities.reduce((sum, a) => sum + (a.hoursPlayed ?? 0), 0);

    list.push({
      key: raw.key,
      catalogGameId: raw.catalogGameId,
      name: raw.name,
      category: raw.category,
      coverUrl: raw.coverUrl,
      minPlayers: raw.minPlayers,
      maxPlayers: raw.maxPlayers,
      tags: raw.tags,
      averageDurationMins: raw.averageDurationMins,
      memberAffinities: affinities,
      avgRating,
      totalHours,
    });
  }

  list.sort((a, b) => {
    if (b.memberAffinities.length !== a.memberAffinities.length) {
      return b.memberAffinities.length - a.memberAffinities.length;
    }
    if (b.avgRating !== a.avgRating) {
      return b.avgRating - a.avgRating;
    }
    if (b.totalHours !== a.totalHours) {
      return b.totalHours - a.totalHours;
    }
    return a.name.localeCompare(b.name);
  });

  return list;
}
