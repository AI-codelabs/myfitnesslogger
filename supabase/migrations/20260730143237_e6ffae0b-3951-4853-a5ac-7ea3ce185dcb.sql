ALTER TABLE public.cronometer_clients
  ADD COLUMN IF NOT EXISTS last_pushed_hash text,
  ADD COLUMN IF NOT EXISTS last_pushed_targets jsonb,
  ADD COLUMN IF NOT EXISTS last_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_push_error text;