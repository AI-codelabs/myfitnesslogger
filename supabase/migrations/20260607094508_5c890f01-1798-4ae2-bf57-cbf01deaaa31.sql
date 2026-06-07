CREATE TABLE IF NOT EXISTS public.internal_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lock the table down: only service_role may read/write directly.
GRANT ALL ON public.internal_secrets TO service_role;
ALTER TABLE public.internal_secrets ENABLE ROW LEVEL SECURITY;
-- No policies: PostgREST cannot read this table at all from anon/authenticated.

-- Seed cron token if missing.
INSERT INTO public.internal_secrets (name, value)
VALUES ('cron_token', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- Security-definer accessor used ONLY by the scheduled cron SQL (not exposed to PostgREST).
CREATE OR REPLACE FUNCTION public.get_internal_secret(_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.internal_secrets WHERE name = _name LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_secret(text) TO postgres, service_role;

-- Ensure scheduler extensions are available.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;