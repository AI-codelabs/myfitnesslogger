
CREATE TABLE public.cronometer_web_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  client_id UUID NOT NULL,
  cronometer_email TEXT NOT NULL,
  credentials_ciphertext TEXT NOT NULL,
  session_cookies TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  last_push_at TIMESTAMPTZ,
  last_pushed_hash TEXT,
  last_pushed_targets JSONB,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronometer_web_sessions TO authenticated;
GRANT ALL ON public.cronometer_web_sessions TO service_role;

ALTER TABLE public.cronometer_web_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can view own web sessions"
  ON public.cronometer_web_sessions FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY "Coach can insert own web sessions"
  ON public.cronometer_web_sessions FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coach can update own web sessions"
  ON public.cronometer_web_sessions FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coach can delete own web sessions"
  ON public.cronometer_web_sessions FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid());

CREATE TRIGGER cronometer_web_sessions_set_updated_at
BEFORE UPDATE ON public.cronometer_web_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
