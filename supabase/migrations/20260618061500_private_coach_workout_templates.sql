-- Coaches can edit templates they own, while seed templates remain shared starters.
-- Seed templates are identified by is_template = true and coach_id IS NULL.
-- Coach-owned templates are private to that coach and can be edited like any
-- other coach-owned workout plan.

DROP POLICY IF EXISTS "Coaches view templates and own plans" ON public.workout_plans;
CREATE POLICY "Coaches view templates and own plans"
  ON public.workout_plans
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND (
      coach_id = auth.uid()
      OR (is_template = true AND coach_id IS NULL)
    )
  );

DROP POLICY IF EXISTS "Coaches insert own plans" ON public.workout_plans;
CREATE POLICY "Coaches insert own plans"
  ON public.workout_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role)
    AND coach_id = auth.uid()
  );

DROP POLICY IF EXISTS "Coaches update own plans" ON public.workout_plans;
CREATE POLICY "Coaches update own plans"
  ON public.workout_plans
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND coach_id = auth.uid()
  )
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role)
    AND coach_id = auth.uid()
  );

DROP POLICY IF EXISTS "Coaches delete own plans" ON public.workout_plans;
CREATE POLICY "Coaches delete own plans"
  ON public.workout_plans
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND coach_id = auth.uid()
  );

DROP POLICY IF EXISTS "View days of visible plans" ON public.workout_plan_days;
CREATE POLICY "View days of visible plans"
  ON public.workout_plan_days
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_plans p
      WHERE p.id = workout_plan_days.plan_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND (
          p.coach_id = auth.uid()
          OR (p.is_template = true AND p.coach_id IS NULL)
        )
    )
  );

DROP POLICY IF EXISTS "Manage days of own plans" ON public.workout_plan_days;
CREATE POLICY "Manage days of own plans"
  ON public.workout_plan_days
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_plans p
      WHERE p.id = workout_plan_days.plan_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workout_plans p
      WHERE p.id = workout_plan_days.plan_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND p.coach_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "View exercises of visible plans" ON public.workout_plan_exercises;
CREATE POLICY "View exercises of visible plans"
  ON public.workout_plan_exercises
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workout_plan_days d
      JOIN public.workout_plans p ON p.id = d.plan_id
      WHERE d.id = workout_plan_exercises.day_id
        AND has_role(auth.uid(), 'coach'::app_role)
        AND (
          p.coach_id = auth.uid()
          OR (p.is_template = true AND p.coach_id IS NULL)
        )
    )
  );

DROP POLICY IF EXISTS "Manage exercises of own plans" ON public.workout_plan_exercises;
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
