// ==============================================================================
// BOLUDOS GAMING — IGDB API v4 + STEAM WEB API + STEAMSPY EDGE FUNCTION
// ==============================================================================
// Proxies IGDB (Twitch OAuth2), Steam Web API, Steam Store & SteamSpy from
// browsers without CORS blocks or secret exposure.
// Supports:
// 1. action: 'import_profile' -> Resolves SteamID64/Vanity, fetches player summary,
//    owned games library + recent playtime, and enriches Top 25 / >=10h games
//    with IGDB + SteamSpy metadata (genres, tags, player limits).
// 2. action: 'search_store' | 'search_igdb' -> Universal game search using IGDB v4
//    (or Steam Store + SteamSpy fallback if IGDB keys are not configured).
// 3. action: 'discover_games' -> Fetches popular PC multiplayer games (>=3 players)
//    from IGDB v4 (or SteamSpy top multiplayer fallback) for session discovery.
// ==============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ImportProfilePayload {
  action?: 'import_profile';
  steamUrlOrId: string;
  steamApiKey?: string;
  igdbClientId?: string;
  igdbClientSecret?: string;
}

interface SearchStorePayload {
  action: 'search_store' | 'search_igdb';
  query: string;
  igdbClientId?: string;
  igdbClientSecret?: string;
}

interface DiscoverGamesPayload {
  action: 'discover_games';
  igdbClientId?: string;
  igdbClientSecret?: string;
}

type RequestPayload = ImportProfilePayload | SearchStorePayload | DiscoverGamesPayload;

interface IgdbNamedRef {
  id: number;
  name?: string;
}

interface IgdbCoverRef {
  id: number;
  image_id?: string;
}

interface IgdbExternalGameRef {
  id: number;
  category?: number;
  external_game_source?: number;
  uid?: string;
}

interface IgdbMultiplayerMode {
  id: number;
  onlinecoop?: boolean;
  offlinecoop?: boolean;
  lancoop?: boolean;
  campaigncoop?: boolean;
  splitscreen?: boolean;
  onlinecoopmax?: number;
  onlinemax?: number;
  offlinecoopmax?: number;
  offlinemax?: number;
}

interface IgdbGameRaw {
  id: number;
  name: string;
  summary?: string;
  first_release_date?: number;
  hypes?: number;
  total_rating?: number;
  total_rating_count?: number;
  cover?: IgdbCoverRef;
  genres?: IgdbNamedRef[];
  themes?: IgdbNamedRef[];
  game_modes?: IgdbNamedRef[];
  multiplayer_modes?: IgdbMultiplayerMode[];
  external_games?: IgdbExternalGameRef[];
  platforms?: IgdbNamedRef[];
}

interface NormalizedExternalGameItem {
  igdbId?: number;
  appId?: number;
  name: string;
  summary?: string;
  headerImageUrl: string;
  genres: string[];
  tags: string[];
  tagVotes?: Record<string, number>;
  isMultiplayer: boolean;
  minPlayers: number;
  maxPlayers: number;
  rating?: number;
  releaseYear?: number;
  isNewRelease?: boolean;
  source: 'igdb' | 'steam';
}

interface SteamSpyAppDetails {
  appid?: number;
  name?: string;
  genre?: string;
  tags?: Record<string, number>;
}

interface CachedToken {
  cacheKey: string;
  token: string;
  expiresAt: number;
}

let cachedIgdbToken: CachedToken | null = null;

const NON_GAME_STEAM_APP_IDS = new Set<number>([
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

const NON_GAME_SOFTWARE_NAMES = [
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

const STRUCTURAL_NON_GAME_SUBSTRINGS = [
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

const NON_GAME_SOFTWARE_LABELS = new Set<string>([
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

const CORE_GAMEPLAY_LABELS = new Set<string>([
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

function normSoftwareLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normSoftwareTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNonGameSteamApp(item: {
  appId?: number;
  name: string;
  genres?: string[];
  tags?: string[];
  tagVotes?: Record<string, number>;
}): boolean {
  if (item.appId !== undefined && NON_GAME_STEAM_APP_IDS.has(item.appId)) {
    return true;
  }

  const normTitle = normSoftwareTitle(item.name || '');
  if (normTitle) {
    for (const swName of NON_GAME_SOFTWARE_NAMES) {
      if (normTitle === swName || normTitle.startsWith(`${swName} `)) {
        return true;
      }
    }
  }

  const lowerRaw = (item.name || '').toLowerCase();
  if (lowerRaw) {
    if (STRUCTURAL_NON_GAME_SUBSTRINGS.some((sub) => lowerRaw.includes(sub))) {
      return true;
    }
    if (/\b(sdk|ost)\b/i.test(item.name) || /^proton\b/i.test(lowerRaw.trim())) {
      return true;
    }
  }

  const normalizedGenres = (item.genres || []).map(normSoftwareLabel).filter(Boolean);
  const normalizedTags = (item.tags || []).map(normSoftwareLabel).filter(Boolean);
  const allNormalizedLabels = [...normalizedGenres, ...normalizedTags];
  const hasCoreGameplay = allNormalizedLabels.some((l) => CORE_GAMEPLAY_LABELS.has(l));

  if (normalizedGenres.some((g) => NON_GAME_SOFTWARE_LABELS.has(g)) && !hasCoreGameplay) {
    return true;
  }

  if (item.tagVotes && Object.keys(item.tagVotes).length > 0) {
    const sortedVotes = Object.entries(item.tagVotes)
      .filter(([, votes]) => Number.isFinite(votes) && votes > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => normSoftwareLabel(tag));
    const top2 = sortedVotes.slice(0, 2);
    const top3 = sortedVotes.slice(0, 3);
    const top5 = sortedVotes.slice(0, 5);
    const hasSoftTop2 = top2.some((t) => NON_GAME_SOFTWARE_LABELS.has(t));
    const softCountTop5 = top5.filter((t) => NON_GAME_SOFTWARE_LABELS.has(t)).length;
    const hasCoreTop3 = top3.some((t) => CORE_GAMEPLAY_LABELS.has(t));
    if ((hasSoftTop2 || softCountTop5 >= 2) && !hasCoreTop3) {
      return true;
    }
  }

  const first2Tags = normalizedTags.slice(0, 2);
  if (first2Tags.some((t) => NON_GAME_SOFTWARE_LABELS.has(t)) && !hasCoreGameplay) {
    return true;
  }
  if (
    (normalizedTags.includes('utilities') ||
      normalizedTags.includes('utilidades') ||
      normalizedTags.includes('software')) &&
    !hasCoreGameplay
  ) {
    return true;
  }

  return false;
}

function resolveIgdbCredentials(payload: { igdbClientId?: string; igdbClientSecret?: string }) {
  const clientId = (
    payload.igdbClientId ||
    Deno.env.get('IGDB_CLIENT_ID') ||
    Deno.env.get('TWITCH_CLIENT_ID') ||
    ''
  ).trim();
  const clientSecret = (
    payload.igdbClientSecret ||
    Deno.env.get('IGDB_CLIENT_SECRET') ||
    Deno.env.get('TWITCH_CLIENT_SECRET') ||
    ''
  ).trim();
  return { clientId, clientSecret };
}

async function getIgdbAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (!clientId || !clientSecret) return null;
  const cacheKey = `${clientId}:${clientSecret.slice(0, 6)}`;
  const now = Date.now();
  if (cachedIgdbToken && cachedIgdbToken.cacheKey === cacheKey && cachedIgdbToken.expiresAt > now) {
    return cachedIgdbToken.token;
  }

  try {
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(4500) }
    );
    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    if (!tokenData?.access_token) return null;

    const expiresInSec = Number(tokenData.expires_in || 3600);
    cachedIgdbToken = {
      cacheKey,
      token: String(tokenData.access_token),
      expiresAt: now + Math.max(60, expiresInSec - 120) * 1000,
    };
    return cachedIgdbToken.token;
  } catch {
    return null;
  }
}

function parseIgdbGame(g: IgdbGameRaw): NormalizedExternalGameItem {
  const genres = Array.isArray(g.genres)
    ? g.genres.map((x) => x.name).filter((n): n is string => Boolean(n))
    : [];
  const themes = Array.isArray(g.themes)
    ? g.themes.map((x) => x.name).filter((n): n is string => Boolean(n))
    : [];
  const gameModes = Array.isArray(g.game_modes)
    ? g.game_modes.map((x) => x.name).filter((n): n is string => Boolean(n))
    : [];

  // Extract linked Steam App ID (IGDB external category/source 1 = Steam)
  let steamAppId: number | undefined;
  if (Array.isArray(g.external_games)) {
    const steamRef = g.external_games.find(
      (eg) => (eg.category === 1 || eg.external_game_source === 1) && eg.uid
    );
    if (steamRef?.uid) {
      const parsed = Number(steamRef.uid);
      if (Number.isFinite(parsed) && parsed > 0) {
        steamAppId = parsed;
      }
    }
  }

  // Extract release year from IGDB UNIX timestamp
  let releaseYear: number | undefined;
  if (typeof g.first_release_date === 'number' && Number.isFinite(g.first_release_date)) {
    const parsedYear = new Date(g.first_release_date * 1000).getUTCFullYear();
    if (Number.isFinite(parsedYear) && parsedYear > 1980) {
      releaseYear = parsedYear;
    }
  }
  const isNewRelease = releaseYear !== undefined && releaseYear >= 2022;

  // Player limits & multiplayer flags from game_modes & multiplayer_modes
  const modesLower = gameModes.map((m) => m.toLowerCase());
  const hasMultiplayerMode = modesLower.some(
    (m) =>
      m.includes('multiplayer') ||
      m.includes('co-operative') ||
      m.includes('battle royale') ||
      m.includes('mmo') ||
      m.includes('split screen')
  );

  let maxPlayers = 1;
  if (Array.isArray(g.multiplayer_modes) && g.multiplayer_modes.length > 0) {
    for (const mm of g.multiplayer_modes) {
      maxPlayers = Math.max(
        maxPlayers,
        mm.onlinemax || 0,
        mm.onlinecoopmax || 0,
        mm.offlinemax || 0,
        mm.offlinecoopmax || 0
      );
      if (maxPlayers <= 1 && (mm.onlinecoop || mm.offlinecoop || mm.lancoop || mm.campaigncoop)) {
        maxPlayers = 4;
      }
    }
  }

  const isMultiplayer = hasMultiplayerMode || maxPlayers >= 2;
  if (isMultiplayer && maxPlayers <= 1) {
    if (modesLower.some((m) => m.includes('battle royale') || m.includes('mmo'))) {
      maxPlayers = 64;
    } else if (modesLower.some((m) => m.includes('co-operative'))) {
      maxPlayers = 4;
    } else {
      maxPlayers = 8;
    }
  }

  const hasSinglePlayer = modesLower.some((m) => m.includes('single player'));
  const minPlayers = isMultiplayer && !hasSinglePlayer ? 2 : 1;

  const headerImageUrl = g.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
    : steamAppId
    ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/header.jpg`
    : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80';

  const combinedTags = Array.from(new Set([...themes, ...gameModes])).slice(0, 10);

  return {
    igdbId: g.id,
    appId: steamAppId,
    name: g.name,
    summary: g.summary,
    headerImageUrl,
    genres,
    tags: combinedTags,
    isMultiplayer,
    minPlayers,
    maxPlayers,
    rating: g.total_rating ? Math.round(g.total_rating) : undefined,
    releaseYear,
    isNewRelease,
    source: 'igdb',
  };
}

async function queryIgdbGames(
  clientId: string,
  accessToken: string,
  apicalypseBody: string
): Promise<IgdbGameRaw[]> {
  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'text/plain',
      },
      body: apicalypseBody,
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as IgdbGameRaw[]) : [];
  } catch {
    return [];
  }
}

async function fetchSteamSpyDetails(
  appId: number
): Promise<{ genres: string[]; tags: string[]; tagVotes: Record<string, number> } | null> {
  try {
    const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`, {
      signal: AbortSignal.timeout(2200),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SteamSpyAppDetails;
    if (!data || !data.name) return null;

    const genres = data.genre
      ? data.genre
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const tagEntries = data.tags && typeof data.tags === 'object' ? Object.entries(data.tags) : [];
    const topTagEntries = tagEntries
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 15);
    const tags = topTagEntries.map(([tagName]) => tagName);
    const tagVotes: Record<string, number> = {};
    for (const [tagName, voteCount] of topTagEntries) {
      const numericVote = Number(voteCount);
      if (Number.isFinite(numericVote) && numericVote > 0) {
        tagVotes[tagName] = numericVote;
      }
    }

    return { genres, tags, tagVotes };
  } catch {
    return null;
  }
}

async function fetchSteamStoreReleaseYear(appId: number): Promise<number | undefined> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=release_date`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as Record<
      string,
      { success?: boolean; data?: { release_date?: { coming_soon?: boolean; date?: string } } }
    >;
    const dateStr = data?.[String(appId)]?.data?.release_date?.date;
    if (!dateStr || typeof dateStr !== 'string') return undefined;
    const match = dateStr.match(/\b(19\d{2}|20\d{2})\b/);
    if (!match) return undefined;
    const year = Number(match[1]);
    return Number.isFinite(year) && year > 1980 ? year : undefined;
  } catch {
    return undefined;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Método no permitido. Use POST.' }),
      {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  let body: RequestPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: 'Cuerpo de solicitud JSON inválido.' }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  const action = body.action || 'import_profile';
  const { clientId: igdbClientId, clientSecret: igdbClientSecret } = resolveIgdbCredentials(body);

  // ----------------------------------------------------------------------------
  // ACTION: discover_games (Live IGDB v4 PC Multiplayer + SteamSpy supplement/fallback)
  // ----------------------------------------------------------------------------
  if (action === 'discover_games') {
    const token = await getIgdbAccessToken(igdbClientId, igdbClientSecret);
    const mergedItems: NormalizedExternalGameItem[] = [];
    const seenIgdbIds = new Set<number>();
    const seenAppIds = new Set<number>();
    const seenNames = new Set<string>();

    const addUniqueItem = (item: NormalizedExternalGameItem): boolean => {
      const lowerName = item.name.trim().toLowerCase();
      if (!lowerName) return false;
      if (item.igdbId !== undefined && seenIgdbIds.has(item.igdbId)) return false;
      if (item.appId !== undefined && seenAppIds.has(item.appId)) return false;
      if (seenNames.has(lowerName)) return false;

      if (item.igdbId !== undefined) seenIgdbIds.add(item.igdbId);
      if (item.appId !== undefined) seenAppIds.add(item.appId);
      seenNames.add(lowerName);
      mergedItems.push(item);
      return true;
    };

    const igdbFields =
      'fields id, name, summary, first_release_date, hypes, cover.image_id, genres.name, themes.name, game_modes.name, multiplayer_modes.*, external_games.category, external_games.external_game_source, external_games.uid, platforms.name, total_rating, total_rating_count;';

    const igdbPromise = token
      ? Promise.all([
          // a) Recent quality (2022-2026)
          queryIgdbGames(
            igdbClientId,
            token,
            `
              ${igdbFields}
              where first_release_date >= 1640995200 & game_modes = (2,3,5,6) & platforms = (6) & total_rating_count >= 4 & version_parent = null;
              sort total_rating_count desc;
              limit 50;
            `
          ),
          // b) Brand-new & hyped (2024-2026, even with 0 ratings)
          queryIgdbGames(
            igdbClientId,
            token,
            `
              ${igdbFields}
              where first_release_date >= 1704067200 & game_modes = (2,3,5,6) & platforms = (6) & version_parent = null;
              sort hypes desc;
              limit 50;
            `
          ),
          // c) Modern evergreen classics (2018+)
          queryIgdbGames(
            igdbClientId,
            token,
            `
              ${igdbFields}
              where first_release_date >= 1514764800 & game_modes = (2,3,5,6) & platforms = (6) & total_rating_count >= 35 & version_parent = null;
              sort total_rating desc;
              limit 35;
            `
          ),
        ])
      : Promise.resolve<[IgdbGameRaw[], IgdbGameRaw[], IgdbGameRaw[]]>([[], [], []]);

    const spyTopPromise = fetch('https://steamspy.com/api.php?request=top100in2weeks', {
      signal: AbortSignal.timeout(4000),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Record<string, { appid: number; name: string }>;
      })
      .catch(() => null);

    const [[recentQualityRaw, brandNewHypedRaw, evergreenClassicsRaw], spyMap] = await Promise.all([
      igdbPromise,
      spyTopPromise,
    ]);

    let igdbAddedCount = 0;
    for (const raw of [...recentQualityRaw, ...brandNewHypedRaw, ...evergreenClassicsRaw]) {
      const parsed = parseIgdbGame(raw);
      if (parsed.isMultiplayer && parsed.maxPlayers >= 3 && !isNonGameSteamApp(parsed)) {
        if (addUniqueItem(parsed)) {
          igdbAddedCount += 1;
        }
      }
    }

    // Supplement with SteamSpy top100in2weeks (viral Steam hits or fallback when IGDB is absent)
    let steamSpyAddedCount = 0;
    if (spyMap) {
      const topCandidates = Object.values(spyMap)
        .filter((item) => {
          if (!item?.appid || !item?.name) return false;
          if (NON_GAME_STEAM_APP_IDS.has(item.appid)) return false;
          if (seenAppIds.has(item.appid)) return false;
          if (seenNames.has(item.name.trim().toLowerCase())) return false;
          return true;
        })
        .slice(0, 40);

      const enriched = await Promise.all(
        topCandidates.map(async (item): Promise<NormalizedExternalGameItem> => {
          const [spyDetails, releaseYear] = await Promise.all([
            fetchSteamSpyDetails(item.appid),
            fetchSteamStoreReleaseYear(item.appid),
          ]);
          const tags = spyDetails?.tags || [];
          const genres = spyDetails?.genres || [];
          const tagVotes = spyDetails?.tagVotes;
          const allLower = [...tags, ...genres].map((x) => x.toLowerCase());
          const isMulti = allLower.some(
            (x) =>
              x.includes('multiplayer') ||
              x.includes('co-op') ||
              x.includes('coop') ||
              x.includes('pvp') ||
              /\bteam\b/.test(x) ||
              x.includes('survival') ||
              x.includes('mmo')
          );
          const isNewRelease = releaseYear !== undefined && releaseYear >= 2022;
          return {
            appId: item.appid,
            name: item.name,
            headerImageUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.appid}/header.jpg`,
            genres,
            tags,
            tagVotes,
            isMultiplayer: isMulti,
            minPlayers: 1,
            maxPlayers: isMulti ? 6 : 1,
            releaseYear,
            isNewRelease,
            source: 'steam',
          };
        })
      );

      for (const item of enriched) {
        if (item.isMultiplayer && !isNonGameSteamApp(item)) {
          if (addUniqueItem(item)) {
            steamSpyAddedCount += 1;
          }
        }
      }
    }

    if (mergedItems.length > 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          source: igdbAddedCount > 0 ? 'igdb' : 'steamspy',
          igdbConnected: Boolean(token && igdbAddedCount > 0),
          igdbCount: igdbAddedCount,
          steamSpyCount: steamSpyAddedCount,
          items: mergedItems,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, source: 'fallback', igdbConnected: false, items: [] }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  // ----------------------------------------------------------------------------
  // ACTION: search_store | search_igdb
  // ----------------------------------------------------------------------------
  if (action === 'search_store' || action === 'search_igdb') {
    const query = (body as SearchStorePayload).query?.trim() || '';
    if (!query) {
      return new Response(
        JSON.stringify({ ok: true, items: [], igdbConnected: Boolean(igdbClientId && igdbClientSecret) }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = await getIgdbAccessToken(igdbClientId, igdbClientSecret);
    if (token) {
      const escapedQuery = query.replace(/"/g, '\\"');
      const apicalypse = `
        search "${escapedQuery}";
        fields id, name, summary, first_release_date, cover.image_id, genres.name, themes.name, game_modes.name, multiplayer_modes.*, external_games.category, external_games.external_game_source, external_games.uid, platforms.name, total_rating;
        where version_parent = null;
        limit 18;
      `;
      const igdbGames = await queryIgdbGames(igdbClientId, token, apicalypse);
      if (igdbGames.length > 0) {
        const items = igdbGames.map(parseIgdbGame).filter((g) => !isNonGameSteamApp(g));
        return new Response(
          JSON.stringify({ ok: true, source: 'igdb', igdbConnected: true, items }),
          {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Fallback / default when IGDB keys not provided: Steam Store Search + SteamSpy live enrichment
    try {
      const storeRes = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=spanish&cc=AR`
      );

      if (!storeRes.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Steam Store API respondió con status ${storeRes.status}.`,
          }),
          {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      const storeData = await storeRes.json();
      const rawItems = Array.isArray(storeData?.items) ? storeData.items : [];
      const sliced = rawItems.slice(0, 10) as Array<{ id: number; name: string; tiny_image?: string }>;

      const items = await Promise.all(
        sliced.map(async (item, idx): Promise<NormalizedExternalGameItem> => {
          // Enrich top 6 search matches with live SteamSpy tags/genres
          const spy = idx < 6 ? await fetchSteamSpyDetails(item.id) : null;
          const tags = spy?.tags || [];
          const genres = spy?.genres || [];
          const tagVotes = spy?.tagVotes;
          const lower = [...tags, ...genres].map((x) => x.toLowerCase());
          const hasMultiTag = lower.some(
            (x) => x.includes('multiplayer') || x.includes('co-op') || x.includes('pvp') || x.includes('mmo')
          );

          return {
            appId: item.id,
            name: item.name,
            headerImageUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
            genres,
            tags,
            tagVotes,
            isMultiplayer: spy ? hasMultiTag || !lower.every((x) => x === 'singleplayer') : true,
            minPlayers: 1,
            maxPlayers: hasMultiTag ? 4 : 1,
            source: 'steam',
          };
        })
      );

      const filteredItems = items.filter((item) => !isNonGameSteamApp(item));

      return new Response(
        JSON.stringify({ ok: true, source: 'steam', igdbConnected: Boolean(token), items: filteredItems }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ ok: false, error: `Error de red consultando Steam Store: ${message}` }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // ----------------------------------------------------------------------------
  // ACTION: import_profile (default)
  // ----------------------------------------------------------------------------
  const importBody = body as ImportProfilePayload;
  const apiKey = (
    importBody.steamApiKey ||
    Deno.env.get('STEAM_WEB_API_KEY') ||
    ''
  ).trim();

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: 'MISSING_API_KEY',
        error: 'Falta configurar STEAM_WEB_API_KEY en los secretos de Supabase o en la app.',
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  const rawInput = (importBody.steamUrlOrId || '').trim().replace(/\/+$/, '');
  if (!rawInput) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Debes ingresar un Steam ID, Vanity URL o enlace de perfil de Steam.',
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  let steamId64 = '';

  const profileMatch = rawInput.match(/\/profiles\/(7656\d{13})/i);
  const directMatch = rawInput.match(/\b(7656\d{13})\b/);

  if (profileMatch) {
    steamId64 = profileMatch[1];
  } else if (directMatch) {
    steamId64 = directMatch[1];
  } else {
    let vanity = rawInput;
    const vanityMatch = rawInput.match(/\/id\/([^/?#]+)/i);
    if (vanityMatch) {
      vanity = vanityMatch[1];
    } else if (rawInput.includes('/')) {
      const segments = rawInput.split('/').filter(Boolean);
      vanity = segments[segments.length - 1] || rawInput;
    }

    try {
      const vanityRes = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${apiKey}&vanityurl=${encodeURIComponent(vanity)}`
      );

      if (!vanityRes.ok) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Error al resolver Vanity URL en Steam API (${vanityRes.status}).`,
          }),
          {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      const vanityData = await vanityRes.json();
      if (vanityData?.response?.success !== 1 || !vanityData?.response?.steamid) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `No se encontró ningún perfil de Steam con "${vanity}". Verificá la URL o Steam ID ingresado.`,
          }),
          {
            status: 404,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }

      steamId64 = vanityData.response.steamid;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Error resolviendo URL personalizada de Steam: ${message}`,
        }),
        {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // Fetch Player Summaries, Owned Games and Recently Played Games in parallel
  try {
    const [summariesRes, ownedGamesRes, recentGamesRes] = await Promise.all([
      fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId64}`
      ),
      fetch(
        `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId64}&include_appinfo=1&include_played_free_games=1`
      ),
      fetch(
        `https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${apiKey}&steamid=${steamId64}&count=20`
      ),
    ]);

    if (!summariesRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Error al obtener datos de perfil de Steam (Status ${summariesRes.status}).`,
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!ownedGamesRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Error al obtener biblioteca de Steam (Status ${ownedGamesRes.status}).`,
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    const summariesData = await summariesRes.json();
    const ownedGamesData = await ownedGamesRes.json();
    const recentGamesData = recentGamesRes.ok ? await recentGamesRes.json() : null;

    const playerSummary = summariesData?.response?.players?.[0];
    if (!playerSummary) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No se encontró la información del jugador para el Steam ID ${steamId64}.`,
        }),
        {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    const rawOwnedGames: Array<{
      appid: number;
      name: string;
      playtime_forever: number;
      playtime_2weeks?: number;
      img_icon_url?: string;
      rtime_last_played?: number;
    }> = ownedGamesData?.response?.games || [];

    if (playerSummary.communityvisibilitystate !== 3 || rawOwnedGames.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'PRIVATE_PROFILE',
          error:
            'Tu perfil o lista de juegos de Steam está en Privado. En Steam > Editar Perfil > Privacidad, cambiá "Detalles de los juegos" a Público e intentá de nuevo.',
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    const ownedGames = rawOwnedGames.filter(
      (g) => !isNonGameSteamApp({ appId: g.appid, name: g.name })
    );

    const recentMap: Record<number, number> = {};
    if (recentGamesData?.response?.games && Array.isArray(recentGamesData.response.games)) {
      for (const rg of recentGamesData.response.games) {
        if (rg.appid && rg.playtime_2weeks != null) {
          recentMap[rg.appid] = rg.playtime_2weeks;
        }
      }
    }

    // Identify Top 25 considerable games (>= 10h or top 25 / recent) to enrich live with IGDB + SteamSpy
    const sortedByPlaytime = [...ownedGames].sort(
      (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0)
    );
    const considerableTargets = sortedByPlaytime
      .filter((g, idx) => idx < 25 || (g.playtime_forever || 0) >= 600 || (recentMap[g.appid] ?? 0) > 0)
      .slice(0, 30);

    const igdbBySteamAppId = new Map<number, NormalizedExternalGameItem>();
    const steamSpyByAppId = new Map<number, { genres: string[]; tags: string[]; tagVotes: Record<string, number> }>();

    const token = await getIgdbAccessToken(igdbClientId, igdbClientSecret);
    if (token && considerableTargets.length > 0) {
      const uidList = considerableTargets.map((g) => `"${g.appid}"`).join(',');
      const igdbApicalypse = `
        fields id, name, summary, first_release_date, cover.image_id, genres.name, themes.name, game_modes.name, multiplayer_modes.*, external_games.category, external_games.external_game_source, external_games.uid;
        where external_games.category = 1 & external_games.uid = (${uidList});
        limit 50;
      `;
      const igdbMatches = await queryIgdbGames(igdbClientId, token, igdbApicalypse);
      for (const raw of igdbMatches) {
        const parsed = parseIgdbGame(raw);
        if (parsed.appId) {
          igdbBySteamAppId.set(parsed.appId, parsed);
        }
      }
    }

    // Always enrich top 15 considerable games via SteamSpy (gives community tags for ANY Steam game)
    const spyTargets = considerableTargets.slice(0, 15);
    await Promise.all(
      spyTargets.map(async (g) => {
        const details = await fetchSteamSpyDetails(g.appid);
        if (details) {
          steamSpyByAppId.set(g.appid, details);
        }
      })
    );

    const personaName: string = playerSummary.personaname || 'Gamer';
    const avatarUrl: string =
      playerSummary.avatarfull ||
      playerSummary.avatarmedium ||
      playerSummary.avatar ||
      '';
    const profileUrl: string =
      playerSummary.profileurl || `https://steamcommunity.com/profiles/${steamId64}/`;

    const mappedGames = ownedGames
      .map((g) => {
        const recentMinutes = recentMap[g.appid] ?? g.playtime_2weeks ?? 0;
        const igdbInfo = igdbBySteamAppId.get(g.appid);
        const spyInfo = steamSpyByAppId.get(g.appid);

        const mergedGenres = Array.from(
          new Set([...(igdbInfo?.genres || []), ...(spyInfo?.genres || [])])
        );
        const mergedTags = Array.from(
          new Set([...(igdbInfo?.tags || []), ...(spyInfo?.tags || [])])
        );

        return {
          appId: g.appid,
          igdbId: igdbInfo?.igdbId,
          name: g.name,
          playtimeHours: Math.round(((g.playtime_forever || 0) / 60) * 10) / 10,
          playtimeRecentHours: Math.round((recentMinutes / 60) * 10) / 10,
          headerImageUrl: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
          iconUrl: g.img_icon_url
            ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
            : undefined,
          lastPlayedAt: g.rtime_last_played
            ? new Date(g.rtime_last_played * 1000).toISOString()
            : undefined,
          genres: mergedGenres.length > 0 ? mergedGenres : undefined,
          tags: mergedTags.length > 0 ? mergedTags : undefined,
          tagVotes: spyInfo?.tagVotes && Object.keys(spyInfo.tagVotes).length > 0 ? spyInfo.tagVotes : undefined,
          isMultiplayer: igdbInfo ? igdbInfo.isMultiplayer : undefined,
          minPlayers: igdbInfo ? igdbInfo.minPlayers : undefined,
          maxPlayers: igdbInfo ? igdbInfo.maxPlayers : undefined,
          source: igdbInfo ? 'igdb' : 'steam',
        };
      })
      .filter((item) => !isNonGameSteamApp(item));

    return new Response(
      JSON.stringify({
        ok: true,
        igdbEnrichedCount: igdbBySteamAppId.size,
        steamSpyEnrichedCount: steamSpyByAppId.size,
        profile: {
          steamId64,
          profileUrl,
          personaName,
          avatarUrl,
          games: mappedGames,
        },
      }),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Error al consultar la API de Steam: ${message}`,
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
});
