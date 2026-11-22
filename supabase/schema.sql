-- ==============================================================================
-- BOLUDOS GAMING — SUPABASE POSTGRESQL SCHEMA (100% FREE TIER READY)
-- ==============================================================================
-- Includes full support for:
-- 1. Profiles & Karma Attendance Rating (0-100)
-- 2. Games library & User Preferences (1-5 star ratings)
-- 3. Gaming Sessions with precision windows (±5m, ±15m, ±30m, ±60m)
-- 4. Attendance Check-in, Votes & Tribunal del Humo Sanctions
-- 5. Realtime Global Chat with reactions & Discord mirror
-- 6. Discord Bot & Webhook configuration
-- 7. Realtime publications & Row Level Security (RLS)
-- ==============================================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE,
  discord_username TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  birth_date TEXT DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  karma_score INTEGER NOT NULL DEFAULT 80 CHECK (karma_score >= 0 AND karma_score <= 100),
  sessions_played INTEGER NOT NULL DEFAULT 0 CHECK (sessions_played >= 0),
  hours_played NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (hours_played >= 0),
  on_time_count INTEGER NOT NULL DEFAULT 0 CHECK (on_time_count >= 0),
  late_count INTEGER NOT NULL DEFAULT 0 CHECK (late_count >= 0),
  no_show_count INTEGER NOT NULL DEFAULT 0 CHECK (no_show_count >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  active_title TEXT NOT NULL DEFAULT 'Puntual en Práctica',
  push_subscription JSONB,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  weekly_schedule JSONB NOT NULL DEFAULT '{}'::JSONB,
  daily_overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
  category_preferences JSONB NOT NULL DEFAULT '{}'::JSONB,
  steam_profile JSONB DEFAULT NULL,
  taste_profile JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. GAMES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL,
  min_players INTEGER NOT NULL DEFAULT 1 CHECK (min_players >= 1),
  max_players INTEGER NOT NULL DEFAULT 10 CHECK (max_players >= min_players),
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  average_duration_mins INTEGER NOT NULL DEFAULT 60 CHECK (average_duration_mins > 0),
  added_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. USER GAME PREFERENCES (1 to 5 stars)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_game_preferences (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  plays BOOLEAN NOT NULL DEFAULT TRUE,
  rating INTEGER NOT NULL DEFAULT 3 CHECK (rating >= 1 AND rating <= 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, game_id)
);

-- ------------------------------------------------------------------------------
-- 4. GAMING GROUPS (Members, Invite Codes & Per-Group Discord Webhook)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  member_ids TEXT[] NOT NULL DEFAULT '{}',
  admin_ids TEXT[] NOT NULL DEFAULT '{}',
  game_ids TEXT[] NOT NULL DEFAULT '{}',
  discord_webhook_url TEXT NOT NULL DEFAULT '',
  discord_channel_name TEXT NOT NULL DEFAULT 'general-gaming',
  discord_guild_name TEXT NOT NULL DEFAULT '',
  discord_mention_role_id TEXT NOT NULL DEFAULT '',
  discord_use_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  discord_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  recommendation_votes JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS recommendation_votes JSONB NOT NULL DEFAULT '{}'::JSONB;

-- ------------------------------------------------------------------------------
-- 5. GAMING SESSIONS (Strictly Scoped to a Group)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('fixed', 'random')),
  selected_game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  selected_game_ids TEXT[] DEFAULT NULL,
  roulette_winner_game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'finished')) DEFAULT 'open',
  allow_split_lobbies BOOLEAN NOT NULL DEFAULT FALSE,
  discord_message_id TEXT,
  invited_user_ids TEXT[] DEFAULT NULL,
  callouts JSONB NOT NULL DEFAULT '[]'::JSONB,
  session_kind TEXT NOT NULL DEFAULT 'scheduled',
  instant_rsvps JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. SESSION PARTICIPANTS & SCHEDULE PRECISION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_participants (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  available_from TEXT NOT NULL, -- e.g. "22:00"
  available_until TEXT NOT NULL, -- e.g. "01:30"
  precision_minutes INTEGER NOT NULL CHECK (precision_minutes IN (5, 15, 30, 60)) DEFAULT 15,
  checked_in_at TIMESTAMPTZ,
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('pending', 'on_time', 'late', 'no_show')) DEFAULT 'pending',
  note TEXT,
  is_auto_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  confidence_percentage INTEGER NOT NULL DEFAULT 75 CHECK (confidence_percentage >= 10 AND confidence_percentage <= 100),
  confirmation_status TEXT NOT NULL DEFAULT 'probable' CHECK (confirmation_status IN ('probable', 'confirmed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 6. ATTENDANCE VOTES (Peer voting for Tribunal del Humo)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_votes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('on_time', 'late', 'no_show')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, voter_id, target_user_id)
);

-- ------------------------------------------------------------------------------
-- 7. SANCTIONS & KARMA HISTORY
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sanctions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  session_title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('late', 'no_show', 'on_time_bonus')),
  promised_time TEXT NOT NULL,
  precision_minutes INTEGER NOT NULL CHECK (precision_minutes IN (5, 15, 30, 60)),
  actual_time TEXT,
  karma_delta INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 8. REALTIME GLOBAL CHAT MESSAGES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentions TEXT[] NOT NULL DEFAULT '{}',
  reply_to_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
  linked_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  reactions JSONB NOT NULL DEFAULT '[]'::JSONB,
  forwarded_to_discord BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. DISCORD INTEGRATION CONFIG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discord_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_url TEXT NOT NULL DEFAULT '',
  channel_name TEXT NOT NULL DEFAULT 'vicio-general',
  guild_name TEXT NOT NULL DEFAULT 'Boludos Gaming Server',
  mention_role_id TEXT NOT NULL DEFAULT '',
  use_everyone_mention BOOLEAN NOT NULL DEFAULT FALSE,
  events JSONB NOT NULL DEFAULT '{
    "session_created": true,
    "player_joined": true,
    "roulette_winner": true,
    "late_ping": true,
    "sanction_issued": true,
    "chat_broadcast": true,
    "checkin_update": true,
    "session_callout": true
  }'::JSONB,
  steam_api_key TEXT DEFAULT NULL,
  igdb_client_id TEXT DEFAULT NULL,
  igdb_client_secret TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- TRIBUNAL DEL HUMO TRIGGER: APPLY SANCTION KARMA DELTA & UPDATE TITLES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_sanction_karma_delta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_current_karma INTEGER;
  v_new_karma INTEGER;
  v_current_streak INTEGER;
  v_new_streak INTEGER;
  v_new_title TEXT;
BEGIN
  -- Fetch current karma and streak
  SELECT karma_score, current_streak
  INTO v_current_karma, v_current_streak
  FROM profiles
  WHERE id = NEW.user_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Calculate new karma score bounded between 0 and 100
  v_new_karma := GREATEST(0, LEAST(100, v_current_karma + NEW.karma_delta));

  -- Streak computation: increment on on_time_bonus, reset on late or no_show
  IF NEW.type = 'on_time_bonus' THEN
    v_new_streak := v_current_streak + 1;
  ELSE
    v_new_streak := 0;
  END IF;

  -- Title calculation based on karma score and streak
  IF v_new_karma >= 95 AND v_new_streak >= 5 THEN
    v_new_title := 'Reloj Suizo Legendario ⏱️🔥';
  ELSIF v_new_karma >= 85 THEN
    v_new_title := 'Puntual Confiable 👍';
  ELSIF v_new_karma >= 65 THEN
    v_new_title := 'Al Límite ⚠️';
  ELSIF v_new_karma >= 40 THEN
    v_new_title := 'Humo Sospechoso 💨';
  ELSE
    v_new_title := 'Fantasma del Tribunal 👻';
  END IF;

  -- Update target profile counters
  UPDATE profiles
  SET
    karma_score = v_new_karma,
    current_streak = v_new_streak,
    active_title = v_new_title,
    on_time_count = on_time_count + CASE WHEN NEW.type = 'on_time_bonus' THEN 1 ELSE 0 END,
    late_count = late_count + CASE WHEN NEW.type = 'late' THEN 1 ELSE 0 END,
    no_show_count = no_show_count + CASE WHEN NEW.type = 'no_show' THEN 1 ELSE 0 END
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Indexes on foreign keys for optimal query performance
CREATE INDEX IF NOT EXISTS idx_games_added_by ON games(added_by);
CREATE INDEX IF NOT EXISTS idx_preferences_game_id ON user_game_preferences(game_id);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON groups(invite_code);
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_sessions_group_id ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_selected_game_id ON sessions(selected_game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_roulette_winner_id ON sessions(roulette_winner_game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON session_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_id ON attendance_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_votes_target_user_id ON attendance_votes(target_user_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_user_id ON sanctions(user_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_session_id ON sanctions(session_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_group_id ON sanctions(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_group_id ON chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_chat_reply_to_id ON chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_linked_session_id ON chat_messages(linked_session_id);

DROP TRIGGER IF EXISTS trg_apply_sanction_karma ON sanctions;
CREATE TRIGGER trg_apply_sanction_karma
AFTER INSERT ON sanctions
FOR EACH ROW
EXECUTE FUNCTION apply_sanction_karma_delta();

CREATE OR REPLACE FUNCTION public.upsert_instant_rsvp(p_session_id TEXT, p_rsvp JSONB)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.sessions
  SET instant_rsvps = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) || jsonb_build_array(p_rsvp)
    FROM jsonb_array_elements(COALESCE(instant_rsvps, '[]'::jsonb)) AS elem
    WHERE elem->>'userId' IS DISTINCT FROM p_rsvp->>'userId'
  )
  WHERE id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.add_game_to_group(p_group_id TEXT, p_game_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.groups
  SET
    game_ids = CASE
      WHEN COALESCE(game_ids, '{}'::text[]) @> ARRAY[p_game_id] THEN COALESCE(game_ids, '{}'::text[])
      ELSE array_append(COALESCE(game_ids, '{}'::text[]), p_game_id)
    END,
    updated_at = NOW()
  WHERE id = p_group_id;
$$;

CREATE OR REPLACE FUNCTION public.remove_game_from_group(p_group_id TEXT, p_game_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.groups
  SET
    game_ids = array_remove(COALESCE(game_ids, '{}'::text[]), p_game_id),
    updated_at = NOW()
  WHERE id = p_group_id;
$$;

CREATE OR REPLACE FUNCTION public.add_member_to_group(p_group_id TEXT, p_user_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.groups
  SET
    member_ids = CASE
      WHEN COALESCE(member_ids, '{}'::text[]) @> ARRAY[p_user_id] THEN COALESCE(member_ids, '{}'::text[])
      ELSE array_append(COALESCE(member_ids, '{}'::text[]), p_user_id)
    END,
    updated_at = NOW()
  WHERE id = p_group_id;
$$;

CREATE OR REPLACE FUNCTION public.remove_member_from_group(p_group_id TEXT, p_user_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.groups
  SET
    member_ids = array_remove(COALESCE(member_ids, '{}'::text[]), p_user_id),
    admin_ids = array_remove(COALESCE(admin_ids, '{}'::text[]), p_user_id),
    updated_at = NOW()
  WHERE id = p_group_id;
$$;

CREATE OR REPLACE FUNCTION public.cast_group_recommendation_vote(
  p_group_id TEXT,
  p_rec_key TEXT,
  p_user_id TEXT,
  p_vote TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_votes JSONB;
  v_rec_votes JSONB;
BEGIN
  IF p_vote IS NOT NULL AND p_vote NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'Invalid recommendation vote value: %', p_vote;
  END IF;

  SELECT COALESCE(recommendation_votes, '{}'::JSONB)
  INTO v_votes
  FROM public.groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_rec_votes := COALESCE(v_votes -> p_rec_key, '{}'::JSONB);

  IF p_vote IS NULL THEN
    v_rec_votes := v_rec_votes - p_user_id;
    IF v_rec_votes = '{}'::JSONB THEN
      v_votes := v_votes - p_rec_key;
    ELSE
      v_votes := jsonb_set(v_votes, ARRAY[p_rec_key], v_rec_votes, true);
    END IF;
  ELSE
    v_rec_votes := jsonb_set(v_rec_votes, ARRAY[p_user_id], to_jsonb(p_vote), true);
    v_votes := jsonb_set(v_votes, ARRAY[p_rec_key], v_rec_votes, true);
  END IF;

  UPDATE public.groups
  SET
    recommendation_votes = v_votes,
    updated_at = NOW()
  WHERE id = p_group_id;
END;
$$;

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_game_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_config ENABLE ROW LEVEL SECURITY;

-- Permissive public policies for the gaming group (demo and authenticated users)
CREATE POLICY "Public Read Profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Public Insert Profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Profiles" ON profiles FOR UPDATE USING (true);
CREATE POLICY "Public Delete Profiles" ON profiles FOR DELETE USING (true);

CREATE POLICY "Public Read Games" ON games FOR SELECT USING (true);
CREATE POLICY "Public Insert Games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Games" ON games FOR UPDATE USING (true);
CREATE POLICY "Public Delete Games" ON games FOR DELETE USING (true);

CREATE POLICY "Public Read Preferences" ON user_game_preferences FOR SELECT USING (true);
CREATE POLICY "Public Insert Preferences" ON user_game_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Preferences" ON user_game_preferences FOR UPDATE USING (true);
CREATE POLICY "Public Delete Preferences" ON user_game_preferences FOR DELETE USING (true);

CREATE POLICY "Public Read Groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Public Insert Groups" ON groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Groups" ON groups FOR UPDATE USING (true);
CREATE POLICY "Public Delete Groups" ON groups FOR DELETE USING (true);

CREATE POLICY "Public Read Sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Public Insert Sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Sessions" ON sessions FOR UPDATE USING (true);
CREATE POLICY "Public Delete Sessions" ON sessions FOR DELETE USING (true);

CREATE POLICY "Public Read Participants" ON session_participants FOR SELECT USING (true);
CREATE POLICY "Public Insert Participants" ON session_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Participants" ON session_participants FOR UPDATE USING (true);
CREATE POLICY "Public Delete Participants" ON session_participants FOR DELETE USING (true);

CREATE POLICY "Public Read Votes" ON attendance_votes FOR SELECT USING (true);
CREATE POLICY "Public Insert Votes" ON attendance_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Votes" ON attendance_votes FOR UPDATE USING (true);
CREATE POLICY "Public Delete Votes" ON attendance_votes FOR DELETE USING (true);

CREATE POLICY "Public Read Sanctions" ON sanctions FOR SELECT USING (true);
CREATE POLICY "Public Insert Sanctions" ON sanctions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Sanctions" ON sanctions FOR UPDATE USING (true);
CREATE POLICY "Public Delete Sanctions" ON sanctions FOR DELETE USING (true);

CREATE POLICY "Public Read Chat" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Public Insert Chat" ON chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Chat" ON chat_messages FOR UPDATE USING (true);
CREATE POLICY "Public Delete Chat" ON chat_messages FOR DELETE USING (true);

CREATE POLICY "Public Read Discord Config" ON discord_config FOR SELECT USING (true);
CREATE POLICY "Public Insert Discord Config" ON discord_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Public Update Discord Config" ON discord_config FOR UPDATE USING (true);
CREATE POLICY "Public Delete Discord Config" ON discord_config FOR DELETE USING (true);

-- ------------------------------------------------------------------------------
-- REALTIME REPLICATION PUBLICATION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE
  profiles,
  games,
  user_game_preferences,
  groups,
  sessions,
  session_participants,
  attendance_votes,
  sanctions,
  chat_messages,
  discord_config;

-- ------------------------------------------------------------------------------
-- INITIAL SEED: DEFAULT DISCORD CONFIG
-- ------------------------------------------------------------------------------
INSERT INTO discord_config (id, enabled, webhook_url, channel_name, guild_name, mention_role_id, use_everyone_mention, events)
VALUES (
  'default',
  TRUE,
  '',
  'vicio-general',
  'Boludos Gaming Server',
  '',
  FALSE,
  '{
    "session_created": true,
    "player_joined": true,
    "roulette_winner": true,
    "late_ping": true,
    "sanction_issued": true,
    "chat_broadcast": true,
    "checkin_update": true,
    "session_callout": true
  }'::JSONB
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- INITIAL SEED: POPULAR GAMES
-- ------------------------------------------------------------------------------
INSERT INTO games (id, name, description, cover_url, min_players, max_players, category, tags, average_duration_mins, added_by)
VALUES
  ('cs2', 'Counter-Strike 2', 'Shooter táctico 5v5 por rondas de plantar/desactivar la bomba. Clásico indiscutido de las noches competitivas.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/header.jpg', 2, 5, 'Shooter Táctico', ARRAY['Competitivo', 'FPS', 'Clásico'], 45, NULL),
  ('aoe2', 'Age of Empires II: DE', 'Estrategia en tiempo real medieval para hasta 8 amigos: levantar imperios, juntar recursos y mandarse con todo en Imperial.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/813780/header.jpg', 2, 8, 'RTS', ARRAY['Estrategia', 'Clásico', 'Larga Duración'], 90, NULL),
  ('helldivers2', 'Helldivers 2', 'Escuadrón cooperativo de hasta 4 soldados repartiendo democracia intergaláctica contra hordas de bichos y autómatas.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/553850/header.jpg', 1, 4, 'Co-op Acción', ARRAY['Cooperativo', 'Acción', 'Democracia'], 40, NULL),
  ('lethal-company', 'Lethal Company', 'Terror cooperativo y comedia involuntaria: 4 chatarreros entrando a lunas abandonadas con chat de voz por proximidad.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1966720/header.jpg', 2, 4, 'Co-op Horror', ARRAY['Risas', 'Cooperativo', 'Terror'], 30, NULL),
  ('dota2', 'Dota 2', 'Batallas intensas 5v5 de estrategia, héroes, teamfights y defensa del Ancestro.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/header.jpg', 2, 5, 'MOBA', ARRAY['Competitivo', 'Estrategia', 'Tóxico'], 50, NULL),
  ('phasmophobia', 'Phasmophobia', 'Investigación paranormal cooperativa para 4 amigos cazando fantasmas con micrófono abierto.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/739630/header.jpg', 1, 4, 'Co-op Horror', ARRAY['Cooperativo', 'Terror', 'Fantasmas'], 35, NULL),
  ('rocket-league', 'Rocket League', 'Fútbol acrobático con autos propulsados por cohetes en partidos rápidos de 5 minutos.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/header.jpg', 1, 6, 'Deportes / Autos', ARRAY['Fútbol con autos', 'Rápido', 'Casual'], 15, NULL),
  ('bg3', 'Baldur''s Gate 3', 'Campaña épica de rol cooperativo basada en Dungeons & Dragons con decisiones grupales y combate táctico.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/header.jpg', 1, 4, 'RPG / Aventura', ARRAY['Rol', 'Cooperativo', 'Historia'], 120, NULL),
  ('among-us', 'Among Us', 'Deducción social, traiciones y discusiones a los gritos en Discord para lobbies de 4 a 15 jugadores.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/945360/header.jpg', 4, 15, 'Party Casual', ARRAY['Party', 'Impostor', 'Grupo Grande'], 20, NULL),
  ('golf-friends', 'Golf With Your Friends', 'Mini-golf caótico con colisiones activadas para hasta 12 amigos al mismo tiempo.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/431240/header.jpg', 2, 12, 'Party Casual', ARRAY['Casual', 'Risas', 'Grupo Grande'], 25, NULL),
  ('lol', 'League of Legends', 'El clásico MOBA 5v5 en la Grieta del Invocador o ARAMs rápidos con los pibes.', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80', 1, 5, 'MOBA', ARRAY['5v5', 'Grieta', 'ARAM'], 35, NULL),
  ('peak', 'PEAK', 'Escalada cooperativa caótica para hasta 4 amigos donde una mala agarrada tira a todo el equipo.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3527290/header.jpg', 1, 4, 'Co-op Acción', ARRAY['Co-op', 'Escalada', 'Risas'], 45, NULL),
  ('project-zomboid', 'Project Zomboid', 'Simulador definitivo de supervivencia zombie para grupos grandes: armar base, saquear y sobrevivir.', 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/108600/header.jpg', 1, 16, 'Survival Sandbox', ARRAY['Supervivencia', 'Zombies', 'Grupo Grande'], 90, NULL),
  ('valorant', 'Valorant', 'Shooter táctico 5v5 con agentes de habilidades únicas y puntería milimétrica.', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80', 1, 5, 'Shooter Táctico', ARRAY['FPS', '5v5', 'Habilidades'], 40, NULL)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 10. LEAGUE OF LEGENDS INTEGRATION (Accounts, Match-v5 Cache & Participants)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lol_accounts (
  puuid TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  game_name TEXT NOT NULL,
  tag_line TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'la2',
  regional_cluster TEXT NOT NULL DEFAULT 'americas',
  summoner_level INTEGER NOT NULL DEFAULT 0,
  profile_icon_id INTEGER NOT NULL DEFAULT 0,
  ranked_solo JSONB DEFAULT NULL,
  ranked_flex JSONB DEFAULT NULL,
  ddragon_version TEXT DEFAULT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lol_accounts_user_id ON public.lol_accounts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lol_accounts_one_primary_per_user
  ON public.lol_accounts (user_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS public.lol_matches (
  match_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  regional_cluster TEXT NOT NULL DEFAULT 'americas',
  queue_id INTEGER NOT NULL DEFAULT 0,
  game_mode TEXT NOT NULL DEFAULT '',
  game_type TEXT NOT NULL DEFAULT '',
  game_version TEXT NOT NULL DEFAULT '',
  map_id INTEGER NOT NULL DEFAULT 11,
  game_creation BIGINT NOT NULL DEFAULT 0,
  game_start_timestamp BIGINT NOT NULL DEFAULT 0,
  game_end_timestamp BIGINT DEFAULT NULL,
  game_duration INTEGER NOT NULL DEFAULT 0,
  end_of_game_result TEXT DEFAULT NULL,
  participant_puuids TEXT[] NOT NULL DEFAULT '{}',
  teams JSONB NOT NULL DEFAULT '[]'::JSONB,
  raw_match JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lol_matches_game_creation ON public.lol_matches (game_creation DESC);
CREATE INDEX IF NOT EXISTS idx_lol_matches_queue_id ON public.lol_matches (queue_id);
CREATE INDEX IF NOT EXISTS idx_lol_matches_participant_puuids_gin ON public.lol_matches USING GIN (participant_puuids);

CREATE TABLE IF NOT EXISTS public.lol_match_participants (
  match_id TEXT NOT NULL REFERENCES public.lol_matches(match_id) ON DELETE CASCADE,
  puuid TEXT NOT NULL,
  participant_id INTEGER NOT NULL DEFAULT 0,
  team_id INTEGER NOT NULL DEFAULT 100,
  riot_id_game_name TEXT NOT NULL DEFAULT '',
  riot_id_tag_line TEXT NOT NULL DEFAULT '',
  summoner_name TEXT NOT NULL DEFAULT '',
  champion_id INTEGER NOT NULL DEFAULT 0,
  champion_name TEXT NOT NULL DEFAULT '',
  champ_level INTEGER NOT NULL DEFAULT 1,
  team_position TEXT NOT NULL DEFAULT '',
  individual_position TEXT NOT NULL DEFAULT '',
  win BOOLEAN NOT NULL DEFAULT FALSE,
  game_ended_in_surrender BOOLEAN NOT NULL DEFAULT FALSE,
  game_ended_in_early_surrender BOOLEAN NOT NULL DEFAULT FALSE,
  team_early_surrendered BOOLEAN NOT NULL DEFAULT FALSE,
  outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'ff', 'remake')),
  enemy_surrendered BOOLEAN NOT NULL DEFAULT FALSE,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  kda NUMERIC(6, 2) NOT NULL DEFAULT 0,
  cs INTEGER NOT NULL DEFAULT 0,
  cs_per_min NUMERIC(5, 2) NOT NULL DEFAULT 0,
  gold_earned INTEGER NOT NULL DEFAULT 0,
  damage_to_champions INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0,
  damage_to_objectives INTEGER NOT NULL DEFAULT 0,
  damage_to_turrets INTEGER NOT NULL DEFAULT 0,
  vision_score INTEGER NOT NULL DEFAULT 0,
  kill_participation NUMERIC(5, 4) NOT NULL DEFAULT 0,
  summoner1_id INTEGER NOT NULL DEFAULT 0,
  summoner2_id INTEGER NOT NULL DEFAULT 0,
  primary_rune_id INTEGER DEFAULT NULL,
  primary_style_id INTEGER DEFAULT NULL,
  sub_style_id INTEGER DEFAULT NULL,
  items INTEGER[] NOT NULL DEFAULT '{}',
  performance_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  performance_grade TEXT NOT NULL DEFAULT 'C',
  performance_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB,
  match_rank INTEGER NOT NULL DEFAULT 5,
  is_mvp BOOLEAN NOT NULL DEFAULT FALSE,
  is_ace BOOLEAN NOT NULL DEFAULT FALSE,
  highlights TEXT[] NOT NULL DEFAULT '{}',
  raw_participant JSONB NOT NULL,
  PRIMARY KEY (match_id, puuid)
);

CREATE INDEX IF NOT EXISTS idx_lol_participants_puuid ON public.lol_match_participants (puuid);
CREATE INDEX IF NOT EXISTS idx_lol_participants_match_id ON public.lol_match_participants (match_id);
CREATE INDEX IF NOT EXISTS idx_lol_participants_perf ON public.lol_match_participants (puuid, performance_score DESC);

ALTER TABLE public.lol_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lol_match_participants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lol_accounts' AND policyname = 'Public Read Lol Accounts') THEN
    CREATE POLICY "Public Read Lol Accounts" ON public.lol_accounts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lol_accounts' AND policyname = 'Public Insert Lol Accounts') THEN
    CREATE POLICY "Public Insert Lol Accounts" ON public.lol_accounts FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lol_accounts' AND policyname = 'Public Update Lol Accounts') THEN
    CREATE POLICY "Public Update Lol Accounts" ON public.lol_accounts FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lol_accounts' AND policyname = 'Public Delete Lol Accounts') THEN
    CREATE POLICY "Public Delete Lol Accounts" ON public.lol_accounts FOR DELETE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lol_matches' AND policyname = 'Public Read Lol Matches') THEN
    CREATE POLICY "Public Read Lol Matches" ON public.lol_matches FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lol_match_participants' AND policyname = 'Public Read Lol Match Participants') THEN
    CREATE POLICY "Public Read Lol Match Participants" ON public.lol_match_participants FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lol_accounts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lol_accounts;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lol_matches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.lol_matches;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 11. LEAGUE OF LEGENDS INTERNAL SERVER SECRETS (service_role only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lol_internal_secrets (
  key_name TEXT PRIMARY KEY,
  key_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lol_internal_secrets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lol_internal_secrets'
      AND policyname = 'Deny Public Access Lol Internal Secrets'
  ) THEN
    CREATE POLICY "Deny Public Access Lol Internal Secrets"
      ON public.lol_internal_secrets
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
