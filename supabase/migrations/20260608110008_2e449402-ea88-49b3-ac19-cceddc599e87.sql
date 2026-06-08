
CREATE TABLE public.workout_schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  assignment_id uuid REFERENCES public.client_workout_assignments(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('move','copy','delete')),
  original_date date,
  scheduled_date date,
  occurrence_index integer,
  source_override_id uuid REFERENCES public.workout_schedule_overrides(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wso_client ON public.workout_schedule_overrides(client_id);
CREATE INDEX idx_wso_assignment ON public.workout_schedule_overrides(assignment_id);
CREATE INDEX idx_wso_scheduled_date ON public.workout_schedule_overrides(scheduled_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_schedule_overrides TO authenticated;
GRANT ALL ON public.workout_schedule_overrides TO service_role;

ALTER TABLE public.workout_schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own overrides"
  ON public.workout_schedule_overrides FOR SELECT
  TO authenticated
  USING (client_id = auth.uid() OR public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Clients and coaches can insert overrides"
  ON public.workout_schedule_overrides FOR INSERT
  TO authenticated
  WITH CHECK (client_id = auth.uid() OR public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Clients and coaches can update overrides"
  ON public.workout_schedule_overrides FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid() OR public.is_coach_of(auth.uid(), client_id))
  WITH CHECK (client_id = auth.uid() OR public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Clients and coaches can delete overrides"
  ON public.workout_schedule_overrides FOR DELETE
  TO authenticated
  USING (client_id = auth.uid() OR public.is_coach_of(auth.uid(), client_id));

CREATE TRIGGER trg_wso_updated_at
  BEFORE UPDATE ON public.workout_schedule_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
