
CREATE TABLE public.cronometer_api_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT,
  endpoint TEXT NOT NULL,
  request_body JSONB,
  response_status INT,
  response_body JSONB,
  response_text TEXT,
  error TEXT,
  duration_ms INT,
  coach_id UUID,
  client_id UUID,
  cronometer_client_id BIGINT
);

CREATE INDEX cronometer_api_logs_created_at_idx ON public.cronometer_api_logs (created_at DESC);
CREATE INDEX cronometer_api_logs_endpoint_idx ON public.cronometer_api_logs (endpoint);

GRANT SELECT ON public.cronometer_api_logs TO authenticated;
GRANT ALL ON public.cronometer_api_logs TO service_role;

ALTER TABLE public.cronometer_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can read cronometer api logs"
ON public.cronometer_api_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'coach'));
