-- Table to store each coach's connected Gmail account
CREATE TABLE public.coach_email_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  scope TEXT,
  connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_email_connections ENABLE ROW LEVEL SECURITY;

-- Coaches can view their own connection (to display "Connected as foo@gmail.com")
CREATE POLICY "Coaches can view their own email connection"
ON public.coach_email_connections
FOR SELECT
TO authenticated
USING (auth.uid() = coach_id);

-- Coaches can delete (disconnect) their own connection
CREATE POLICY "Coaches can delete their own email connection"
ON public.coach_email_connections
FOR DELETE
TO authenticated
USING (auth.uid() = coach_id);

-- INSERT/UPDATE only via edge functions (service role) — no policies for authenticated users
-- This prevents clients from writing tokens directly.

-- Auto-update updated_at
CREATE TRIGGER update_coach_email_connections_updated_at
BEFORE UPDATE ON public.coach_email_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Temporary table to hold OAuth state values (CSRF protection) for ~10 min
CREATE TABLE public.oauth_states (
  state TEXT NOT NULL PRIMARY KEY,
  coach_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies — only service role accesses this table