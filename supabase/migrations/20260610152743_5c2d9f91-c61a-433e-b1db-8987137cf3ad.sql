-- 1. Add first/last name columns to profiles (email-as-identifier replacement)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Backfill profiles.first_name / last_name from onboarding_responses.full_name
UPDATE public.profiles p
SET first_name = TRIM(SPLIT_PART(o.full_name, ' ', 1)),
    last_name  = NULLIF(TRIM(REGEXP_REPLACE(o.full_name, '^\S+\s*', '')), '')
FROM public.onboarding_responses o
WHERE o.user_id = p.user_id
  AND o.full_name IS NOT NULL
  AND o.full_name <> ''
  AND (p.first_name IS NULL OR p.first_name = '');

-- 2. Enums for goal system
DO $$ BEGIN
  CREATE TYPE public.goal_type AS ENUM ('cut','bulk','maintain','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.activity_level AS ENUM ('sedentary','light','moderate','active','very_active');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. client_goals table (full history, one active per client)
CREATE TABLE IF NOT EXISTS public.client_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type public.goal_type NOT NULL,
  goal_label text,
  goal_weight_kg numeric,
  starting_weight_kg numeric,
  target_date date,
  maintenance_calories integer,
  activity_level public.activity_level,
  weekly_drift_tolerance_kg numeric DEFAULT 0.3,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_goals TO authenticated;
GRANT ALL ON public.client_goals TO service_role;

ALTER TABLE public.client_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients view own goals" ON public.client_goals
  FOR SELECT TO authenticated USING (auth.uid() = client_id);

CREATE POLICY "Coaches view client goals" ON public.client_goals
  FOR SELECT TO authenticated USING (public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Clients insert own goals" ON public.client_goals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coaches insert client goals" ON public.client_goals
  FOR INSERT TO authenticated WITH CHECK (public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Clients update own goals" ON public.client_goals
  FOR UPDATE TO authenticated USING (auth.uid() = client_id);

CREATE POLICY "Coaches update client goals" ON public.client_goals
  FOR UPDATE TO authenticated USING (public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Coaches delete client goals" ON public.client_goals
  FOR DELETE TO authenticated USING (public.is_coach_of(auth.uid(), client_id));

CREATE INDEX IF NOT EXISTS idx_client_goals_client_active
  ON public.client_goals(client_id, is_active DESC, created_at DESC);

DROP TRIGGER IF EXISTS set_client_goals_updated_at ON public.client_goals;
CREATE TRIGGER set_client_goals_updated_at
  BEFORE UPDATE ON public.client_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Trigger: only one active goal per client
CREATE OR REPLACE FUNCTION public.enforce_single_active_goal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.client_goals
    SET is_active = false
    WHERE client_id = NEW.client_id
      AND id <> NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_active_goal ON public.client_goals;
CREATE TRIGGER trg_enforce_single_active_goal
  AFTER INSERT OR UPDATE OF is_active ON public.client_goals
  FOR EACH ROW WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.enforce_single_active_goal();

-- 5. Backfill one initial active goal per onboarded client
INSERT INTO public.client_goals
  (client_id, goal_type, goal_label, starting_weight_kg, notes, is_active, created_at)
SELECT
  o.user_id,
  CASE
    WHEN o.primary_goal = 'cut' THEN 'cut'::public.goal_type
    WHEN o.primary_goal = 'muscle' THEN 'bulk'::public.goal_type
    WHEN o.primary_goal = 'energy' THEN 'maintain'::public.goal_type
    ELSE 'custom'::public.goal_type
  END,
  o.primary_goal,
  o.weight_kg,
  o.target_outcome,
  true,
  COALESCE(o.completed_at, o.created_at)
FROM public.onboarding_responses o
WHERE o.completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_goals cg WHERE cg.client_id = o.user_id
  );

-- 6. Helper: active goal for a client (security definer so edge functions / RLS share logic)
CREATE OR REPLACE FUNCTION public.get_active_client_goal(_client_id uuid)
RETURNS public.client_goals
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.client_goals
  WHERE client_id = _client_id
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1
$$;