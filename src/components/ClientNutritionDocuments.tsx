import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Trash2, ExternalLink, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Lang } from "@/lib/onboardingSchema";

interface Doc {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  view_url?: string;
  download_url?: string;
}

interface Props {
  clientId: string;
  coachId?: string | null;
  canUpload: boolean;
  lang: Lang;
}

const BUCKET = "nutrition-documents";

export function ClientNutritionDocuments({ clientId, coachId, canUpload, lang }: Props) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("client_nutrition_documents")
      .select("id, file_path, file_name, mime_type, size_bytes, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const base = (data as Doc[]) ?? [];
    // Pre-sign URLs so the list can render real <a> tags. iOS standalone
    // PWAs only "escape" to Safari when a user clicks an anchor element
    // with a real href — window.open / programmatic downloads silently fail.
    const enriched = await Promise.all(
      base.map(async (d) => {
        const [viewRes, dlRes] = await Promise.all([
          supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 60 * 60),
          supabase.storage
            .from(BUCKET)
            .createSignedUrl(d.file_path, 60 * 60, { download: d.file_name }),
        ]);
        return {
          ...d,
          view_url: viewRes.data?.signedUrl,
          download_url: dlRes.data?.signedUrl,
        };
      }),
    );
    setDocs(enriched);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleUpload(file: File) {
    if (!coachId) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error(tx("Bestand is te groot (max 20 MB)", "File too large (max 20 MB)"));
      return;
    }
    setUploading(true);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${clientId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { error: dbErr } = await supabase.from("client_nutrition_documents").insert({
      coach_id: coachId,
      client_id: clientId,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || "application/pdf",
      size_bytes: file.size,
    });
    setUploading(false);
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }
    toast.success(tx("Document geüpload", "Document uploaded"));
    load();
  }


  async function removeDoc(d: Doc) {
    if (!canUpload) return;
    if (!confirm(tx("Document verwijderen?", "Delete this document?"))) return;
    setBusyId(d.id);
    await supabase.storage.from(BUCKET).remove([d.file_path]);
    await supabase.from("client_nutrition_documents").delete().eq("id", d.id);
    setBusyId(null);
    load();
  }

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{tx("Voedingsschema's (PDF)", "Nutrition documents (PDF)")}</h3>
          <p className="text-xs text-muted-foreground">
            {canUpload
              ? tx("Upload een PDF voor deze klant.", "Upload a PDF for this client.")
              : tx("Bestanden van je coach.", "Files from your coach.")}
          </p>
        </div>
        {canUpload && (
          <label className="sm:shrink-0">
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleUpload(f);
              }}
            />
            <Button asChild size="sm" variant="outline" disabled={uploading} className="w-full sm:w-auto">
              <span className="cursor-pointer gap-2">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {tx("Uploaden", "Upload")}
              </span>
            </Button>
          </label>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          {tx("Nog geen documenten.", "No documents yet.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="rounded-md border p-3 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium break-words">{d.file_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()}
                    {d.size_bytes ? ` · ${Math.round(d.size_bytes / 1024)} KB` : ""}
                  </p>
                </div>
                {canUpload && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeDoc(d)}
                    disabled={busyId === d.id}
                    className="text-muted-foreground hover:text-destructive shrink-0 -mr-1 -mt-1"
                    aria-label={tx("Verwijder", "Delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button asChild size="sm" variant="outline" className="gap-1 w-full sm:w-auto" disabled={!d.view_url}>
                  <a
                    href={d.view_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={tx("Open in browser", "Open in browser")}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {tx("Open", "Open")}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1 w-full sm:w-auto" disabled={!d.download_url}>
                  <a
                    href={d.download_url || "#"}
                    rel="noopener noreferrer"
                    aria-label={tx("Download", "Download")}
                  >
                    <Download className="h-4 w-4" />
                    {tx("Download", "Download")}
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
