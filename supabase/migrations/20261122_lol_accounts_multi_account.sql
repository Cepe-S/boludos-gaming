-- Multi-account support for League of Legends (1 primary + N secondary accounts per user)
ALTER TABLE public.lol_accounts
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.lol_accounts
  DROP CONSTRAINT IF EXISTS lol_accounts_pkey;

ALTER TABLE public.lol_accounts
  ADD CONSTRAINT lol_accounts_pkey PRIMARY KEY (puuid);

DROP INDEX IF EXISTS public.idx_lol_accounts_puuid;

CREATE INDEX IF NOT EXISTS idx_lol_accounts_user_id
  ON public.lol_accounts (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lol_accounts_one_primary_per_user
  ON public.lol_accounts (user_id)
  WHERE is_primary = TRUE;
