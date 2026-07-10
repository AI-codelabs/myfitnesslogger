
-- 1) Extend templates with an editable structure payload
ALTER TABLE public.nutrition_plan_templates
  ADD COLUMN IF NOT EXISTS structure jsonb;

-- 2) client_meal_plans — a coach-assigned, per-client editable plan
CREATE TABLE IF NOT EXISTS public.client_meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  template_id uuid REFERENCES public.nutrition_plan_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  goal_type text NOT NULL DEFAULT 'maintain',
  target_kcal integer NOT NULL DEFAULT 0,
  protein_g integer NOT NULL DEFAULT 0,
  carbs_g integer NOT NULL DEFAULT 0,
  fat_g integer NOT NULL DEFAULT 0,
  notes text,
  structure jsonb NOT NULL DEFAULT '{"categories":[]}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meal_plans TO authenticated;
GRANT ALL ON public.client_meal_plans TO service_role;

ALTER TABLE public.client_meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages own client meal plans"
  ON public.client_meal_plans
  FOR ALL
  TO authenticated
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Client reads own meal plans"
  ON public.client_meal_plans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE INDEX IF NOT EXISTS idx_client_meal_plans_client ON public.client_meal_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_client_meal_plans_coach ON public.client_meal_plans(coach_id);

CREATE TRIGGER update_client_meal_plans_updated_at
  BEFORE UPDATE ON public.client_meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) client_meal_selections — daily picks by the client
CREATE TABLE IF NOT EXISTS public.client_meal_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.client_meal_plans(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  category_id text NOT NULL,
  option_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, plan_id, entry_date, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_meal_selections TO authenticated;
GRANT ALL ON public.client_meal_selections TO service_role;

ALTER TABLE public.client_meal_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manages own selections"
  ON public.client_meal_selections
  FOR ALL
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coach reads client's selections"
  ON public.client_meal_selections
  FOR SELECT
  TO authenticated
  USING (public.is_coach_of(auth.uid(), client_id));

CREATE INDEX IF NOT EXISTS idx_client_meal_selections_client_date
  ON public.client_meal_selections(client_id, entry_date);

CREATE TRIGGER update_client_meal_selections_updated_at
  BEFORE UPDATE ON public.client_meal_selections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
