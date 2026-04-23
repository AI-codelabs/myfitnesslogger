CREATE TABLE public.weekly_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  week_start date NOT NULL, -- Monday of the week the check-in covers
  submitted_at timestamptz NOT NULL DEFAULT now(),

  -- Training
  training_count text,                  -- '1x'..'6x' or 'anders'
  training_count_other text,
  intensity_rpe smallint,               -- 1..5
  progression smallint,                 -- 1..5

  -- Nutrition
  nutrition_stars smallint,             -- 1..5
  nutrition_deviations text,
  cravings text,

  -- Sleep & recovery
  sleep_cycle text,                     -- e.g. '70-80%'
  sleep_cycle_other text,
  energy smallint,                      -- 1..5
  soreness smallint,                    -- 1..5

  -- Body
  weight_kg numeric,
  measurements text,
  body_fat_pct numeric,

  -- Mental
  feeling smallint,                     -- 1..5
  structure_planning text,
  progress_feeling text,
  obstacles text,

  -- Supplements & other
  supplements_consistency smallint,     -- 1..5
  hydration smallint,                   -- 1..5
  other_notes text,

  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_start)
);

ALTER TABLE public.weekly_checkins ENABLE ROW LEVEL SECURITY;

-- Client owns their own rows
CREATE POLICY "Clients can view own check-ins"
  ON public.weekly_checkins FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Clients can insert own check-ins"
  ON public.weekly_checkins FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can update own check-ins"
  ON public.weekly_checkins FOR UPDATE
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

-- Coaches see check-ins of their clients
CREATE POLICY "Coaches can view client check-ins"
  ON public.weekly_checkins FOR SELECT
  TO authenticated
  USING (public.is_coach_of(client_id, auth.uid()));

-- Auto update updated_at
CREATE TRIGGER update_weekly_checkins_updated_at
  BEFORE UPDATE ON public.weekly_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_weekly_checkins_client_week ON public.weekly_checkins(client_id, week_start DESC);