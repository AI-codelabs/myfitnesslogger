-- Email templates per coach
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  header_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, template_key)
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches manage own templates select"
ON public.email_templates FOR SELECT
USING (auth.uid() = coach_id);

CREATE POLICY "Coaches manage own templates insert"
ON public.email_templates FOR INSERT
WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Coaches manage own templates update"
ON public.email_templates FOR UPDATE
USING (auth.uid() = coach_id);

CREATE POLICY "Coaches manage own templates delete"
ON public.email_templates FOR DELETE
USING (auth.uid() = coach_id);

CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public bucket for email header images
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets', 'email-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Email assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');

CREATE POLICY "Coaches upload own email assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'email-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Coaches update own email assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'email-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Coaches delete own email assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'email-assets' AND auth.uid()::text = (storage.foldername(name))[1]);