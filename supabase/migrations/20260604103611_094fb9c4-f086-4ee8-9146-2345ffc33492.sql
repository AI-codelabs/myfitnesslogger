-- 1) Protect sensitive third-party session columns from being readable via the API.
REVOKE SELECT (cookies, gwt_header, gwt_permutation) ON public.cronometer_sessions FROM authenticated, anon;
REVOKE SELECT (cookies) ON public.mfp_sessions FROM authenticated, anon;

-- 2) Restrict workout plan mutations so coaches can only modify plans they own.
-- Templates should be duplicated (existing flow) rather than edited in place by other coaches.

DROP POLICY IF EXISTS "Coaches update own plans or templates" ON public.workout_plans;
DROP POLICY IF EXISTS "Coaches delete own plans or templates" ON public.workout_plans;

CREATE POLICY "Coaches update own plans"
  ON public.workout_plans
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid());

CREATE POLICY "Coaches delete own plans"
  ON public.workout_plans
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Manage days of own plans or templates" ON public.workout_plan_days;
CREATE POLICY "Manage days of own plans"
  ON public.workout_plan_days
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_plans p
      WHERE p.id = workout_plan_days.plan_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_plans p
      WHERE p.id = workout_plan_days.plan_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND p.coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Manage exercises of own plans or templates" ON public.workout_plan_exercises;
CREATE POLICY "Manage exercises of own plans"
  ON public.workout_plan_exercises
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_plan_days d
      JOIN public.workout_plans p ON p.id = d.plan_id
      WHERE d.id = workout_plan_exercises.day_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workout_plan_days d
      JOIN public.workout_plans p ON p.id = d.plan_id
      WHERE d.id = workout_plan_exercises.day_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND p.coach_id = auth.uid()
    )
  );