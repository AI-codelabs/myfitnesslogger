CREATE TABLE public.client_workout_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  client_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_workout_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages assignments for their clients"
ON public.client_workout_assignments
FOR ALL
TO authenticated
USING (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id))
WITH CHECK (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Client views own assignments"
ON public.client_workout_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = client_id);

CREATE INDEX idx_cwa_client ON public.client_workout_assignments(client_id);
CREATE INDEX idx_cwa_coach ON public.client_workout_assignments(coach_id);

CREATE TRIGGER trg_cwa_updated_at
BEFORE UPDATE ON public.client_workout_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();