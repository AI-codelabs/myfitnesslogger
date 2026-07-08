
CREATE TABLE public.nutrition_plan_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('cut','bulk','maintain')),
  target_kcal INTEGER NOT NULL,
  protein_g INTEGER NOT NULL,
  carbs_g INTEGER NOT NULL,
  fat_g INTEGER NOT NULL,
  pdf_path TEXT,
  pdf_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_templates TO authenticated;
GRANT ALL ON public.nutrition_plan_templates TO service_role;

ALTER TABLE public.nutrition_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages own templates"
  ON public.nutrition_plan_templates FOR ALL
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

CREATE TRIGGER trg_nutrition_plan_templates_updated_at
  BEFORE UPDATE ON public.nutrition_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_nutr_tpl_coach_goal ON public.nutrition_plan_templates(coach_id, goal_type);
