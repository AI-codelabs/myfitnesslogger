ALTER TABLE public.client_workout_assignments
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS weeks INTEGER,
  ADD COLUMN IF NOT EXISTS days TEXT[];