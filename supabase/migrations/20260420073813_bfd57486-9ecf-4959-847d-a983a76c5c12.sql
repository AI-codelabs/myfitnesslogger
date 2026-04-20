-- ============================================================
-- 1. onboarding_responses table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  -- Personal
  full_name text,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  body_fat_pct numeric,
  waist_cm numeric,
  hips_cm numeric,
  belly_cm numeric,
  occupation text,
  activity_level text, -- 'active' | 'sedentary'
  sleep_hours numeric,
  smokes text,
  drinks_alcohol text,
  -- Goals
  primary_goal text, -- muscle | cut | energy | combo
  goal_reason text,
  target_outcome text,
  weeks_committed integer,
  -- Training
  train_freq_current integer,
  train_freq_target integer,
  train_days text[],
  lifting_since text,
  train_location text, -- gym | home | other
  train_location_other text,
  equipment_brands text[],
  focus_muscles text[],
  injuries text,
  -- Nutrition
  follows_meal_plan boolean,
  diet_preferences text,
  meals_per_day integer,
  water_liters numeric,
  supplements text,
  tracks_macros boolean,
  typical_day_food text,
  -- Mindset
  challenges text[],
  past_failures text,
  coach_expectations text,
  weekly_training_hours numeric,
  -- Optional uploads & consent
  photo_consent text, -- yes | no_face | no
  progress_photo_front_path text,
  progress_photo_side_path text,
  progress_photo_back_path text,
  step_tracker_screenshot_path text,
  -- Meta
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_responses_user
  ON public.onboarding_responses(user_id);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Helper: is the given coach the one who invited this client?
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_coach_of(_coach_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations
    WHERE coach_id = _coach_id
      AND accepted_user_id = _client_id
      AND status IN ('onboarding', 'active', 'accepted')
  );
$$;

-- ============================================================
-- 3. RLS policies for onboarding_responses
-- ============================================================
CREATE POLICY "Clients view own onboarding"
  ON public.onboarding_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Clients insert own onboarding"
  ON public.onboarding_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Clients update own onboarding"
  ON public.onboarding_responses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Coach views their clients onboarding"
  ON public.onboarding_responses FOR SELECT
  TO authenticated
  USING (public.is_coach_of(auth.uid(), user_id));

-- ============================================================
-- 4. updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_updated_at ON public.onboarding_responses;
CREATE TRIGGER trg_onboarding_updated_at
  BEFORE UPDATE ON public.onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 5. Update signup trigger: invite -> 'onboarding' (not 'accepted')
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_invitation_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  FOR inv IN
    SELECT id, coach_id, email
    FROM public.invitations
    WHERE lower(email) = lower(NEW.email)
      AND status = 'pending'
  LOOP
    UPDATE public.invitations
    SET status = 'onboarding',
        accepted_user_id = NEW.id
    WHERE id = inv.id;

    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      inv.coach_id,
      'invite_accepted',
      'Client signed up',
      inv.email || ' created their account. Waiting for onboarding.',
      '/'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- Re-attach (already exists from prior migration; recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created_accept_invite ON auth.users;
CREATE TRIGGER on_auth_user_created_accept_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_on_signup();

-- ============================================================
-- 6. Onboarding completion trigger:
-- when completed_at goes from NULL -> not null, flip invite to active and notify coach
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_onboarding_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  client_email text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.completed_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) THEN

    SELECT email INTO client_email FROM auth.users WHERE id = NEW.user_id;

    FOR inv IN
      SELECT id, coach_id
      FROM public.invitations
      WHERE accepted_user_id = NEW.user_id
        AND status IN ('onboarding', 'pending')
    LOOP
      UPDATE public.invitations
      SET status = 'active',
          accepted_at = now()
      WHERE id = inv.id;

      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        inv.coach_id,
        'onboarding_completed',
        'Onboarding completed',
        COALESCE(client_email, 'Your client') || ' completed their intake form.',
        '/clients/' || NEW.user_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_completed ON public.onboarding_responses;
CREATE TRIGGER trg_onboarding_completed
  AFTER INSERT OR UPDATE ON public.onboarding_responses
  FOR EACH ROW EXECUTE FUNCTION public.handle_onboarding_completed();

-- ============================================================
-- 7. Migrate any currently-accepted invitations:
-- If client has no onboarding row yet, set them back to 'onboarding'.
-- (So existing test client thobias goes through the form too.)
-- ============================================================
UPDATE public.invitations i
SET status = 'onboarding'
WHERE i.status = 'accepted'
  AND i.accepted_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.onboarding_responses o
    WHERE o.user_id = i.accepted_user_id AND o.completed_at IS NOT NULL
  );

-- ============================================================
-- 8. Storage bucket for onboarding uploads (private)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding-uploads', 'onboarding-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Clients can upload to their own folder: {userId}/...
CREATE POLICY "Clients upload own onboarding files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'onboarding-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Clients read own onboarding files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Clients update own onboarding files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Clients delete own onboarding files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Coaches can read files of their clients
CREATE POLICY "Coaches read their clients onboarding files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'onboarding-uploads'
    AND public.is_coach_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );