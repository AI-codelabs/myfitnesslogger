
CREATE TABLE IF NOT EXISTS public.__ci_diag(step text, result text, ts timestamptz default now());
TRUNCATE public.__ci_diag;

DO $outer$
DECLARE
  uid uuid := '36610db5-f0b4-4e86-865b-1b9b1f1501d6';
  ws date := date_trunc('week', now())::date;
  vals numeric[] := ARRAY[96.5, 96.567, 0.5, 999.99, 1000, 1096.5, 123456.789];
  v numeric;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);

  -- 1. weekly check-in upsert (insert path)
  BEGIN
    INSERT INTO public.weekly_checkins (client_id, week_start, submitted_at, weight_kg, details)
    VALUES (uid, ws, now(), 96.5, '{}'::jsonb)
    ON CONFLICT (client_id, week_start) DO UPDATE SET weight_kg = excluded.weight_kg, submitted_at = excluded.submitted_at;
    INSERT INTO public.__ci_diag VALUES ('checkin_upsert_current_week','OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__ci_diag VALUES ('checkin_upsert_current_week', SQLSTATE||' '||SQLERRM);
  END;

  -- 2. second upsert (update path, simulates re-submit)
  BEGIN
    INSERT INTO public.weekly_checkins (client_id, week_start, submitted_at, weight_kg, details)
    VALUES (uid, ws, now(), 97.1, '{}'::jsonb)
    ON CONFLICT (client_id, week_start) DO UPDATE SET weight_kg = excluded.weight_kg, submitted_at = excluded.submitted_at;
    INSERT INTO public.__ci_diag VALUES ('checkin_upsert_resubmit','OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.__ci_diag VALUES ('checkin_upsert_resubmit', SQLSTATE||' '||SQLERRM);
  END;

  -- 3. weight_logs across value edge cases
  FOREACH v IN ARRAY vals LOOP
    BEGIN
      INSERT INTO public.weight_logs (client_id, logged_on, weight_kg)
      VALUES (uid, current_date, v)
      ON CONFLICT (client_id, logged_on) DO UPDATE SET weight_kg = excluded.weight_kg;
      INSERT INTO public.__ci_diag VALUES ('weight_'||v::text,'OK');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.__ci_diag VALUES ('weight_'||v::text, SQLSTATE||' '||SQLERRM);
    END;
  END LOOP;

  PERFORM set_config('role','postgres', true);

  -- cleanup: remove only rows created by this diagnostic
  DELETE FROM public.weekly_review_drafts d WHERE d.client_id = uid AND d.week_start = ws
    AND NOT EXISTS (SELECT 1 FROM public.weekly_checkins c WHERE c.client_id = uid AND c.week_start = ws AND c.id = d.checkin_id AND c.created_at < now() - interval '1 minute');
  DELETE FROM public.weekly_checkins WHERE client_id = uid AND week_start = ws AND created_at > now() - interval '1 minute';
  DELETE FROM public.notifications WHERE type = 'weekly_checkin_submitted' AND created_at > now() - interval '1 minute';
  DELETE FROM public.weight_logs WHERE client_id = uid AND logged_on = current_date AND created_at > now() - interval '1 minute';
END
$outer$;
