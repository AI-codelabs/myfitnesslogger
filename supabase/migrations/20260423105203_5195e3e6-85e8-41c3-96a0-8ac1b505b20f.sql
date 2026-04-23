CREATE TABLE public.progress_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  taken_on DATE NOT NULL DEFAULT CURRENT_DATE,
  front_path TEXT,
  side_path TEXT,
  back_path TEXT,
  weight_kg NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_progress_photos_client_date ON public.progress_photos(client_id, taken_on DESC);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage own progress photos"
ON public.progress_photos
FOR ALL
TO authenticated
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Coaches view client progress photos"
ON public.progress_photos
FOR SELECT
TO authenticated
USING (public.is_coach_of(auth.uid(), client_id));

CREATE TRIGGER set_progress_photos_updated_at
BEFORE UPDATE ON public.progress_photos
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();