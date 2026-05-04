
ALTER TABLE public.cronometer_sessions
  ADD COLUMN IF NOT EXISTS target_sync_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cronometer_target_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  coach_id uuid,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  success boolean NOT NULL DEFAULT false,
  error text,
  pushed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cronometer_target_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client views own target pushes"
  ON public.cronometer_target_pushes FOR SELECT
  TO authenticated USING (auth.uid() = client_id);

CREATE POLICY "Coach views client target pushes"
  ON public.cronometer_target_pushes FOR SELECT
  TO authenticated USING (public.is_coach_of(auth.uid(), client_id));

CREATE INDEX IF NOT EXISTS idx_cron_target_pushes_client ON public.cronometer_target_pushes(client_id, pushed_at DESC);
