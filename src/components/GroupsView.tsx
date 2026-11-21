import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useApp } from '@/context/AppContext';
import { InstantSessionModal } from '@/components/sessions/InstantSessionModal';
import {
  DiscordNotificationLog,
  GAME_CATEGORIES,
  Game,
  GameRating,
  GamingGroup,
  GamingSession,
  GroupDiscordConfig,
  PlayerProfile,
} from '@/types/domain';
import {
  GLOBAL_GAMES_KNOWLEDGE_BASE,
  KnowledgeGameEntry,
  normalizeGameName,
  resolveGameOfficialUrl,
} from '@/lib/tasteProfileEngine';
import {
  SearchedSteamGame,
  fetchExternalDiscoveryGames,
  searchSteamStoreGames,
} from '@/lib/steamService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowRight,
  BookPlus,
  Calendar,
  Check,
  Clock,
  Copy,
  Crown,
  ExternalLink,
  FolderKanban,
  Gamepad2,
  Hash,
  Link as LinkIcon,
  LogOut,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldOff,
  Star,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Webhook,
  Zap,
} from 'lucide-react';

export interface GroupsViewProps {
  onNavigateToSessions?: () => void;
}

type DetailSubTab = 'members' | 'games' | 'discord' | 'sessions' | 'settings';

interface ColorPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  tailwindBg: string;
}

const GROUP_COLOR_PRESETS: ColorPreset[] = [
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

function getGroupInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 'BG';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function getDeterministicGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return GROUP_COLOR_PRESETS[hash % GROUP_COLOR_PRESETS.length].tailwindBg;
}

function buildInitialsSvgDataUrl(name: string, preset: ColorPreset): string {
  const initials = getGroupInitials(name || 'Nuevo Grupo');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${preset.from}"/><stop offset="100%" stop-color="${preset.to}"/></linearGradient></defs><rect width="120" height="120" rx="24" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="46">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
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

const GroupAvatarBadge: React.FC<{
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  seed?: string;
}> = ({ name, avatarUrl, size = 'md', seed }) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  const sizeClass =
    size === 'sm'
      ? 'w-9 h-9 text-xs rounded-md'
      : size === 'lg'
        ? 'w-12 h-12 text-base rounded-md'
        : 'w-10 h-10 text-sm rounded-md';

  if (avatarUrl && avatarUrl.trim() && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        className={cn(
          sizeClass,
          'object-cover border border-border shrink-0 bg-background'
        )}
      />
    );
  }

  const gradient = getDeterministicGradient(seed || name);
  return (
    <div
      className={cn(
        sizeClass,
        'bg-gradient-to-br flex items-center justify-center font-bold text-white border border-white/10 shrink-0 select-none',
        gradient
      )}
    >
      {getGroupInitials(name)}
    </div>
  );
};

const createGroupSchema = z.object({
  name: z.string().trim().min(2, 'El nombre del grupo debe tener al menos 2 caracteres.'),
  description: z.string().trim().max(280),
  avatarUrl: z.string().trim().optional(),
});

type CreateGroupValues = z.infer<typeof createGroupSchema>;

const identitySchema = z.object({
  name: z.string().trim().min(2, 'Ingresá al menos 2 caracteres.'),
  description: z.string().trim().max(280),
  avatarUrl: z.string().trim().optional(),
});

type IdentityValues = z.infer<typeof identitySchema>;

export const GroupsView: React.FC<GroupsViewProps> = ({
  onNavigateToSessions,
}) => {
  const {
    currentUser,
    players,
    sessions,
    games,
    preferences,
    updateGamePreference,
    updateSteamGameFeedback,
    userGroups,
    activeGroup,
    setActiveGroupId,
    createGroup,
    updateGroup,
    deleteGroup,
    joinGroupByInviteCode,
    addMemberToGroup,
    removeMemberFromGroup,
    addGameToGroup,
    removeGameFromGroup,
    addAndLinkGameToGroup,
    createInstantSession,
    deleteSession,
    testGroupDiscordWebhook,
    getGroupInviteLink,
    discordConfig,
    discordLogs,
    setActiveSessionId,
  } = useApp();

  // Join by code state
  const [joinInput, setJoinInput] = useState('');
  const [joinBanner, setJoinBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Create group dialog state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createAvatarMode, setCreateAvatarMode] = useState<'initials' | 'url'>(
    'initials'
  );
  const [createColorId, setCreateColorId] = useState<string>(
    GROUP_COLOR_PRESETS[0].id
  );
  const [createMemberIds, setCreateMemberIds] = useState<string[]>(() => [
    currentUser.id,
  ]);
  const [showCreateDiscord, setShowCreateDiscord] = useState(false);
  const [createDiscordConfig, setCreateDiscordConfig] =
    useState<GroupDiscordConfig>({
      enabled: true,
      webhookUrl: '',
      channelName: 'squad-gaming',
      guildName: '',
      mentionRoleId: '',
      useEveryoneMention: false,
    });

  // Detail subtab & actions
  const [detailTab, setDetailTab] = useState<DetailSubTab>('members');
  const [copiedState, setCopiedState] = useState<'code' | 'link' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteGroupSessionId, setConfirmDeleteGroupSessionId] = useState<string | null>(null);
  const [identitySaved, setIdentitySaved] = useState(false);

  // Member management
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFeedback, setMemberFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Group games & Add-to-library modal state
  const [groupGameSearch, setGroupGameSearch] = useState('');
  const [groupDiscoveryGames, setGroupDiscoveryGames] = useState<KnowledgeGameEntry[]>([]);
  const [groupLiveSearchResults, setGroupLiveSearchResults] = useState<SearchedSteamGame[]>([]);
  const [isSearchingGroupGames, setIsSearchingGroupGames] = useState(false);
  const [groupGamePickerLimit, setGroupGamePickerLimit] = useState(30);
  const [showCustomGameForm, setShowCustomGameForm] = useState(false);
  const [showInstantModal, setShowInstantModal] = useState(false);
  const [customGameName, setCustomGameName] = useState('');
  const [customGameCategory, setCustomGameCategory] = useState<string>(
    GAME_CATEGORIES[0].id
  );
  const [customGameMinPlayers, setCustomGameMinPlayers] = useState(1);
  const [customGameMaxPlayers, setCustomGameMaxPlayers] = useState(5);

  const [libraryModalGame, setLibraryModalGame] = useState<Game | null>(null);
  const [libraryRating, setLibraryRating] = useState<GameRating>(4);
  const [libraryHours, setLibraryHours] = useState<string>('0');
  const [libraryRecentHours, setLibraryRecentHours] = useState<string>('0');
  const [librarySteamAppId, setLibrarySteamAppId] = useState<number | null>(
    null
  );
  const [librarySteamDetectedHours, setLibrarySteamDetectedHours] = useState<
    number | null
  >(null);

  // Discord Webhook form
  const [discordForm, setDiscordForm] = useState<GroupDiscordConfig>({
    enabled: true,
    webhookUrl: '',
    channelName: '',
    guildName: '',
    mentionRoleId: '',
    useEveryoneMention: false,
  });
  const [discordSaveFeedback, setDiscordSaveFeedback] = useState<string | null>(
    null
  );
  const [discordTestState, setDiscordTestState] = useState<{
    loading: boolean;
    ok?: boolean;
    message?: string;
  }>({ loading: false });

  const createForm = useForm<CreateGroupValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: '',
      description: '',
      avatarUrl: '',
    },
  });

  const identityForm = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      name: activeGroup?.name ?? '',
      description: activeGroup?.description ?? '',
      avatarUrl: activeGroup?.avatarUrl ?? '',
    },
  });

  useEffect(() => {
    if (isCreateModalOpen) {
      createForm.reset({ name: '', description: '', avatarUrl: '' });
      setCreateAvatarMode('initials');
      setCreateColorId(GROUP_COLOR_PRESETS[0].id);
      setCreateMemberIds([currentUser.id]);
      setShowCreateDiscord(false);
    }
  }, [isCreateModalOpen, currentUser.id, createForm]);

  useEffect(() => {
    if (!activeGroup) {
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    setMemberFeedback(null);
    setIdentitySaved(false);
    identityForm.reset({
      name: activeGroup.name,
      description: activeGroup.description || '',
      avatarUrl: activeGroup.avatarUrl || '',
    });
    setDiscordForm({
      enabled: activeGroup.discordConfig?.enabled ?? true,
      webhookUrl: activeGroup.discordConfig?.webhookUrl ?? '',
      channelName: activeGroup.discordConfig?.channelName ?? '',
      guildName: activeGroup.discordConfig?.guildName ?? '',
      mentionRoleId: activeGroup.discordConfig?.mentionRoleId ?? '',
      useEveryoneMention:
        activeGroup.discordConfig?.useEveryoneMention ?? false,
    });
    setDiscordSaveFeedback(null);
    setDiscordTestState({ loading: false });
  }, [activeGroup, identityForm]);

  const isCreatorOrAdmin = useMemo(() => {
    if (!activeGroup) return false;
    return (
      activeGroup.createdBy === currentUser.id ||
      activeGroup.adminIds.includes(currentUser.id)
    );
  }, [activeGroup, currentUser.id]);

  const currentMembers = useMemo<PlayerProfile[]>(() => {
    if (!activeGroup) return [];
    return players.filter((p) => activeGroup.memberIds.includes(p.id));
  }, [activeGroup, players]);

  const availablePlatformPlayers = useMemo<PlayerProfile[]>(() => {
    if (!activeGroup) return [];
    const query = memberSearch.trim().toLowerCase();
    return players
      .filter((p) => !activeGroup.memberIds.includes(p.id))
      .filter((p) => {
        if (!query) return true;
        return (
          p.displayName.toLowerCase().includes(query) ||
          p.discordUsername.toLowerCase().includes(query)
        );
      });
  }, [activeGroup, players, memberSearch]);

  const groupSessions = useMemo<GamingSession[]>(() => {
    if (!activeGroup) return [];
    return sessions
      .filter((s) => s.groupId === activeGroup.id)
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [activeGroup, sessions]);

  const groupGames = useMemo<Game[]>(() => {
    if (!activeGroup) return [];
    const allowed = new Set(activeGroup.gameIds);
    return games.filter((g) => allowed.has(g.id));
  }, [activeGroup, games]);

  // Fetch discovery games when on Games subtab
  useEffect(() => {
    if (detailTab !== 'games') return;
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
  }, [detailTab, discordConfig.igdbClientId, discordConfig.igdbClientSecret]);

  // Live IGDB / Steam Store search when typing >= 2 chars
  useEffect(() => {
    const q = groupGameSearch.trim();
    setGroupGamePickerLimit(30);
    if (detailTab !== 'games' || q.length < 2) {
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
  }, [detailTab, groupGameSearch, discordConfig.igdbClientId, discordConfig.igdbClientSecret]);

  interface GroupGameMemberAffinity {
    player: PlayerProfile;
    rating?: GameRating;
    hoursPlayed?: number;
    recentHoursPlayed?: number;
    burnedOut?: boolean;
    sourceLabel: string;
  }

  interface GroupGameCandidate {
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

  const groupGameCandidates = useMemo<GroupGameCandidate[]>(() => {
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
      patch: Partial<Omit<GroupGameCandidate, 'key' | 'name' | 'memberAffinities' | 'avgRating' | 'totalHours'>>
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
  }, [
    activeGroup,
    groupGames,
    currentMembers,
    games,
    preferences,
    groupDiscoveryGames,
    groupLiveSearchResults,
    groupGameSearch,
  ]);

  const myPreferenceByGameId = useMemo(() => {
    const map = new Map<string, (typeof preferences)[number]>();
    for (const p of preferences) {
      if (p.userId === currentUser.id) {
        map.set(p.gameId, p);
      }
    }
    return map;
  }, [preferences, currentUser.id]);

  const openAddToLibraryModal = (game: Game) => {
    const existingPref = myPreferenceByGameId.get(game.id);
    const normalizedTarget = normalizeGameName(game.name);
    const steamMatch = currentUser.steamProfile?.ownedGames.find(
      (sg) => normalizeGameName(sg.name) === normalizedTarget
    );

    const steamTotalHours = steamMatch
      ? Math.round((steamMatch.manualHoursOverride ?? steamMatch.playtimeHours) * 10) / 10
      : null;
    const steamRecent = steamMatch
      ? Math.round(
          (steamMatch.manualRecentHoursOverride ?? steamMatch.playtimeRecentHours) * 10
        ) / 10
      : null;

    setLibraryModalGame(game);
    setLibraryRating(existingPref?.rating ?? steamMatch?.userRating ?? 4);
    const initialHours =
      existingPref?.hoursPlayed !== undefined && existingPref.hoursPlayed > 0
        ? existingPref.hoursPlayed
        : steamTotalHours ?? 0;
    const initialRecent =
      existingPref?.recentHoursPlayed !== undefined &&
      existingPref.recentHoursPlayed > 0
        ? existingPref.recentHoursPlayed
        : steamRecent ?? 0;

    setLibraryHours(String(initialHours));
    setLibraryRecentHours(String(initialRecent));
    setLibrarySteamAppId(steamMatch?.appId ?? null);
    setLibrarySteamDetectedHours(steamTotalHours);
  };

  const handleSaveLibraryModal = () => {
    if (!libraryModalGame) return;
    const parsedHours = Math.max(0, Number(libraryHours) || 0);
    const parsedRecent = Math.max(0, Number(libraryRecentHours) || 0);

    updateGamePreference(
      libraryModalGame.id,
      true,
      libraryRating,
      parsedHours,
      parsedRecent
    );

    if (librarySteamAppId !== null) {
      updateSteamGameFeedback(librarySteamAppId, {
        userRating: libraryRating,
        selectedForCatalog: true,
        manualHoursOverride: parsedHours,
        manualRecentHoursOverride: parsedRecent,
      });
    }

    setLibraryModalGame(null);
  };

  const handleAddCustomGameToGroup = () => {
    if (!activeGroup) return;
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

  const activeGroupSessions = useMemo(
    () => groupSessions.filter((s) => s.status !== 'finished'),
    [groupSessions]
  );

  const finishedGroupSessions = useMemo(
    () => groupSessions.filter((s) => s.status === 'finished'),
    [groupSessions]
  );

  const groupDiscordLogs = useMemo<DiscordNotificationLog[]>(() => {
    if (!activeGroup) return [];
    return discordLogs.filter((log) => log.groupId === activeGroup.id);
  }, [activeGroup, discordLogs]);

  const isDiscordFormDirty = useMemo(() => {
    if (!activeGroup) return false;
    const current = activeGroup.discordConfig;
    return (
      discordForm.enabled !== current.enabled ||
      discordForm.webhookUrl.trim() !== (current.webhookUrl || '').trim() ||
      discordForm.channelName.trim() !== (current.channelName || '').trim() ||
      discordForm.guildName.trim() !== (current.guildName || '').trim() ||
      discordForm.mentionRoleId.trim() !== (current.mentionRoleId || '').trim() ||
      discordForm.useEveryoneMention !== current.useEveryoneMention
    );
  }, [activeGroup, discordForm]);

  const gamesById = useMemo(() => {
    const map = new Map<string, Game>();
    games.forEach((g) => map.set(g.id, g));
    return map;
  }, [games]);

  // Handlers
  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinBanner(null);
    const res = joinGroupByInviteCode(joinInput);
    if (!res.ok) {
      setJoinBanner({
        type: 'error',
        text: res.error || 'No se pudo unir al grupo con ese código.',
      });
      return;
    }
    setJoinInput('');
    setJoinBanner({
      type: 'success',
      text: `Te uniste a "${res.group?.name}"!`,
    });
    window.setTimeout(() => setJoinBanner(null), 4500);
  };

  const handleCreateSubmit = createForm.handleSubmit((values) => {
    const preset =
      GROUP_COLOR_PRESETS.find((p) => p.id === createColorId) ||
      GROUP_COLOR_PRESETS[0];
    const resolvedAvatar =
      createAvatarMode === 'url' && values.avatarUrl
        ? values.avatarUrl
        : buildInitialsSvgDataUrl(values.name, preset);

    const created = createGroup({
      name: values.name,
      description: values.description || undefined,
      avatarUrl: resolvedAvatar,
      memberIds: Array.from(new Set([currentUser.id, ...createMemberIds])),
      discordConfig: showCreateDiscord ? createDiscordConfig : undefined,
    });
    setActiveGroupId(created.id);
    setDetailTab('members');
    setIsCreateModalOpen(false);
  });

  const handleSaveIdentity = identityForm.handleSubmit((values) => {
    if (!activeGroup) return;
    updateGroup(activeGroup.id, {
      name: values.name,
      description: values.description,
      avatarUrl: values.avatarUrl || undefined,
    });
    setIdentitySaved(true);
    window.setTimeout(() => setIdentitySaved(false), 3000);
  });

  const handleCopyInvite = async (
    mode: 'code' | 'link',
    group: GamingGroup
  ) => {
    const payload =
      mode === 'code'
        ? group.inviteCode
        : getGroupInviteLink(group.inviteCode);
    const ok = await copyTextToClipboard(payload);
    if (ok) {
      setCopiedState(mode);
      window.setTimeout(() => setCopiedState(null), 2200);
    }
  };

  const handleRemoveOrLeaveMember = (member: PlayerProfile) => {
    if (!activeGroup) return;
    if (
      activeGroup.createdBy === member.id &&
      activeGroup.memberIds.length > 1
    ) {
      setMemberFeedback({
        type: 'error',
        text: 'El creador no puede abandonar el grupo mientras queden otros miembros. Eliminá el grupo en Configuración si querés cerrarlo.',
      });
      return;
    }
    removeMemberFromGroup(activeGroup.id, member.id);
    setMemberFeedback({
      type: 'success',
      text:
        member.id === currentUser.id
          ? `Saliste de "${activeGroup.name}".`
          : `Se removió a ${member.displayName} del grupo.`,
    });
  };

  const handleToggleAdmin = (member: PlayerProfile) => {
    if (!activeGroup || !isCreatorOrAdmin) return;
    if (member.id === activeGroup.createdBy) return;
    const isAdmin = activeGroup.adminIds.includes(member.id);
    const nextAdmins = isAdmin
      ? activeGroup.adminIds.filter((id) => id !== member.id)
      : Array.from(new Set([...activeGroup.adminIds, member.id]));
    updateGroup(activeGroup.id, { adminIds: nextAdmins });
    setMemberFeedback({
      type: 'success',
      text: isAdmin
        ? `${member.displayName} pasó a ser Miembro.`
        : `${member.displayName} promovido a Admin.`,
    });
  };

  const handleSaveDiscordConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup) return;
    updateGroup(activeGroup.id, {
      discordConfig: {
        enabled: discordForm.enabled,
        webhookUrl: discordForm.webhookUrl.trim(),
        channelName: discordForm.channelName.trim() || 'squad-gaming',
        guildName: discordForm.guildName.trim(),
        mentionRoleId: discordForm.mentionRoleId.trim(),
        useEveryoneMention: discordForm.useEveryoneMention,
      },
    });
    setDiscordSaveFeedback('Configuración Discord guardada.');
    window.setTimeout(() => setDiscordSaveFeedback(null), 3500);
  };

  const handleTestDiscordWebhook = async () => {
    if (!activeGroup) return;
    setDiscordTestState({ loading: true });
    if (isDiscordFormDirty) {
      updateGroup(activeGroup.id, { discordConfig: discordForm });
    }
    const res = await testGroupDiscordWebhook(activeGroup.id);
    setDiscordTestState({
      loading: false,
      ok: res.ok,
      message: res.ok
        ? 'Embed de prueba enviado correctamente a Discord!'
        : res.error || 'No se pudo enviar al webhook.',
    });
  };

  const settingsTabs: Array<{
    key: DetailSubTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }> = [
    {
      key: 'members',
      label: 'Miembros',
      icon: <Users className="w-4 h-4" strokeWidth={1.75} />,
      badge: activeGroup ? String(activeGroup.memberIds.length) : undefined,
    },
    {
      key: 'games',
      label: 'Juegos',
      icon: <Gamepad2 className="w-4 h-4" strokeWidth={1.75} />,
      badge: activeGroup ? String(activeGroup.gameIds.length) : undefined,
    },
    {
      key: 'discord',
      label: 'Discord',
      icon: <Webhook className="w-4 h-4" strokeWidth={1.75} />,
    },
    {
      key: 'sessions',
      label: 'Sesiones',
      icon: <Calendar className="w-4 h-4" strokeWidth={1.75} />,
      badge: activeGroup ? String(groupSessions.length) : undefined,
    },
    {
      key: 'settings',
      label: 'Ajustes',
      icon: <Settings className="w-4 h-4" strokeWidth={1.75} />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Quick Join + New Group */}
      <div className="p-3.5 rounded-md bg-card/50 border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <form
          onSubmit={handleJoinSubmit}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl"
        >
          <div className="relative flex-1">
            <Hash
              className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2"
              strokeWidth={1.75}
            />
            <Input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Código o link de invitación..."
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary" className="shrink-0">
            Unirme
          </Button>
        </form>

        <Button onClick={() => setIsCreateModalOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          <span>Nuevo Grupo</span>
        </Button>
      </div>

      {joinBanner && (
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-md border text-xs font-medium',
            joinBanner.type === 'success'
              ? 'bg-success/10 border-success/40 text-success'
              : 'bg-destructive/10 border-destructive/40 text-destructive'
          )}
        >
          {joinBanner.text}
        </div>
      )}

      {/* Main Split Workspace: Left Group List + Right Active Group Repo Settings */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Group Selector List */}
        <aside className="w-full lg:w-72 shrink-0 space-y-2">
          <div className="px-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tus Grupos ({userGroups.length})
            </span>
          </div>

          {userGroups.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-center space-y-2">
                <FolderKanban
                  className="w-6 h-6 text-muted-foreground mx-auto"
                  strokeWidth={1.75}
                />
                <p className="text-xs text-muted-foreground">
                  Sin grupos todavía.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {userGroups.map((group) => {
                const isSelected = activeGroup?.id === group.id;
                const isCreator = group.createdBy === currentUser.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroupId(group.id)}
                    className={cn(
                      'w-full p-2.5 rounded-md border text-left flex items-center gap-2.5 transition-colors cursor-pointer relative',
                      isSelected
                        ? 'bg-secondary/55 border-primary text-foreground'
                        : 'bg-card/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                    )}
                  >
                    <GroupAvatarBadge
                      name={group.name}
                      avatarUrl={group.avatarUrl}
                      size="sm"
                      seed={group.id}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {group.name}
                        </span>
                        {isCreator && (
                          <Crown
                            className="w-3 h-3 text-warning shrink-0"
                            strokeWidth={1.75}
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{group.memberIds.length} miemb.</span>
                        <span>·</span>
                        <span className="font-mono">{group.inviteCode}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Active Group Detail Panel (GitHub Repo Settings Pattern) */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          {!activeGroup ? (
            <Card>
              <CardContent className="p-10 text-center space-y-3">
                <Users
                  className="w-8 h-8 text-primary mx-auto"
                  strokeWidth={1.75}
                />
                <h3 className="text-base font-bold text-foreground">
                  Seleccioná o creá un grupo
                </h3>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4" strokeWidth={1.75} />
                  <span>Nuevo Grupo</span>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Active Group Header Card */}
              <Card>
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <GroupAvatarBadge
                      name={activeGroup.name}
                      avatarUrl={activeGroup.avatarUrl}
                      size="lg"
                      seed={activeGroup.id}
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-foreground truncate">
                          {activeGroup.name}
                        </h2>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {activeGroup.inviteCode}
                        </Badge>
                        {activeGroup.discordConfig?.enabled &&
                          activeGroup.discordConfig?.webhookUrl && (
                            <Badge variant="success" className="text-[10px]">
                              Webhook Activo
                            </Badge>
                          )}
                      </div>
                      {activeGroup.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {activeGroup.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <Button
                      size="xs"
                      variant="outline"
                      className="w-7 px-0"
                      onClick={() => handleCopyInvite('code', activeGroup)}
                      title={copiedState === 'code' ? 'Código copiado' : 'Copiar código'}
                      aria-label={copiedState === 'code' ? 'Código copiado' : 'Copiar código'}
                    >
                      {copiedState === 'code' ? (
                        <Check className="w-3.5 h-3.5 text-success" strokeWidth={2} />
                      ) : (
                        <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
                      )}
                    </Button>

                    <Button
                      size="xs"
                      variant="secondary"
                      className="w-7 px-0"
                      onClick={() => handleCopyInvite('link', activeGroup)}
                      title={copiedState === 'link' ? 'Link copiado' : 'Copiar link de invitación'}
                      aria-label={copiedState === 'link' ? 'Link copiado' : 'Copiar link de invitación'}
                    >
                      {copiedState === 'link' ? (
                        <Check className="w-3.5 h-3.5 text-success" strokeWidth={2} />
                      ) : (
                        <LinkIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      )}
                    </Button>

                    {onNavigateToSessions && (
                      <Button size="xs" onClick={onNavigateToSessions} title="Ir a sesiones">
                        <span>Sesiones</span>
                        <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* GitHub Repo Settings Tab Navigation */}
              <div className="flex flex-wrap gap-1 border-b border-border pb-2">
                {settingsTabs.map((t) => {
                  const active = detailTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setDetailTab(t.key)}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer',
                        active
                          ? 'bg-secondary/55 border-primary text-foreground'
                          : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-card'
                      )}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                      {t.badge && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {t.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* SUBTAB 1: MEMBERS & ROLES */}
              {detailTab === 'members' && (
                <div className="space-y-4">
                  {memberFeedback && (
                    <div
                      className={cn(
                        'px-3.5 py-2.5 rounded-md border text-xs font-medium',
                        memberFeedback.type === 'success'
                          ? 'bg-success/10 border-success/40 text-success'
                          : 'bg-destructive/10 border-destructive/40 text-destructive'
                      )}
                    >
                      {memberFeedback.text}
                    </div>
                  )}

                  <Card>
                    <CardHeader className="pb-3 border-b border-border">
                      <CardTitle className="text-sm">
                        Miembros ({currentMembers.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Jugador</TableHead>
                            <TableHead>Karma</TableHead>
                            <TableHead>Rol</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentMembers.map((member) => {
                            const isCreator =
                              activeGroup.createdBy === member.id;
                            const isAdmin =
                              isCreator ||
                              activeGroup.adminIds.includes(member.id);
                            const isMe = member.id === currentUser.id;

                            return (
                              <TableRow key={member.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <img
                                      src={member.avatarUrl}
                                      alt={member.displayName}
                                      className="w-8 h-8 rounded-full border border-border object-cover shrink-0"
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-foreground">
                                          {member.displayName}
                                        </span>
                                        {isMe && (
                                          <Badge variant="default" className="text-[9px] px-1 py-0">
                                            Vos
                                          </Badge>
                                        )}
                                      </div>
                                      {member.discordUsername && (
                                        <span className="text-[10px] font-mono text-muted-foreground">
                                          @{member.discordUsername}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs font-semibold">
                                  {member.karmaScore}
                                </TableCell>
                                <TableCell>
                                  {isCreator ? (
                                    <Badge variant="warning" className="text-[10px]">
                                      <Crown className="w-3 h-3" strokeWidth={1.75} />
                                      <span>Creador</span>
                                    </Badge>
                                  ) : isAdmin ? (
                                    <Badge variant="default" className="text-[10px]">
                                      <Shield className="w-3 h-3" strokeWidth={1.75} />
                                      <span>Admin</span>
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px]">
                                      Miembro
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {isCreatorOrAdmin && !isCreator && (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        className="w-7 px-0"
                                        onClick={() => handleToggleAdmin(member)}
                                        title={isAdmin ? `Quitar Admin a ${member.displayName}` : `Hacer Admin a ${member.displayName}`}
                                        aria-label={isAdmin ? `Quitar Admin a ${member.displayName}` : `Hacer Admin a ${member.displayName}`}
                                      >
                                        {isAdmin ? (
                                          <ShieldOff className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        ) : (
                                          <Shield className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        )}
                                      </Button>
                                    )}
                                    {(isMe || isCreatorOrAdmin) &&
                                      !isCreator && (
                                        <Button
                                          size="xs"
                                          variant="destructive"
                                          className="w-7 px-0"
                                          onClick={() =>
                                            handleRemoveOrLeaveMember(member)
                                          }
                                          title={isMe ? 'Salir del grupo' : `Expulsar a ${member.displayName}`}
                                          aria-label={isMe ? 'Salir del grupo' : `Expulsar a ${member.displayName}`}
                                        >
                                          {isMe ? (
                                            <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                                          ) : (
                                            <UserMinus className="w-3.5 h-3.5" strokeWidth={1.75} />
                                          )}
                                        </Button>
                                      )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Add Platform Members */}
                  {availablePlatformPlayers.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-primary" strokeWidth={1.75} />
                          <span>Sumar Miembros</span>
                        </CardTitle>
                        <div className="relative w-full sm:w-56">
                          <Search
                            className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2"
                            strokeWidth={1.75}
                          />
                          <Input
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Buscar usuario..."
                            className="pl-8 h-8 text-xs"
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {availablePlatformPlayers.map((pl) => (
                          <div
                            key={pl.id}
                            className="p-2.5 rounded-md bg-background/45 border border-border flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={pl.avatarUrl}
                                alt={pl.displayName}
                                className="w-7 h-7 rounded-full object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-medium text-foreground block truncate">
                                  {pl.displayName}
                                </span>
                                {pl.discordUsername && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate block">
                                    @{pl.discordUsername}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              size="xs"
                              variant="secondary"
                              className="w-7 px-0 shrink-0"
                              onClick={() => {
                                addMemberToGroup(activeGroup.id, pl.id);
                                setMemberFeedback({
                                  type: 'success',
                                  text: `${pl.displayName} agregado a ${activeGroup.name}.`,
                                });
                              }}
                              title={`Sumar a ${pl.displayName}`}
                              aria-label={`Sumar a ${pl.displayName}`}
                            >
                              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </Button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* SUBTAB: GAMES */}
              {detailTab === 'games' && (
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
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] shrink-0"
                                    >
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
                                    onClick={() => openAddToLibraryModal(game)}
                                    title={
                                      inMyLibrary
                                        ? 'Editar puntaje y horas en mi librería'
                                        : 'Agregar a mi librería'
                                    }
                                  >
                                    <BookPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
                                    <span>
                                      {inMyLibrary ? 'En librería' : 'Agregar a librería'}
                                    </span>
                                  </Button>
                                  {isCreatorOrAdmin && (
                                    <Button
                                      size="xs"
                                      variant="destructive"
                                      className="w-7 px-0"
                                      onClick={() =>
                                        removeGameFromGroup(activeGroup.id, game.id)
                                      }
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
                                  onChange={(e) =>
                                    setCustomGameMinPlayers(Number(e.target.value) || 1)
                                  }
                                  className="w-16 h-7 text-xs"
                                />
                                <span>a</span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={customGameMaxPlayers}
                                  onChange={(e) =>
                                    setCustomGameMaxPlayers(Number(e.target.value) || 5)
                                  }
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
                            {groupGameCandidates
                              .slice(0, groupGamePickerLimit)
                              .map((candidate) => (
                                <div
                                  key={candidate.key}
                                  className="p-2.5 rounded-lg bg-background/45 border border-border flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <a
                                      href={resolveGameOfficialUrl({
                                        name: candidate.name,
                                        coverUrl: candidate.coverUrl,
                                        tags: candidate.tags,
                                        id: candidate.catalogGameId,
                                      })}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={`Ver página oficial de ${candidate.name}`}
                                      aria-label={`Ver página oficial de ${candidate.name}`}
                                      className="shrink-0 block hover:opacity-90 transition-opacity"
                                    >
                                      {candidate.coverUrl ? (
                                        <img
                                          src={candidate.coverUrl}
                                          alt={candidate.name}
                                          className="w-16 h-10 rounded object-cover border border-border/60 block"
                                        />
                                      ) : (
                                        <div className="w-16 h-10 rounded bg-secondary/50 border border-border/60 flex items-center justify-center text-muted-foreground">
                                          <Gamepad2 className="w-4 h-4" strokeWidth={1.75} />
                                        </div>
                                      )}
                                    </a>

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold text-foreground truncate">
                                          {candidate.name}
                                        </span>
                                        <Badge variant="outline" className="text-[10px]">
                                          {candidate.category}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          {candidate.minPlayers}–{candidate.maxPlayers}j
                                        </span>
                                      </div>

                                      {candidate.memberAffinities.length > 0 && (
                                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                          <div className="flex items-center -space-x-1.5">
                                            {candidate.memberAffinities.map((aff) => (
                                              <div
                                                key={aff.player.id}
                                                className="relative group/avatar"
                                              >
                                                <img
                                                  src={aff.player.avatarUrl}
                                                  alt={aff.player.displayName}
                                                  className={cn(
                                                    'w-6 h-6 rounded-full object-cover border-2 bg-background cursor-help transition-transform group-hover/avatar:scale-110 group-hover/avatar:z-10',
                                                    aff.burnedOut
                                                      ? 'border-destructive/70 opacity-75'
                                                      : aff.rating && aff.rating >= 4
                                                        ? 'border-emerald-400/80'
                                                        : 'border-border'
                                                  )}
                                                />
                                                <div className="pointer-events-none hidden group-hover/avatar:block absolute left-0 bottom-full mb-1.5 z-40 w-48 p-2 rounded-md bg-popover border border-border shadow-xl text-[11px] space-y-1">
                                                  <div className="font-semibold text-foreground flex items-center justify-between gap-1">
                                                    <span className="truncate">
                                                      {aff.player.displayName}
                                                    </span>
                                                    {aff.rating && (
                                                      <span className="text-amber-400 font-mono shrink-0">
                                                        {aff.rating}★
                                                      </span>
                                                    )}
                                                  </div>
                                                  <div className="text-muted-foreground flex items-center justify-between gap-2 text-[10px]">
                                                    <span>{aff.sourceLabel}</span>
                                                    {aff.hoursPlayed !== undefined && (
                                                      <span className="font-mono">
                                                        {aff.hoursPlayed}h
                                                        {aff.recentHoursPlayed
                                                          ? ` (${aff.recentHoursPlayed}h rec.)`
                                                          : ''}
                                                      </span>
                                                    )}
                                                  </div>
                                                  {aff.burnedOut && (
                                                    <div className="text-[10px] text-destructive font-medium">
                                                      Quemado de este juego
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          <span className="text-[10px] text-emerald-400 font-medium">
                                            {candidate.memberAffinities.length}{' '}
                                            {candidate.memberAffinities.length === 1
                                              ? 'jugador del grupo'
                                              : 'jugadores del grupo'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <Button
                                    size="xs"
                                    variant="secondary"
                                    className="shrink-0"
                                    onClick={() => {
                                      if (candidate.catalogGameId) {
                                        addGameToGroup(
                                          activeGroup.id,
                                          candidate.catalogGameId
                                        );
                                      } else {
                                        addAndLinkGameToGroup(activeGroup.id, {
                                          name: candidate.name,
                                          category: candidate.category,
                                          coverUrl: candidate.coverUrl,
                                          minPlayers: candidate.minPlayers,
                                          maxPlayers: candidate.maxPlayers,
                                          tags: candidate.tags,
                                          averageDurationMins:
                                            candidate.averageDurationMins,
                                        });
                                      }
                                    }}
                                    title={`Agregar ${candidate.name} al grupo`}
                                  >
                                    <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
                                    <span>Agregar</span>
                                  </Button>
                                </div>
                              ))}

                            {groupGameCandidates.length > groupGamePickerLimit && (
                              <div className="pt-1 flex justify-center">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() =>
                                    setGroupGamePickerLimit((n) => n + 30)
                                  }
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
                </div>
              )}

              {/* SUBTAB 2: DISCORD WEBHOOK SETTINGS */}
              {detailTab === 'discord' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3 border-b border-border">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Webhook className="w-4 h-4 text-primary" strokeWidth={1.75} />
                        <span>Webhook Discord</span>
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="p-4">
                      <form onSubmit={handleSaveDiscordConfig} className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-md bg-background/45 border border-border">
                          <Label className="text-xs">
                            Webhook Activo
                          </Label>
                          <Switch
                            checked={discordForm.enabled}
                            onCheckedChange={(val) =>
                              setDiscordForm((p) => ({ ...p, enabled: val }))
                            }
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Discord Webhook URL</Label>
                          <Input
                            type="url"
                            value={discordForm.webhookUrl}
                            onChange={(e) =>
                              setDiscordForm((p) => ({
                                ...p,
                                webhookUrl: e.target.value,
                              }))
                            }
                            placeholder="URL del webhook de Discord"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Nombre del Canal</Label>
                            <Input
                              value={discordForm.channelName}
                              onChange={(e) =>
                                setDiscordForm((p) => ({
                                  ...p,
                                  channelName: e.target.value,
                                }))
                              }
                              placeholder="#squad-gaming"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Servidor (Guild)</Label>
                            <Input
                              value={discordForm.guildName}
                              onChange={(e) =>
                                setDiscordForm((p) => ({
                                  ...p,
                                  guildName: e.target.value,
                                }))
                              }
                              placeholder="Boludos Server"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Role ID Mención</Label>
                            <Input
                              value={discordForm.mentionRoleId}
                              onChange={(e) =>
                                setDiscordForm((p) => ({
                                  ...p,
                                  mentionRoleId: e.target.value,
                                }))
                              }
                              placeholder="Ej: 1234567890"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-md bg-background/45 border border-border">
                          <Label className="text-xs">Mencionar @here / @everyone</Label>
                          <Switch
                            checked={discordForm.useEveryoneMention}
                            onCheckedChange={(val) =>
                              setDiscordForm((p) => ({
                                ...p,
                                useEveryoneMention: val,
                              }))
                            }
                          />
                        </div>

                        {discordSaveFeedback && (
                          <div className="p-2.5 rounded-md bg-success/10 border border-success/40 text-xs text-success">
                            {discordSaveFeedback}
                          </div>
                        )}

                        {discordTestState.message && (
                          <div
                            className={cn(
                              'p-2.5 rounded-md border text-xs',
                              discordTestState.ok
                                ? 'bg-success/10 border-success/40 text-success'
                                : 'bg-destructive/10 border-destructive/40 text-destructive'
                            )}
                          >
                            {discordTestState.message}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={discordTestState.loading}
                            onClick={handleTestDiscordWebhook}
                            title="Probar Webhook"
                            aria-label="Probar Webhook"
                          >
                            <Send className="w-4 h-4" strokeWidth={1.75} />
                            <span>
                              {discordTestState.loading ? 'Probando...' : 'Probar'}
                            </span>
                          </Button>
                          <Button type="submit">Guardar</Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Recent Logs for this group */}
                  <Card>
                    <CardHeader className="pb-2 border-b border-border">
                      <CardTitle className="text-sm">
                        Logs Discord ({groupDiscordLogs.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2 max-h-60 overflow-y-auto">
                      {groupDiscordLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 text-center">
                          Sin eventos registrados.
                        </p>
                      ) : (
                        groupDiscordLogs.slice(0, 8).map((log) => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded-md bg-background/45 border border-border space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground">
                                {log.embed.title}
                              </span>
                              <Badge
                                variant={log.deliveredToWebhook ? 'success' : 'secondary'}
                                className="text-[9px]"
                              >
                                {log.deliveredToWebhook ? 'Webhook OK' : 'Mirror Local'}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">
                              {log.embed.description}
                            </p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* SUBTAB 3: SESSIONS */}
              {detailTab === 'sessions' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between gap-2">
                      <CardTitle className="text-sm">
                        Activas ({activeGroupSessions.length}) · Historial ({finishedGroupSessions.length})
                      </CardTitle>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="xs"
                          variant="secondary"
                          disabled={activeGroupSessions.some(
                            (s) => s.sessionKind === 'instant'
                          )}
                          onClick={() => setShowInstantModal(true)}
                          title={
                            activeGroupSessions.some(
                              (s) => s.sessionKind === 'instant'
                            )
                              ? 'Ya hay una convocatoria instantánea en curso'
                              : 'Convocar jugadores ahora'
                          }
                        >
                          <Zap className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
                          <span>Convocar ahora</span>
                        </Button>
                        {onNavigateToSessions && (
                          <Button size="xs" onClick={onNavigateToSessions}>
                            <span>Sesiones</span>
                            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                      {groupSessions.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">
                          Sin sesiones.
                        </p>
                      ) : (
                        groupSessions.map((sess) => {
                          const gId =
                            sess.selectedGameId || sess.rouletteWinnerGameId;
                          const game = gId ? gamesById.get(gId) : undefined;
                          return (
                            <div
                              key={sess.id}
                              className="p-3 rounded-md bg-background/45 border border-border flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-foreground truncate">
                                    {sess.title}
                                  </span>
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {sess.date}
                                  </Badge>
                                  {game && (
                                    <Badge variant="purple" className="text-[10px]">
                                      {game.name}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {sess.participants.length} anotados · Modo{' '}
                                  {sess.mode === 'random' ? 'Ruleta' : 'Fijo'}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {(sess.createdBy === currentUser.id || isCreatorOrAdmin) && (
                                  confirmDeleteGroupSessionId === sess.id ? (
                                    <>
                                      <Button
                                        size="xs"
                                        variant="destructive"
                                        onClick={() => {
                                          deleteSession(sess.id);
                                          setConfirmDeleteGroupSessionId(null);
                                        }}
                                        title="Confirmar eliminación"
                                      >
                                        <span>Borrar</span>
                                      </Button>
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() => setConfirmDeleteGroupSessionId(null)}
                                        title="Cancelar"
                                      >
                                        <span>No</span>
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="xs"
                                      variant="destructive"
                                      className="w-7 px-0"
                                      onClick={() => setConfirmDeleteGroupSessionId(sess.id)}
                                      title="Eliminar sesión"
                                      aria-label="Eliminar sesión"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                                    </Button>
                                  )
                                )}
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  className="w-7 px-0 shrink-0"
                                  onClick={() => {
                                    setActiveSessionId(sess.id);
                                    onNavigateToSessions?.();
                                  }}
                                  title="Ver sesión"
                                  aria-label="Ver sesión"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* SUBTAB 4: IDENTITY & DANGER ZONE */}
              {detailTab === 'settings' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                      <CardTitle className="text-sm">Identidad</CardTitle>
                      {!isCreatorOrAdmin && (
                        <Badge variant="outline" className="text-[10px]">
                          Solo lectura
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent className="p-4">
                      <Form {...identityForm}>
                        <form onSubmit={handleSaveIdentity} className="space-y-3">
                          <FormField
                            control={identityForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nombre del Grupo</FormLabel>
                                <FormControl>
                                  <Input disabled={!isCreatorOrAdmin} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={identityForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Descripción</FormLabel>
                                <FormControl>
                                  <Input disabled={!isCreatorOrAdmin} {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={identityForm.control}
                            name="avatarUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Avatar URL (Opcional)</FormLabel>
                                <FormControl>
                                  <Input
                                    disabled={!isCreatorOrAdmin}
                                    placeholder="https://..."
                                    {...field}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          {identitySaved && (
                            <p className="text-xs text-success">
                              ✓ Cambios guardados correctamente.
                            </p>
                          )}

                          {isCreatorOrAdmin && (
                            <div className="flex justify-end">
                              <Button type="submit">Guardar</Button>
                            </div>
                          )}
                        </form>
                      </Form>
                    </CardContent>
                  </Card>

                  {/* Danger Zone */}
                  {isCreatorOrAdmin && (
                    <Card className="border-destructive/40 bg-destructive/15">
                      <CardHeader className="pb-3 border-b border-destructive/25">
                        <CardTitle className="text-sm text-destructive flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4" strokeWidth={1.75} />
                          <span>Danger Zone</span>
                        </CardTitle>
                        <CardDescription>
                          Eliminar este grupo borra permanentemente sus sesiones e historial.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">
                          <strong className="text-foreground">{activeGroup.name}</strong>{' '}
                          tiene {activeGroup.memberIds.length} miembro(s) y{' '}
                          {groupSessions.length} sesión(es).
                        </div>

                        {!confirmDelete ? (
                          <Button
                            size="xs"
                            variant="destructive"
                            className="w-7 px-0"
                            onClick={() => setConfirmDelete(true)}
                            title="Eliminar grupo"
                            aria-label="Eliminar grupo"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setConfirmDelete(false)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => {
                                deleteGroup(activeGroup.id);
                                setConfirmDelete(false);
                              }}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.75} />
                              <span>Confirmar</span>
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* CREATE GROUP DIALOG (RHF + ZOD) */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Grupo</DialogTitle>
          </DialogHeader>

          <Form {...createForm}>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Grupo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Los Pibes del CS2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input placeholder="Co-op nocturno sin humo..." {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Avatar mode & color swatches */}
              <div className="space-y-2 p-3 rounded-md bg-background/45 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    Ícono del Grupo
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setCreateAvatarMode('initials')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] border cursor-pointer',
                        createAvatarMode === 'initials'
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-card/50 border-border text-muted-foreground'
                      )}
                    >
                      Iniciales
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateAvatarMode('url')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] border cursor-pointer',
                        createAvatarMode === 'url'
                          ? 'bg-primary/15 border-primary text-primary'
                          : 'bg-card/50 border-border text-muted-foreground'
                      )}
                    >
                      URL Imagen
                    </button>
                  </div>
                </div>

                {createAvatarMode === 'initials' ? (
                  <div className="flex items-center gap-2 pt-1">
                    {GROUP_COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => setCreateColorId(preset.id)}
                        className={cn(
                          'w-7 h-7 rounded-md bg-gradient-to-br border-2 cursor-pointer transition-transform',
                          preset.tailwindBg,
                          createColorId === preset.id
                            ? 'border-white scale-110'
                            : 'border-transparent opacity-70 hover:opacity-100'
                        )}
                      />
                    ))}
                  </div>
                ) : (
                  <FormField
                    control={createForm.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Quick Initial Members Picker */}
              {players.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Invitar Jugadores Iniciales</Label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {players.map((pl) => {
                      const isMe = pl.id === currentUser.id;
                      const selected = isMe || createMemberIds.includes(pl.id);
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          disabled={isMe}
                          onClick={() =>
                            setCreateMemberIds((prev) =>
                              prev.includes(pl.id)
                                ? prev.filter((id) => id !== pl.id)
                                : [...prev, pl.id]
                            )
                          }
                          className={cn(
                            'p-1.5 rounded border text-left flex items-center gap-2 text-xs cursor-pointer disabled:opacity-80',
                            selected
                              ? 'bg-primary/15 border-primary/50 text-foreground'
                              : 'bg-background/45 border-border text-muted-foreground'
                          )}
                        >
                          <img
                            src={pl.avatarUrl}
                            alt={pl.displayName}
                            className="w-5 h-5 rounded-full object-cover shrink-0"
                          />
                          <span className="truncate">{pl.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional Initial Discord Webhook */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCreateDiscord((p) => !p)}
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {showCreateDiscord
                    ? '− Ocultar Webhook'
                    : '+ Webhook Discord'}
                </button>

                {showCreateDiscord && (
                  <div className="p-3 rounded-md bg-background/45 border border-border space-y-2">
                    <Input
                      type="url"
                      placeholder="URL del webhook de Discord"
                      value={createDiscordConfig.webhookUrl}
                      onChange={(e) =>
                        setCreateDiscordConfig((p) => ({
                          ...p,
                          webhookUrl: e.target.value,
                        }))
                      }
                    />
                    <Input
                      placeholder="Canal (ej: squad-gaming)"
                      value={createDiscordConfig.channelName}
                      onChange={(e) =>
                        setCreateDiscordConfig((p) => ({
                          ...p,
                          channelName: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">Crear</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ADD TO MY LIBRARY MODAL */}
      <InstantSessionModal
        open={showInstantModal}
        onOpenChange={setShowInstantModal}
        groupName={activeGroup?.name}
        onSubmit={({ startsInMinutes, title }) => {
          if (!activeGroup) return;
          createInstantSession({
            groupId: activeGroup.id,
            startsInMinutes,
            title,
          });
          onNavigateToSessions?.();
        }}
      />

      <Dialog
        open={libraryModalGame !== null}
        onOpenChange={(open) => {
          if (!open) setLibraryModalGame(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <BookPlus className="w-4 h-4 text-primary" strokeWidth={1.75} />
              <span>Agregar a mi librería</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {libraryModalGame?.name} · {libraryModalGame?.category}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {librarySteamDetectedHours !== null && (
              <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center justify-between gap-2">
                <span>Detectado en tu cuenta de Steam</span>
                <span className="font-mono font-semibold">
                  {librarySteamDetectedHours}h
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Puntaje (1–5★)
              </label>
              <div className="flex items-center gap-1.5">
                {([1, 2, 3, 4, 5] as GameRating[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setLibraryRating(r)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer',
                      libraryRating >= r
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-background/50 border-border text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Star
                      className={cn(
                        'w-3.5 h-3.5',
                        libraryRating >= r ? 'fill-amber-400 text-amber-400' : ''
                      )}
                      strokeWidth={1.75}
                    />
                    <span>{r}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
                  <span>Horas totales</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={libraryHours}
                  onChange={(e) => setLibraryHours(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.75} />
                  <span>Últimas 2 sem. (opc.)</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={libraryRecentHours}
                  onChange={(e) => setLibraryRecentHours(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLibraryModalGame(null)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveLibraryModal}>
              Guardar en librería
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
