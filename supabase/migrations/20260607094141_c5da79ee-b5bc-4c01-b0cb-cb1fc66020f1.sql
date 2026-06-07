ALTER TABLE public.cronometer_sessions
  ADD COLUMN IF NOT EXISTS tz text NOT NULL DEFAULT 'Europe/Amsterdam';