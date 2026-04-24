
-- Weekly review drafts: one per coach+client+week
CREATE TABLE public.weekly_review_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  week_start date NOT NULL,
  checkin_id uuid,
  voice_memo text NOT NULL DEFAULT '',
  client_positive text[] NOT NULL DEFAULT '{}',
  client_attention text[] NOT NULL DEFAULT '{}',
  client_actions text[] NOT NULL DEFAULT '{}',
  suggested_adjustments jsonb NOT NULL DEFAULT '{}'::jsonb,
  insights jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz,
  published_at timestamptz,
  voice_memo_recorded_at timestamptz,
  applied_to_nutrition_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, client_id, week_start)
);

ALTER TABLE public.weekly_review_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages weekly reviews for their clients"
ON public.weekly_review_drafts
FOR ALL
TO authenticated
USING ((auth.uid() = coach_id) AND public.is_coach_of(auth.uid(), client_id))
WITH CHECK ((auth.uid() = coach_id) AND public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Client views own published weekly review"
ON public.weekly_review_drafts
FOR SELECT
TO authenticated
USING ((auth.uid() = client_id) AND (published_at IS NOT NULL));

CREATE TRIGGER weekly_review_drafts_set_updated_at
BEFORE UPDATE ON public.weekly_review_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_weekly_review_drafts_client_week
  ON public.weekly_review_drafts (client_id, week_start DESC);
CREATE INDEX idx_weekly_review_drafts_coach
  ON public.weekly_review_drafts (coach_id);

-- Auto-create one draft per (coach, client, week) when a check-in is submitted
CREATE OR REPLACE FUNCTION public.handle_weekly_checkin_create_drafts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  FOR inv IN
    SELECT DISTINCT coach_id
    FROM public.invitations
    WHERE accepted_user_id = NEW.client_id
      AND status IN ('onboarding', 'active', 'accepted', 'inactive')
  LOOP
    INSERT INTO public.weekly_review_drafts (coach_id, client_id, week_start, checkin_id)
    VALUES (inv.coach_id, NEW.client_id, NEW.week_start, NEW.id)
    ON CONFLICT (coach_id, client_id, week_start) DO UPDATE
      SET checkin_id = COALESCE(public.weekly_review_drafts.checkin_id, EXCLUDED.checkin_id);
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER weekly_checkin_create_drafts
AFTER INSERT OR UPDATE OF submitted_at ON public.weekly_checkins
FOR EACH ROW EXECUTE FUNCTION public.handle_weekly_checkin_create_drafts();
