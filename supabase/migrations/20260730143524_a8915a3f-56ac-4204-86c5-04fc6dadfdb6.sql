SELECT net.http_post(
    url := 'https://zaxbjmdhzfldvnikxanv.supabase.co/functions/v1/cronometer',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', public.get_internal_secret('cron_token')),
    body := jsonb_build_object('action','web_reconcile')
  );