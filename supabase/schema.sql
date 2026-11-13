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
  karma_score INTEGER NOT NULL DEFAULT 80 CHECK (karma_score >= 0 AND karma_score <= 100),
  sessions_played INTEGER NOT NULL DEFAULT 0 CHECK (sessions_played >= 0),
  hours_played NUMERIC(6, 2) NOT NULL DEFAULT 0 CHECK (hours_played >= 0),
  on_time_count INTEGER NOT NULL DEFAULT 0 CHECK (on_time_count >= 0),
  late_count INTEGER NOT NULL DEFAULT 0 CHECK (late_count >= 0),
  no_show_count INTEGER NOT NULL DEFAULT 0 CHECK (no_show_count >= 0),
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  active_title TEXT NOT NULL DEFAULT 'Puntual en Práctica',
  push_subscription JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. GAMES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
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
-- 4. GAMING SESSIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('fixed', 'random')),
  selected_game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  roulette_winner_game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'finished')) DEFAULT 'open',
  allow_split_lobbies BOOLEAN NOT NULL DEFAULT FALSE,
  discord_message_id TEXT,
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
    "checkin_update": true
  }'::JSONB,
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
CREATE INDEX IF NOT EXISTS idx_sessions_selected_game_id ON sessions(selected_game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_roulette_winner_id ON sessions(roulette_winner_game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON session_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter_id ON attendance_votes(voter_id);
CREATE INDEX IF NOT EXISTS idx_votes_target_user_id ON attendance_votes(target_user_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_user_id ON sanctions(user_id);
CREATE INDEX IF NOT EXISTS idx_sanctions_session_id ON sanctions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_reply_to_id ON chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_chat_linked_session_id ON chat_messages(linked_session_id);

DROP TRIGGER IF EXISTS trg_apply_sanction_karma ON sanctions;
CREATE TRIGGER trg_apply_sanction_karma
AFTER INSERT ON sanctions
FOR EACH ROW
EXECUTE FUNCTION apply_sanction_karma_delta();

-- ------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_game_preferences ENABLE ROW LEVEL SECURITY;
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
    "checkin_update": true
  }'::JSONB
) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- INITIAL SEED: POPULAR GAMES
-- ------------------------------------------------------------------------------
INSERT INTO games (id, name, cover_url, min_players, max_players, category, tags, average_duration_mins)
VALUES
  ('cs2', 'Counter-Strike 2', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80', 2, 5, 'Tactical Shooter', ARRAY['Competitivo', 'FPS', 'Clásico'], 45),
  ('aoe2', 'Age of Empires II: DE', 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80', 2, 8, 'RTS', ARRAY['Estrategia', 'Clásico', 'Larga Duración'], 90),
  ('helldivers2', 'Helldivers 2', 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80', 1, 4, 'Co-op Shooter', ARRAY['Cooperativo', 'Acción', 'Democracia'], 40),
  ('lethal-company', 'Lethal Company', 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80', 2, 4, 'Survival Horror', ARRAY['Risas', 'Cooperativo', 'Terror'], 30),
  ('dota2', 'Dota 2', 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80', 2, 5, 'MOBA', ARRAY['Competitivo', 'Estrategia', 'Tóxico'], 50),
  ('phasmophobia', 'Phasmophobia', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80', 1, 4, 'Psychological Horror', ARRAY['Cooperativo', 'Terror', 'Fantasmas'], 35),
  ('rocket-league', 'Rocket League', 'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80', 1, 6, 'Sports / Action', ARRAY['Fútbol con autos', 'Rápido', 'Casual'], 15),
  ('bg3', 'Baldur''s Gate 3', 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&auto=format&fit=crop&q=80', 1, 4, 'CRPG', ARRAY['Rol', 'Cooperativo', 'Historia'], 120)
ON CONFLICT (id) DO NOTHING;
