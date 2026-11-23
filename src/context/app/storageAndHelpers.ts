import { GamingGroup, PlayerProfile } from '../../types/domain';

export const STORAGE_KEYS = {
  CURRENT_USER_ID: 'bg_prod_v4_current_user_id',
  IS_AUTHENTICATED: 'bg_prod_v4_is_authenticated',
  PLAYERS: 'bg_prod_v4_players',
  GAMES: 'bg_prod_v4_games',
  PREFERENCES: 'bg_prod_v4_preferences',
  SESSIONS: 'bg_prod_v4_sessions',
  ACTIVE_SESSION_ID: 'bg_prod_v4_active_session_id',
  SANCTIONS: 'bg_prod_v4_sanctions',
  CHAT_MESSAGES: 'bg_prod_v4_chat_messages',
  DISCORD_CONFIG: 'bg_prod_v4_discord_config',
  DISCORD_LOGS: 'bg_prod_v4_discord_logs',
  PUSH_ALERTS: 'bg_prod_v4_push_alerts',
  GROUPS: 'bg_prod_v4_groups',
  ACTIVE_GROUP_ID: 'bg_prod_v4_active_group_id',
  PENDING_INVITE_CODE: 'bg_prod_v4_pending_invite_code',
} as const;

export const STORAGE_RESET_GEN_KEY = 'bg_prod_v4_reset_gen_1';
export let didRunInitialStorageReset = false;
export let pendingInitialSignOut: Promise<unknown> | null = null;

// One-time reset guard for clean v4 production start + purge of legacy bg_v1_ keys
if (typeof window !== 'undefined') {
  try {
    const hasResetGen1 = localStorage.getItem(STORAGE_RESET_GEN_KEY) === '1';
    if (!hasResetGen1) {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('bg_') || key.startsWith('sb-')) {
          localStorage.removeItem(key);
        }
      });
      localStorage.setItem(STORAGE_RESET_GEN_KEY, '1');
      didRunInitialStorageReset = true;
    } else {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('bg_v1_')) {
          localStorage.removeItem(key);
        }
      });
    }
  } catch (error) {
    console.warn('Error purging stale localStorage keys:', error);
  }
}

export async function awaitInitialResetSignOut(
  signOutLocal: () => Promise<unknown>
): Promise<void> {
  if (!didRunInitialStorageReset) return;
  if (!pendingInitialSignOut) {
    pendingInitialSignOut = signOutLocal().catch((err) => {
      console.warn('Error clearing cached Supabase auth session on clean reset:', err);
    });
  }
  await pendingInitialSignOut;
  didRunInitialStorageReset = false;
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Error reading key ${key} from localStorage:`, error);
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Error writing key ${key} from localStorage:`, error);
  }
}

function extractInviteCodeFromHash(hash: string): string | null {
  if (!hash) return null;
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  const [hashPath, hashQuery] = cleaned.split('?');

  const invitePathMatch = hashPath.match(/^\/?invite\/([^/?#\s]+)/i);
  if (invitePathMatch && invitePathMatch[1]) {
    try {
      return decodeURIComponent(invitePathMatch[1]).trim().toUpperCase();
    } catch {
      return invitePathMatch[1].trim().toUpperCase();
    }
  }

  if (hashQuery) {
    const hashParams = new URLSearchParams(hashQuery);
    const fromHashQuery = hashParams.get('invite') || hashParams.get('joinGroup');
    if (fromHashQuery && fromHashQuery.trim()) {
      return fromHashQuery.trim().toUpperCase();
    }
  }

  return null;
}

export function extractInviteCodeFromInput(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://') || trimmed.includes('?') || trimmed.includes('#') || trimmed.startsWith('/invite/')) {
      const url = trimmed.includes('://')
        ? new URL(trimmed)
        : new URL(trimmed, 'https://boludos.local');
      const fromQuery = url.searchParams.get('invite') || url.searchParams.get('joinGroup');
      if (fromQuery) {
        return fromQuery.trim().toUpperCase();
      }
      const fromHash = extractInviteCodeFromHash(url.hash);
      if (fromHash) {
        return fromHash;
      }
      const fromPath = extractInviteCodeFromHash(url.pathname);
      if (fromPath) {
        return fromPath;
      }
    }
  } catch {
    // Fall through to regex/string parsing
  }
  const match = trimmed.match(/(?:invite|joinGroup)=([^&#\s]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]).trim().toUpperCase();
  }
  const pathMatch = trimmed.match(/\/invite\/([^/?#\s]+)/i);
  if (pathMatch && pathMatch[1]) {
    return decodeURIComponent(pathMatch[1]).trim().toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function parseInitialInviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const urlInvite = params.get('invite') || params.get('joinGroup');
    if (urlInvite && urlInvite.trim()) {
      const normalized = urlInvite.trim().toUpperCase();
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, normalized);
      return normalized;
    }

    const hashInvite = extractInviteCodeFromHash(window.location.hash || '');
    if (hashInvite) {
      saveToStorage(STORAGE_KEYS.PENDING_INVITE_CODE, hashInvite);
      return hashInvite;
    }
  } catch (error) {
    console.warn('Error parsing URL invite code:', error);
  }
  return loadFromStorage<string | null>(STORAGE_KEYS.PENDING_INVITE_CODE, null);
}

export function generateUniqueInviteCode(existingGroups: GamingGroup[]): string {
  const existing = new Set(existingGroups.map((g) => g.inviteCode.toUpperCase()));
  for (let i = 0; i < 20; i++) {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase().padEnd(4, 'X');
    const candidate = `BG-${rand}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `BG-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export const DEFAULT_FALLBACK_USER: PlayerProfile = {
  id: '',
  discordId: '',
  discordUsername: 'invitado',
  displayName: 'Invitado',
  avatarUrl: 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Invitado',
  karmaScore: 100,
  sessionsPlayed: 0,
  hoursPlayed: 0,
  onTimeCount: 0,
  lateCount: 0,
  noShowCount: 0,
  currentStreak: 0,
  activeTitle: '⌚ Reloj Suizo',
};
