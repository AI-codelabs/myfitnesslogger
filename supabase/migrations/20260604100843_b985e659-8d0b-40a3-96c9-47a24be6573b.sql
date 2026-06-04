
CREATE TABLE public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  weight_kg numeric(5,2) NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, logged_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;
GRANT ALL ON public.weight_logs TO service_role;

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage own weight logs"
ON public.weight_logs FOR ALL
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coaches view client weight logs"
ON public.weight_logs FOR SELECT
TO authenticated
USING (public.is_coach_of(auth.uid(), client_id));

CREATE TRIGGER update_weight_logs_updated_at
BEFORE UPDATE ON public.weight_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
