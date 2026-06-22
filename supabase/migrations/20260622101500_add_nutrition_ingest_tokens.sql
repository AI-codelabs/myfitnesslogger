-- Source-agnostic nutrition ingest support.
-- Existing dashboards continue to read cronometer_nutrition_logs; these columns
-- add provenance for rows created by Apple Health Shortcuts or future sources.
ALTER TABLE public.cronometer_nutrition_logs
  ADD COLUMN IF NOT EXISTS source_detail text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

CREATE TABLE IF NOT EXISTS public.nutrition_ingest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'apple_health_shortcut',
  label text NOT NULL DEFAULT 'Apple Health Shortcut',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_ingest_tokens_client
  ON public.nutrition_ingest_tokens(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_ingest_tokens_active_hash
  ON public.nutrition_ingest_tokens(token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.nutrition_ingest_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manages own nutrition ingest tokens"
  ON public.nutrition_ingest_tokens FOR ALL
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE TRIGGER nutrition_ingest_tokens_set_updated_at
BEFORE UPDATE ON public.nutrition_ingest_tokens
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
