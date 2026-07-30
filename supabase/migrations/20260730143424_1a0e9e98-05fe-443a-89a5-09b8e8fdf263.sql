SELECT net.http_post(
    url := 'https://zaxbjmdhzfldvnikxanv.supabase.co/functions/v1/cronometer',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.internal_secrets WHERE name='CRON_SECRET' LIMIT 1)),
    body := jsonb_build_object('action','web_reconcile')
  );