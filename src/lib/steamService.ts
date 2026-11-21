import { PlayerSteamProfile, SteamOwnedGame } from '../types/domain';
import { supabaseAnonKey, supabaseUrl } from './supabaseClient';
import {
  enrichAndSortSteamLibrary,
  inferGameMetadataAndVector,
  isNonGameSteamApp,
  KnowledgeGameEntry,
} from './tasteProfileEngine';

export interface IgdbCredentialsConfig {
  igdbClientId?: string;
  igdbClientSecret?: string;
}

export interface SearchedSteamGame {
  igdbId?: number;
  appId?: number;
  name: string;
  summary?: string;
  headerImageUrl: string;
  category: string;
  genres: string[];
  tags: string[];
  tagVotes?: Record<string, number>;
  isMultiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  rating?: number;
  source: 'igdb' | 'steam';
}

export interface SteamImportResult {
  ok: boolean;
  message: string;
  profile?: PlayerSteamProfile;
  igdbEnrichedCount?: number;
  steamSpyEnrichedCount?: number;
}

interface EdgeGamePayload {
  appId?: number;
  igdbId?: number;
  name: string;
  summary?: string;
  playtimeHours?: number;
  playtimeRecentHours?: number;
  headerImageUrl: string;
  iconUrl?: string;
  lastPlayedAt?: string;
  genres?: string[];
  tags?: string[];
  tagVotes?: Record<string, number>;
  isMultiplayer?: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  rating?: number;
  releaseYear?: number;
  isNewRelease?: boolean;
  source?: 'igdb' | 'steam';
}

/**
 * Fetches and synchronizes a user's Steam library via Supabase Edge Function `steam-import`.
 * Enriches top/considerable games with IGDB + SteamSpy metadata, computes playtimes,
 * sorts considerable games first, and pre-fills suggested 1-5★ ratings.
 */
export async function fetchSteamProfileLibrary(
  steamUrlOrId: string,
  customApiKey?: string,
  igdbConfig?: IgdbCredentialsConfig
): Promise<SteamImportResult> {
  const cleanInput = steamUrlOrId.trim();
  if (!cleanInput) {
    return {
      ok: false,
      message: 'Debes ingresar un Steam ID, Vanity URL o link de perfil.',
    };
  }

  const endpoint = `${supabaseUrl}/functions/v1/steam-import`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        action: 'import_profile',
        steamUrlOrId: cleanInput,
        steamApiKey: customApiKey?.trim() || undefined,
        igdbClientId: igdbConfig?.igdbClientId?.trim() || undefined,
        igdbClientSecret: igdbConfig?.igdbClientSecret?.trim() || undefined,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      const errorMessage =
        data?.error ||
        (data?.code === 'MISSING_API_KEY'
          ? 'Falta configurar STEAM_WEB_API_KEY en Supabase o en la app.'
          : data?.code === 'PRIVATE_PROFILE'
          ? 'Tu perfil o lista de juegos de Steam está en Privado. Cambialo a Público en Steam e intentá de nuevo.'
          : `Error al consultar el perfil de Steam (HTTP ${res.status}).`);

      return {
        ok: false,
        message: errorMessage,
      };
    }

    const rawProfile = data.profile as
      | {
          steamId64: string;
          profileUrl: string;
          personaName?: string;
          avatarUrl?: string;
          games?: EdgeGamePayload[];
        }
      | undefined;

    if (!rawProfile) {
      return {
        ok: false,
        message: 'No se recibieron datos de perfil desde la API de Steam.',
      };
    }

    const rawGamesNormalized = (rawProfile.games || [])
      .filter((g): g is EdgeGamePayload & { appId: number } => typeof g.appId === 'number')
      .map((g) => ({
        appId: g.appId,
        igdbId: g.igdbId,
        name: g.name,
        playtimeHours: Number(g.playtimeHours || 0),
        playtimeRecentHours: Number(g.playtimeRecentHours || 0),
        headerImageUrl: g.headerImageUrl,
        iconUrl: g.iconUrl,
        lastPlayedAt: g.lastPlayedAt,
        genres: g.genres,
        tags: g.tags,
        tagVotes: g.tagVotes,
        isMultiplayer: g.isMultiplayer,
        minPlayers: g.minPlayers,
        maxPlayers: g.maxPlayers,
        source: g.source,
      }));

    // Enrich and sort raw games using the taste profile engine
    const enrichment = enrichAndSortSteamLibrary(rawGamesNormalized);
    const ownedGames: SteamOwnedGame[] = enrichment.games;

    const profile: PlayerSteamProfile = {
      steamId64: String(rawProfile.steamId64),
      profileUrl: String(rawProfile.profileUrl),
      personaName: String(rawProfile.personaName || 'Gamer'),
      avatarUrl: String(rawProfile.avatarUrl || ''),
      lastSyncedAt: new Date().toISOString(),
      totalHours: enrichment.totalHours,
      considerableGamesCount: enrichment.considerableGamesCount,
      ownedGames,
    };

    const igdbEnrichedCount = Number(data.igdbEnrichedCount || 0);
    const steamSpyEnrichedCount = Number(data.steamSpyEnrichedCount || 0);

    return {
      ok: true,
      igdbEnrichedCount,
      steamSpyEnrichedCount,
      message: `¡Biblioteca sincronizada! ${ownedGames.length} juegos (${enrichment.considerableGamesCount} con vicio relevante)${
        igdbEnrichedCount > 0 ? ` • ${igdbEnrichedCount} enriquecidos vía IGDB` : ''
      }.`,
      profile,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('Error fetching Steam profile:', error);
    return {
      ok: false,
      message: `No se pudo conectar con el servicio de importación: ${errorMsg}`,
    };
  }
}

/**
 * Searches any PC/Console game globally via IGDB API v4 (when configured)
 * or Steam Store + SteamSpy live fallback, enriched with 32D metadata inference.
 */
export async function searchSteamStoreGames(
  query: string,
  igdbConfig?: IgdbCredentialsConfig
): Promise<SearchedSteamGame[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const endpoint = `${supabaseUrl}/functions/v1/steam-import`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        action: 'search_store',
        query: trimmed,
        igdbClientId: igdbConfig?.igdbClientId?.trim() || undefined,
        igdbClientSecret: igdbConfig?.igdbClientSecret?.trim() || undefined,
      }),
    });

    if (!res.ok) {
      console.warn('searchSteamStoreGames non-OK response status:', res.status);
      return [];
    }

    const data = await res.json().catch(() => null);
    if (!data?.ok || !Array.isArray(data.items)) {
      return [];
    }

    return (data.items as EdgeGamePayload[])
      .map((item) => {
        const inferred = inferGameMetadataAndVector({
          name: item.name,
          steamAppId: item.appId,
          rawGenres: item.genres,
          rawTags: item.tags,
          minPlayers: item.minPlayers,
          maxPlayers: item.maxPlayers,
        });

        return {
          igdbId: item.igdbId,
          appId: item.appId,
          name: item.name,
          summary: item.summary,
          headerImageUrl: item.headerImageUrl,
          category: inferred.category || 'Otro',
          genres: item.genres && item.genres.length > 0 ? item.genres : inferred.genres,
          tags: item.tags && item.tags.length > 0 ? item.tags : inferred.tags,
          tagVotes: item.tagVotes,
          isMultiplayer: item.isMultiplayer ?? inferred.isMultiplayer,
          minPlayers: item.minPlayers ?? inferred.minPlayers,
          maxPlayers: item.maxPlayers ?? inferred.maxPlayers,
          rating: item.rating,
          source: item.source || (data.source === 'igdb' ? 'igdb' : 'steam'),
        };
      })
      .filter((item) => !isNonGameSteamApp(item));
  } catch (error) {
    console.warn('Error querying searchSteamStoreGames:', error);
    return [];
  }
}

/**
 * Fetches live multiplayer PC games (>= 3 players) from IGDB v4 (or SteamSpy fallback)
 * to feed the Group Recommendation Discovery pool beyond static seed catalogs.
 */
export async function fetchExternalDiscoveryGames(
  igdbConfig?: IgdbCredentialsConfig
): Promise<KnowledgeGameEntry[]> {
  const endpoint = `${supabaseUrl}/functions/v1/steam-import`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        action: 'discover_games',
        igdbClientId: igdbConfig?.igdbClientId?.trim() || undefined,
        igdbClientSecret: igdbConfig?.igdbClientSecret?.trim() || undefined,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    if (!data?.ok || !Array.isArray(data.items)) return [];

    return (data.items as EdgeGamePayload[])
      .map((item, idx): KnowledgeGameEntry => {
        const inferred = inferGameMetadataAndVector({
          name: item.name,
          steamAppId: item.appId,
          rawGenres: item.genres,
          rawTags: item.tags,
          minPlayers: item.minPlayers,
          maxPlayers: item.maxPlayers,
        });

        return {
          id: item.igdbId
            ? `igdb-${item.igdbId}`
            : item.appId
            ? `steam-${item.appId}`
            : `ext-disc-${idx}-${item.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          steamAppId: item.appId,
          igdbId: item.igdbId,
          releaseYear: item.releaseYear,
          isNewRelease: item.isNewRelease,
          name: item.name,
          description:
            item.summary ||
            inferred.description ||
            `Título multijugador extraído de ${item.source === 'igdb' ? 'IGDB' : 'SteamSpy'}.`,
          category: inferred.category,
          coverUrl: item.headerImageUrl || inferred.coverUrl || '',
          tags: item.tags && item.tags.length > 0 ? item.tags : inferred.tags,
          genres: item.genres && item.genres.length > 0 ? item.genres : inferred.genres,
          minPlayers: item.minPlayers ?? inferred.minPlayers,
          maxPlayers: item.maxPlayers ?? inferred.maxPlayers,
          isMultiplayer: item.isMultiplayer ?? inferred.isMultiplayer,
          weights: inferred.vector,
        };
      })
      .filter((entry) => !isNonGameSteamApp(entry));
  } catch {
    return [];
  }
}
