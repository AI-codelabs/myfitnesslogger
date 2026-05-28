ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS exercise_type text NOT NULL DEFAULT 'strength';

ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS distance_m integer,
  ADD COLUMN IF NOT EXISTS intensity text;
