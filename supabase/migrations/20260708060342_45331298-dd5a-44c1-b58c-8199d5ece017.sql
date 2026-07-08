-- 1. Drop legacy tables
DROP TABLE IF EXISTS public.cronometer_sessions CASCADE;
DROP TABLE IF EXISTS public.nutrition_ingest_tokens CASCADE;

-- 2. Add source column to cronometer_nutrition_logs
ALTER TABLE public.cronometer_nutrition_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'api';

-- 3. Create cronometer_clients
CREATE TABLE public.cronometer_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  cronometer_client_id bigint,
  email text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','revoked','error')),
  last_error text,
  invited_at timestamptz NOT NULL DEFAULT now(),
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_synced_day date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

CREATE INDEX idx_cronometer_clients_coach ON public.cronometer_clients(coach_id);
CREATE INDEX idx_cronometer_clients_client ON public.cronometer_clients(client_id);
CREATE INDEX idx_cronometer_clients_status ON public.cronometer_clients(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronometer_clients TO authenticated;
GRANT ALL ON public.cronometer_clients TO service_role;

ALTER TABLE public.cronometer_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage their cronometer clients"
  ON public.cronometer_clients
  FOR ALL
  TO authenticated
  USING (public.is_coach_of(auth.uid(), client_id) OR auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Clients can view their own cronometer link"
  ON public.cronometer_clients
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE TRIGGER trg_cronometer_clients_updated_at
  BEFORE UPDATE ON public.cronometer_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
