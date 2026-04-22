
-- Allow assigned clients to view their workout plan
CREATE POLICY "Assigned clients view plan"
ON public.workout_plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_workout_assignments a
    WHERE a.plan_id = workout_plans.id
      AND a.client_id = auth.uid()
  )
);

-- Allow assigned clients to view days of their plan
CREATE POLICY "Assigned clients view plan days"
ON public.workout_plan_days
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_workout_assignments a
    WHERE a.plan_id = workout_plan_days.plan_id
      AND a.client_id = auth.uid()
  )
);

-- Allow assigned clients to view exercises of their plan days
CREATE POLICY "Assigned clients view plan exercises"
ON public.workout_plan_exercises
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workout_plan_days d
    JOIN public.client_workout_assignments a ON a.plan_id = d.plan_id
    WHERE d.id = workout_plan_exercises.day_id
      AND a.client_id = auth.uid()
  )
);
