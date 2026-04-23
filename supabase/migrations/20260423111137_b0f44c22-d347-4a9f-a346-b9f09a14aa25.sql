-- Cronometer per-client session storage
CREATE TABLE public.cronometer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE,
  cronometer_username text,
  cookies jsonb NOT NULL,
  user_id_external text NOT NULL,
  gwt_permutation text NOT NULL,
  gwt_header text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cronometer_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manages own cronometer session"
ON public.cronometer_sessions FOR ALL
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coach views client cronometer session"
ON public.cronometer_sessions FOR SELECT
TO authenticated
USING (public.is_coach_of(auth.uid(), client_id));

CREATE TRIGGER cronometer_sessions_set_updated_at
BEFORE UPDATE ON public.cronometer_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Daily nutrition logs (one row per client per day)
CREATE TABLE public.cronometer_nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  log_date date NOT NULL,
  calories numeric NOT NULL DEFAULT 0,
  protein_g numeric NOT NULL DEFAULT 0,
  carbs_g numeric NOT NULL DEFAULT 0,
  fat_g numeric NOT NULL DEFAULT 0,
  fiber_g numeric NOT NULL DEFAULT 0,
  sugar_g numeric NOT NULL DEFAULT 0,
  sodium_mg numeric NOT NULL DEFAULT 0,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'cronometer',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, log_date)
);

CREATE INDEX idx_cronometer_logs_client_date ON public.cronometer_nutrition_logs (client_id, log_date DESC);

ALTER TABLE public.cronometer_nutrition_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manages own nutrition logs"
ON public.cronometer_nutrition_logs FOR ALL
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coach views client nutrition logs"
ON public.cronometer_nutrition_logs FOR SELECT
TO authenticated
USING (public.is_coach_of(auth.uid(), client_id));

CREATE TRIGGER cronometer_logs_set_updated_at
BEFORE UPDATE ON public.cronometer_nutrition_logs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();