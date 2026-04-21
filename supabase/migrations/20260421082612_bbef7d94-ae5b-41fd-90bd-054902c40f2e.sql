
CREATE TABLE public.workout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  day_id uuid,
  scheduled_date date,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manages own sessions"
  ON public.workout_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coach views client sessions"
  ON public.workout_sessions FOR SELECT
  TO authenticated
  USING (public.is_coach_of(auth.uid(), client_id));

CREATE TRIGGER workout_sessions_updated_at
  BEFORE UPDATE ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_workout_sessions_client ON public.workout_sessions(client_id, scheduled_date);

CREATE TABLE public.workout_set_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  plan_exercise_id uuid NOT NULL,
  set_number integer NOT NULL,
  reps integer,
  weight_kg numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_set_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manages own set logs"
  ON public.workout_set_logs FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.client_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.client_id = auth.uid()));

CREATE POLICY "Coach views client set logs"
  ON public.workout_set_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND public.is_coach_of(auth.uid(), s.client_id)));

CREATE TRIGGER workout_set_logs_updated_at
  BEFORE UPDATE ON public.workout_set_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_workout_set_logs_session ON public.workout_set_logs(session_id);
