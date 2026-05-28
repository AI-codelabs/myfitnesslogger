
-- 1) Table
CREATE TABLE public.client_nutrition_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_nutrition_documents TO authenticated;
GRANT ALL ON public.client_nutrition_documents TO service_role;

ALTER TABLE public.client_nutrition_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages nutrition docs for own clients"
ON public.client_nutrition_documents
FOR ALL
TO authenticated
USING (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id))
WITH CHECK (auth.uid() = coach_id AND public.is_coach_of(auth.uid(), client_id));

CREATE POLICY "Client views own nutrition docs"
ON public.client_nutrition_documents
FOR SELECT
TO authenticated
USING (auth.uid() = client_id);

CREATE TRIGGER trg_client_nutrition_documents_updated
BEFORE UPDATE ON public.client_nutrition_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_client_nutrition_documents_client ON public.client_nutrition_documents(client_id, created_at DESC);

-- 2) Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('nutrition-documents', 'nutrition-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: files stored under "<client_id>/<filename>"
CREATE POLICY "Coach uploads nutrition docs for own client"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nutrition-documents'
  AND public.is_coach_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Coach updates nutrition docs for own client"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nutrition-documents'
  AND public.is_coach_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Coach deletes nutrition docs for own client"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nutrition-documents'
  AND public.is_coach_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Coach and client read nutrition docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nutrition-documents'
  AND (
    ((storage.foldername(name))[1])::uuid = auth.uid()
    OR public.is_coach_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);
