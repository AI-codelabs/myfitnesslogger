
-- ============================================================
-- EXERCISES
-- ============================================================
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  muscle_group text,
  equipment text,
  is_pro boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view exercises"
  ON public.exercises FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coaches can insert exercises"
  ON public.exercises FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Coaches can update exercises"
  ON public.exercises FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Coaches can delete exercises"
  ON public.exercises FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

CREATE TRIGGER trg_exercises_updated_at
  BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- WORKOUT PLANS
-- ============================================================
CREATE TABLE public.workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid,
  name text NOT NULL,
  description text,
  category text,
  frequency_per_week int,
  is_template boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches view templates and own plans"
  ON public.workout_plans FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'coach')
    AND (is_template = true OR coach_id = auth.uid())
  );

CREATE POLICY "Coaches insert own plans"
  ON public.workout_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coach')
    AND coach_id = auth.uid()
    AND is_template = false
  );

CREATE POLICY "Coaches update own plans"
  ON public.workout_plans FOR UPDATE TO authenticated
  USING (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'));

CREATE POLICY "Coaches delete own plans"
  ON public.workout_plans FOR DELETE TO authenticated
  USING (coach_id = auth.uid() AND public.has_role(auth.uid(), 'coach'));

CREATE TRIGGER trg_workout_plans_updated_at
  BEFORE UPDATE ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PLAN DAYS
-- ============================================================
CREATE TABLE public.workout_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  day_index int NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, day_index)
);

CREATE INDEX idx_workout_plan_days_plan ON public.workout_plan_days(plan_id);
ALTER TABLE public.workout_plan_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View days of visible plans"
  ON public.workout_plan_days FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workout_plans p
    WHERE p.id = plan_id
      AND public.has_role(auth.uid(), 'coach')
      AND (p.is_template = true OR p.coach_id = auth.uid())
  ));

CREATE POLICY "Manage days of own plans"
  ON public.workout_plan_days FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workout_plans p
    WHERE p.id = plan_id AND p.coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_plans p
    WHERE p.id = plan_id AND p.coach_id = auth.uid()
  ));

-- ============================================================
-- PLAN EXERCISES
-- ============================================================
CREATE TABLE public.workout_plan_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id uuid NOT NULL REFERENCES public.workout_plan_days(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  order_index int NOT NULL,
  sets_reps text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpe_day ON public.workout_plan_exercises(day_id);
ALTER TABLE public.workout_plan_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View exercises of visible plans"
  ON public.workout_plan_exercises FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.workout_plan_days d
    JOIN public.workout_plans p ON p.id = d.plan_id
    WHERE d.id = day_id
      AND public.has_role(auth.uid(), 'coach')
      AND (p.is_template = true OR p.coach_id = auth.uid())
  ));

CREATE POLICY "Manage exercises of own plans"
  ON public.workout_plan_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.workout_plan_days d
    JOIN public.workout_plans p ON p.id = d.plan_id
    WHERE d.id = day_id AND p.coach_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM public.workout_plan_days d
    JOIN public.workout_plans p ON p.id = d.plan_id
    WHERE d.id = day_id AND p.coach_id = auth.uid()
  ));

-- ============================================================
-- SEED EXERCISE LIBRARY
-- ============================================================
INSERT INTO public.exercises (name, muscle_group, equipment, is_pro) VALUES
  ('Seated chest press', 'chest', 'machine', false),
  ('Bench press - Smith machine', 'chest', 'smith', false),
  ('Bench press inclined - Smith machine', 'chest', 'smith', false),
  ('Bench press inclined neutral grip', 'chest', 'smith', false),
  ('Bench press - DBs', 'chest', 'dumbbell', false),
  ('Schuin bankdrukken - DBs', 'chest', 'dumbbell', false),
  ('Chest press incline', 'chest', 'machine', false),
  ('Pectoral fly machine', 'chest', 'machine', false),
  ('Crossover - Pulley', 'chest', 'cable', false),
  ('Fly zittend - Pulley', 'chest', 'cable', false),
  ('Dips - PB', 'chest', 'bodyweight', false),
  ('Lat pull down brede grip', 'back', 'machine', false),
  ('Lat pulldown narrow grip', 'back', 'machine', false),
  ('Upper back pull down', 'back', 'machine', false),
  ('Row - Pulley machine', 'back', 'cable', false),
  ('Bent-over row staand - Barbell', 'back', 'barbell', false),
  ('Horizontal row machine 2', 'back', 'machine', false),
  ('Horizontal row machine 3', 'back', 'machine', false),
  ('Horizontal row, rechts - Plateloaded', 'back', 'machine', false),
  ('Horizontal row, links - Plateloaded', 'back', 'machine', false),
  ('High Row Machine', 'back', 'machine', false),
  ('High to low cable row', 'back', 'cable', false),
  ('Pullover - Pulley', 'back', 'cable', false),
  ('Reverse fly staand - Pulley', 'back', 'cable', false),
  ('Reverse pectoral fly machine', 'back', 'machine', false),
  ('Shrugs staand - Barbell', 'back', 'barbell', false),
  ('Cable face pulls', 'back', 'cable', false),
  ('Hyperextension laag', 'back', 'bodyweight', false),
  ('Shoulder press - DBs', 'shoulders', 'dumbbell', false),
  ('Shoulder press zittend - DBs', 'shoulders', 'dumbbell', false),
  ('Shoulder press machine', 'shoulders', 'machine', false),
  ('Shoulder press - Smith machine', 'shoulders', 'smith', true),
  ('Side raise zittend - DBs', 'shoulders', 'dumbbell', false),
  ('Lateral raise standing - DBs', 'shoulders', 'dumbbell', false),
  ('Cuffed Side Raises', 'shoulders', 'cable', false),
  ('Incline Cable Curl', 'biceps', 'cable', false),
  ('Biceps curl staand - Pulley', 'biceps', 'cable', false),
  ('Preacher Hammer Curl', 'biceps', 'dumbbell', false),
  ('Preacher curl machine', 'biceps', 'machine', false),
  ('Hammer curl two sides - DBs', 'biceps', 'dumbbell', false),
  ('Hammer curl - Pulley', 'biceps', 'cable', true),
  ('Triceps pushdown - Pulley', 'triceps', 'cable', false),
  ('Overhead triceps extension', 'triceps', 'cable', false),
  ('Crossed triceps extension - Pulley', 'triceps', 'cable', true),
  ('Katana extension', 'triceps', 'cable', false),
  ('Triceps extension lying - Barbell', 'triceps', 'barbell', false),
  ('Lying overhead triceps extension', 'triceps', 'dumbbell', false),
  ('Triceps extension lying - DBs', 'triceps', 'dumbbell', false),
  ('45 Degree leg press', 'legs', 'machine', false),
  ('Hack squat machine', 'legs', 'machine', true),
  ('Hack squat - Plateloaded', 'legs', 'machine', true),
  ('Squat - Smith machine', 'legs', 'smith', false),
  ('Stiff legged deadlift - Barbell', 'legs', 'barbell', true),
  ('Smith Machine Hip Thrust', 'glutes', 'smith', false),
  ('Lunge, om en om - Barbell', 'legs', 'barbell', false),
  ('Lunge walk - DBs', 'legs', 'dumbbell', false),
  ('Bulgarian split squat, right - DBs', 'legs', 'dumbbell', false),
  ('Bulgarian split squat, left - DBs', 'legs', 'dumbbell', false),
  ('Step up hoog, links - DBs, Box', 'legs', 'dumbbell', false),
  ('Step up hoog, rechts - DBs, Box', 'legs', 'dumbbell', false),
  ('Seated leg extension', 'legs', 'machine', false),
  ('Leg curl zittend', 'legs', 'machine', false),
  ('Leg curl 2', 'legs', 'machine', false),
  ('Lying leg curl machine', 'legs', 'machine', false),
  ('Abductie - Machine', 'glutes', 'machine', false),
  ('Adductie - Machine', 'legs', 'machine', false),
  ('Glute kickback, rechts - Pulley', 'glutes', 'cable', false),
  ('Glute kickback, links - Pulley', 'glutes', 'cable', false),
  ('Standing calf raise machine', 'calves', 'machine', true),
  ('Calf raise - Plateloaded', 'calves', 'machine', true),
  ('Calf raise - Smith machine', 'calves', 'smith', true),
  ('Calf raise incline leg press', 'calves', 'machine', true),
  ('Calf raise machine seated', 'calves', 'machine', false),
  ('Abdominal crunch machine', 'core', 'machine', false),
  ('Omgekeerde crunch liggend', 'core', 'bodyweight', false),
  ('Ab wheel rollout', 'core', 'bodyweight', false),
  ('Hanging leg raise - Rig', 'core', 'bodyweight', true),
  ('Loopband, duur', 'cardio', 'cardio', false);

-- ============================================================
-- SEED PLAN HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public._seed_plan(
  _name text, _desc text, _category text, _freq int, _days jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pid uuid;
  did uuid;
  d jsonb;
  e jsonb;
  d_idx int;
  e_idx int;
  ex_id uuid;
BEGIN
  INSERT INTO public.workout_plans (coach_id, name, description, category, frequency_per_week, is_template)
  VALUES (NULL, _name, _desc, _category, _freq, true)
  RETURNING id INTO pid;

  d_idx := 0;
  FOR d IN SELECT * FROM jsonb_array_elements(_days)
  LOOP
    INSERT INTO public.workout_plan_days (plan_id, day_index, name)
    VALUES (pid, d_idx, d->>'name')
    RETURNING id INTO did;

    e_idx := 0;
    FOR e IN SELECT * FROM jsonb_array_elements(d->'exercises')
    LOOP
      SELECT id INTO ex_id FROM public.exercises WHERE name = e->>'name';
      IF ex_id IS NOT NULL THEN
        INSERT INTO public.workout_plan_exercises (day_id, exercise_id, order_index, sets_reps)
        VALUES (did, ex_id, e_idx, e->>'sets_reps');
      END IF;
      e_idx := e_idx + 1;
    END LOOP;
    d_idx := d_idx + 1;
  END LOOP;
END $$;

SELECT public._seed_plan('Full body 3-daags 1.0', 'Full body schema, 3 trainingen per week', 'full_body', 3, '[
  {"name":"Dag 1","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"45 Degree leg press","sets_reps":"8x 10x 10x"},
    {"name":"Calf raise incline leg press","sets_reps":"12x 12x 12x"},
    {"name":"Row - Pulley machine","sets_reps":"8x 10x"},
    {"name":"Shoulder press - DBs","sets_reps":"8x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"12x 12x 12x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Dag 2","exercises":[
    {"name":"Lat pull down brede grip","sets_reps":"8x 10x"},
    {"name":"Schuin bankdrukken - DBs","sets_reps":"8x 10x"},
    {"name":"Leg curl zittend","sets_reps":"10x 10x 10x"},
    {"name":"Reverse fly staand - Pulley","sets_reps":"10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Dag 3","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"Bent-over row staand - Barbell","sets_reps":"8x 10x"},
    {"name":"Lunge, om en om - Barbell","sets_reps":"10x 10x 10x"},
    {"name":"Crossover - Pulley","sets_reps":"12x 12x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Lying leg curl machine","sets_reps":"10x 10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"12x 12x 12x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Full body 3-daags 2.0', 'Full body schema 2.0, 3 trainingen per week', 'full_body', 3, '[
  {"name":"Dag 1","exercises":[
    {"name":"Seated chest press","sets_reps":"10x 10x 10x"},
    {"name":"45 Degree leg press","sets_reps":"10x 10x 10x"},
    {"name":"Row - Pulley machine","sets_reps":"10x 10x"},
    {"name":"Shoulder press - DBs","sets_reps":"10x 10x"},
    {"name":"Triceps pushdown - Pulley","sets_reps":"10x 10x 10x"},
    {"name":"Standing calf raise machine","sets_reps":"10x 10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"12x 12x 12x"}
  ]},
  {"name":"Dag 2","exercises":[
    {"name":"Lat pull down brede grip","sets_reps":"10x 10x 10x"},
    {"name":"Bench press inclined - Smith machine","sets_reps":"10x 10x"},
    {"name":"Shrugs staand - Barbell","sets_reps":"10x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"10x 10x"},
    {"name":"Side raise zittend - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Katana extension","sets_reps":"10x 10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"}
  ]},
  {"name":"Dag 3","exercises":[
    {"name":"Horizontal row machine 3","sets_reps":"10x 10x 10x"},
    {"name":"Lunge, om en om - Barbell","sets_reps":"10x 10x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Dips - PB","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Triceps extension lying - Barbell","sets_reps":"10x 10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"12x 12x 12x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Upper Lower Upper 3-daags', 'Upper / Lower / Upper split, 3 trainingen per week', 'upper_lower', 3, '[
  {"name":"Upper 1","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x 10x"},
    {"name":"Schuin bankdrukken - DBs","sets_reps":"8x 10x"},
    {"name":"Lat pull down brede grip","sets_reps":"10x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"8x 10x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x"},
    {"name":"Row - Pulley machine","sets_reps":"8x 8x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Lower","exercises":[
    {"name":"45 Degree leg press","sets_reps":"8x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"8x 10x"},
    {"name":"Leg curl zittend","sets_reps":"10x 10x"},
    {"name":"Abductie - Machine","sets_reps":"10x 10x"},
    {"name":"Standing calf raise machine","sets_reps":"12x 12x 12x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"10x 10x"}
  ]},
  {"name":"Upper 2","exercises":[
    {"name":"Schuin bankdrukken - DBs","sets_reps":"8x 10x 10x"},
    {"name":"Bent-over row staand - Barbell","sets_reps":"8x 10x"},
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x 12x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Lat pulldown narrow grip","sets_reps":"10x 10x"},
    {"name":"Biceps curl staand - Pulley","sets_reps":"10x 10x 10x"},
    {"name":"Pullover - Pulley","sets_reps":"10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Upper Lower 1.0 (4-daags)', 'Upper / Lower split, 4 trainingen per week', 'upper_lower', 4, '[
  {"name":"Upper A","exercises":[
    {"name":"Schuin bankdrukken - DBs","sets_reps":"8x 10x"},
    {"name":"Pullover - Pulley","sets_reps":"10x 10x"},
    {"name":"Dips - PB","sets_reps":"10x 10x"},
    {"name":"Bent-over row staand - Barbell","sets_reps":"8x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x 12x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Cable face pulls","sets_reps":"12x 12x"},
    {"name":"Preacher curl machine","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Lower A","exercises":[
    {"name":"45 Degree leg press","sets_reps":"8x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"8x 10x"},
    {"name":"Abductie - Machine","sets_reps":"12x 12x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Standing calf raise machine","sets_reps":"12x 12x 12x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Upper B","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"Lat pulldown narrow grip","sets_reps":"8x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"Horizontal row machine 2","sets_reps":"8x 10x"},
    {"name":"Reverse fly staand - Pulley","sets_reps":"12x 12x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"8x 10x"},
    {"name":"Biceps curl staand - Pulley","sets_reps":"10x 10x"},
    {"name":"Lying overhead triceps extension","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Lower B","exercises":[
    {"name":"Hack squat machine","sets_reps":"8x 10x"},
    {"name":"Adductie - Machine","sets_reps":"10x 10x"},
    {"name":"Leg curl zittend","sets_reps":"10x 10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x 10x"},
    {"name":"Calf raise - Plateloaded","sets_reps":"12x 12x 12x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"10x 10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Upper Lower 2.0 (4-daags)', 'Upper / Lower split 2.0, 4 trainingen per week', 'upper_lower', 4, '[
  {"name":"Upper A","exercises":[
    {"name":"Bench press - Smith machine","sets_reps":"8x 10x"},
    {"name":"Upper back pull down","sets_reps":"10x 10x"},
    {"name":"Crossover - Pulley","sets_reps":"12x 12x"},
    {"name":"Row - Pulley machine","sets_reps":"8x 8x"},
    {"name":"Shoulder press machine","sets_reps":"10x 10x"},
    {"name":"Reverse fly staand - Pulley","sets_reps":"12x 12x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Preacher curl machine","sets_reps":"12x 12x"}
  ]},
  {"name":"Lower A","exercises":[
    {"name":"Hack squat machine","sets_reps":"10x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"10x 10x"},
    {"name":"Abductie - Machine","sets_reps":"12x 12x 12x"},
    {"name":"Seated leg extension","sets_reps":"12x 12x 12x"},
    {"name":"Calf raise incline leg press","sets_reps":"12x 12x 12x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Upper B","exercises":[
    {"name":"Chest press incline","sets_reps":"8x 10x"},
    {"name":"High to low cable row","sets_reps":"10x 10x"},
    {"name":"Fly zittend - Pulley","sets_reps":"10x 10x"},
    {"name":"Horizontal row machine 2","sets_reps":"10x 10x"},
    {"name":"Lateral raise standing - DBs","sets_reps":"10x 10x"},
    {"name":"Triceps pushdown - Pulley","sets_reps":"10x 10x"},
    {"name":"Hammer curl two sides - DBs","sets_reps":"10x 10x"}
  ]},
  {"name":"Lower B","exercises":[
    {"name":"Leg curl zittend","sets_reps":"10x 10x"},
    {"name":"Hack squat machine","sets_reps":"10x 10x"},
    {"name":"Hyperextension laag","sets_reps":"10x 10x"},
    {"name":"Bulgarian split squat, right - DBs","sets_reps":"10x 10x"},
    {"name":"Bulgarian split squat, left - DBs","sets_reps":"10x 10x"},
    {"name":"Calf raise - Plateloaded","sets_reps":"10x 10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"10x 10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Lower Upper Vrouw 4-daags 1.0', 'Lower / Upper split voor vrouwen, 4 trainingen per week', 'upper_lower', 4, '[
  {"name":"Lower A","exercises":[
    {"name":"Smith Machine Hip Thrust","sets_reps":"8x 8x 8x"},
    {"name":"45 Degree leg press","sets_reps":"12x 12x 12x"},
    {"name":"Lunge walk - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Leg curl zittend","sets_reps":"10x 10x 10x"},
    {"name":"Hyperextension laag","sets_reps":"10x 10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"12x 12x 12x"}
  ]},
  {"name":"Upper A","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 8x 8x"},
    {"name":"Lat pulldown narrow grip","sets_reps":"10x 10x 10x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"12x 12x 12x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x 10x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Lower B","exercises":[
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"10x 10x 10x"},
    {"name":"Bulgarian split squat, right - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Bulgarian split squat, left - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x 10x"},
    {"name":"Abductie - Machine","sets_reps":"10x 10x 10x"},
    {"name":"Standing calf raise machine","sets_reps":"12x 12x 12x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"12x 12x 12x"}
  ]},
  {"name":"Upper B","exercises":[
    {"name":"Upper back pull down","sets_reps":"12x 12x 12x"},
    {"name":"Bench press inclined - Smith machine","sets_reps":"10x 10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x 12x"},
    {"name":"Row - Pulley machine","sets_reps":"10x 10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Lower Upper Vrouw 4-daags 2.0', 'Lower / Upper split voor vrouwen 2.0, 4 trainingen per week', 'upper_lower', 4, '[
  {"name":"Lower A","exercises":[
    {"name":"Smith Machine Hip Thrust","sets_reps":"8x 8x"},
    {"name":"Step up hoog, links - DBs, Box","sets_reps":"10x 10x"},
    {"name":"Step up hoog, rechts - DBs, Box","sets_reps":"10x 10x"},
    {"name":"Adductie - Machine","sets_reps":"10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"12x 12x"},
    {"name":"Hanging leg raise - Rig","sets_reps":"10x 10x"}
  ]},
  {"name":"Upper A","exercises":[
    {"name":"Bench press - DBs","sets_reps":"10x 10x"},
    {"name":"Lat pull down brede grip","sets_reps":"10x 10x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"8x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"Preacher curl machine","sets_reps":"10x 10x"},
    {"name":"Triceps extension lying - DBs","sets_reps":"10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Push Pull Legs Upper 1.0', 'Push / Pull / Legs / Upper split', 'push_pull_legs', 4, '[
  {"name":"Push","exercises":[
    {"name":"Seated chest press","sets_reps":"10x 10x 10x"},
    {"name":"Bench press inclined - Smith machine","sets_reps":"8x 8x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x"}
  ]},
  {"name":"Pull","exercises":[
    {"name":"Lat pulldown narrow grip","sets_reps":"8x 8x 8x"},
    {"name":"Horizontal row machine 3","sets_reps":"10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"12x 12x 12x"},
    {"name":"Row - Pulley machine","sets_reps":"8x 8x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Legs/Shoulders","exercises":[
    {"name":"Shoulder press - DBs","sets_reps":"8x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"12x 12x"},
    {"name":"Abdominal crunch machine","sets_reps":"12x 12x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Upper","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"Lat pull down brede grip","sets_reps":"8x 10x"},
    {"name":"Bench press inclined - Smith machine","sets_reps":"8x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"Row - Pulley machine","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Push Pull Legs Upper 2.0', 'Push / Pull / Legs / Upper split 2.0', 'push_pull_legs', 4, '[
  {"name":"Push","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"Bench press inclined neutral grip","sets_reps":"8x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x"},
    {"name":"Crossover - Pulley","sets_reps":"12x 12x"},
    {"name":"Shoulder press - Smith machine","sets_reps":"8x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Katana extension","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x"}
  ]},
  {"name":"Pull","exercises":[
    {"name":"Lat pulldown narrow grip","sets_reps":"8x 8x"},
    {"name":"Bent-over row staand - Barbell","sets_reps":"8x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"12x 12x 12x"},
    {"name":"High to low cable row","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"}
  ]},
  {"name":"Legs","exercises":[
    {"name":"45 Degree leg press","sets_reps":"10x 10x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"10x 10x"},
    {"name":"Calf raise - Smith machine","sets_reps":"12x 12x 12x"},
    {"name":"Seated leg extension","sets_reps":"12x 12x"},
    {"name":"Abductie - Machine","sets_reps":"10x 10x"},
    {"name":"Adductie - Machine","sets_reps":"10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"12x 12x"},
    {"name":"Abdominal crunch machine","sets_reps":"12x 12x"}
  ]},
  {"name":"Upper","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x"},
    {"name":"Lat pull down brede grip","sets_reps":"8x 10x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"8x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"12x 12x"},
    {"name":"High to low cable row","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Katana extension","sets_reps":"10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Push Pull Push Pull 5-daags', 'Pull / Push / Legs / Push / Pull, 5 trainingen per week', 'push_pull_legs', 5, '[
  {"name":"Pull A","exercises":[
    {"name":"Lat pulldown narrow grip","sets_reps":"8x 10x 10x"},
    {"name":"High Row Machine","sets_reps":"10x 10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x 10x"},
    {"name":"Row - Pulley machine","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Push A","exercises":[
    {"name":"Seated chest press","sets_reps":"8x 10x 10x"},
    {"name":"Schuin bankdrukken - DBs","sets_reps":"8x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"12x 12x 12x"},
    {"name":"Pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Shoulder press - DBs","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Legs","exercises":[
    {"name":"45 Degree leg press","sets_reps":"10x 10x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"10x 10x 10x"},
    {"name":"Calf raise - Smith machine","sets_reps":"10x 10x 10x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Leg curl zittend","sets_reps":"10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x"},
    {"name":"Loopband, duur","sets_reps":"10 minuten"}
  ]},
  {"name":"Push B","exercises":[
    {"name":"Bench press inclined neutral grip","sets_reps":"10x 10x 10x"},
    {"name":"Seated chest press","sets_reps":"10x 10x"},
    {"name":"Crossover - Pulley","sets_reps":"10x 10x"},
    {"name":"Shoulder press - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"},
    {"name":"Overhead triceps extension","sets_reps":"10x 10x"}
  ]},
  {"name":"Pull B","exercises":[
    {"name":"Row - Pulley machine","sets_reps":"10x 10x 10x"},
    {"name":"Lat pull down brede grip","sets_reps":"10x 10x 10x"},
    {"name":"High Row Machine","sets_reps":"10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Upper Lower Push Pull Legs 1.0', 'Upper / Lower / Push / Pull / Legs, 5 trainingen per week', 'mixed', 5, '[
  {"name":"Upper","exercises":[
    {"name":"Seated chest press","sets_reps":"10x 10x 10x"},
    {"name":"Bent-over row staand - Barbell","sets_reps":"10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Lat pulldown narrow grip","sets_reps":"10x 10x"},
    {"name":"Pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Lower","exercises":[
    {"name":"45 Degree leg press","sets_reps":"10x 10x 10x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"10x 10x"},
    {"name":"Lunge, om en om - Barbell","sets_reps":"10x 10x"},
    {"name":"Standing calf raise machine","sets_reps":"12x 12x 12x"},
    {"name":"Seated leg extension","sets_reps":"10x 10x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x"}
  ]},
  {"name":"Push","exercises":[
    {"name":"Schuin bankdrukken - DBs","sets_reps":"10x 10x"},
    {"name":"Seated chest press","sets_reps":"10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"10x 10x"},
    {"name":"Dips - PB","sets_reps":"10x 10x"},
    {"name":"Katana extension","sets_reps":"10x 10x"},
    {"name":"Crossed triceps extension - Pulley","sets_reps":"10x 10x"}
  ]},
  {"name":"Pull","exercises":[
    {"name":"Lat pull down brede grip","sets_reps":"10x 10x"},
    {"name":"Row - Pulley machine","sets_reps":"10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Pullover - Pulley","sets_reps":"10x 10x"},
    {"name":"Preacher Hammer Curl","sets_reps":"10x 10x"},
    {"name":"Incline Cable Curl","sets_reps":"10x 10x"}
  ]},
  {"name":"Legs","exercises":[
    {"name":"45 Degree leg press","sets_reps":"10x 10x 10x"},
    {"name":"Bulgarian split squat, left - DBs","sets_reps":"10x 10x"},
    {"name":"Bulgarian split squat, right - DBs","sets_reps":"10x 10x"},
    {"name":"Leg curl 2","sets_reps":"10x 10x 10x"},
    {"name":"Adductie - Machine","sets_reps":"10x 10x"},
    {"name":"Calf raise machine seated","sets_reps":"10x 10x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"10x 10x"}
  ]}
]'::jsonb);

SELECT public._seed_plan('Upper Lower Push Pull Legs 2.0', 'Upper / Lower / Push / Pull / Legs split 2.0, 5 trainingen per week', 'mixed', 5, '[
  {"name":"Upper","exercises":[
    {"name":"Bench press inclined - Smith machine","sets_reps":"8x 8x 8x"},
    {"name":"Horizontal row machine 2","sets_reps":"10x 10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Crossover - Pulley","sets_reps":"10x 10x"},
    {"name":"High to low cable row","sets_reps":"10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Katana extension","sets_reps":"10x 10x 10x"},
    {"name":"Preacher curl machine","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Lower","exercises":[
    {"name":"Hack squat - Plateloaded","sets_reps":"8x 8x 8x"},
    {"name":"Adductie - Machine","sets_reps":"10x 10x 10x"},
    {"name":"Bulgarian split squat, left - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Bulgarian split squat, right - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Standing calf raise machine","sets_reps":"12x 12x 12x"},
    {"name":"Seated leg extension","sets_reps":"12x 12x 12x"},
    {"name":"Abdominal crunch machine","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Push","exercises":[
    {"name":"Bench press inclined - Smith machine","sets_reps":"8x 8x"},
    {"name":"Bench press - DBs","sets_reps":"10x 10x"},
    {"name":"Cuffed Side Raises","sets_reps":"10x 10x"},
    {"name":"Shoulder press zittend - DBs","sets_reps":"10x 10x 10x"},
    {"name":"Crossover - Pulley","sets_reps":"10x 10x"},
    {"name":"Katana extension","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Pull","exercises":[
    {"name":"High to low cable row","sets_reps":"10x 10x 10x"},
    {"name":"Row - Pulley machine","sets_reps":"10x 10x 10x"},
    {"name":"Reverse pectoral fly machine","sets_reps":"10x 10x"},
    {"name":"Upper back pull down","sets_reps":"10x 10x"},
    {"name":"Hammer curl - Pulley","sets_reps":"10x 10x 10x"}
  ]},
  {"name":"Legs","exercises":[
    {"name":"Hack squat - Plateloaded","sets_reps":"8x 8x"},
    {"name":"Stiff legged deadlift - Barbell","sets_reps":"8x 8x"},
    {"name":"Hyperextension laag","sets_reps":"10x 10x 10x"},
    {"name":"Lying leg curl machine","sets_reps":"12x 12x 12x"},
    {"name":"Calf raise machine seated","sets_reps":"12x 12x 12x"},
    {"name":"Omgekeerde crunch liggend","sets_reps":"10x 10x 10x"}
  ]}
]'::jsonb);

DROP FUNCTION public._seed_plan(text, text, text, int, jsonb);
