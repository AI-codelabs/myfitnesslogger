
CREATE TABLE public.nutrition_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  gender text,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages plans for their clients"
ON public.nutrition_plans
FOR ALL
TO authenticated
USING (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id))
WITH CHECK (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Client views own nutrition plan"
ON public.nutrition_plans
FOR SELECT
TO authenticated
USING (auth.uid() = client_id);

CREATE TRIGGER nutrition_plans_set_updated_at
BEFORE UPDATE ON public.nutrition_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
