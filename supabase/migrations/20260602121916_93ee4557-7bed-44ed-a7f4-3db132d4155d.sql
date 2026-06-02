ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS speed_kmh numeric,
  ADD COLUMN IF NOT EXISTS incline_pct numeric;