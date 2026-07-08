import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  rankTemplates,
  type TemplateMacros,
  type ClientTargets,
} from "@/lib/nutritionTemplateMatch";

interface Props {
  coachId: string;
  clientId: string;
  onAttached?: () => void;
}

interface DbTemplate extends TemplateMacros {
  id: string;
  pdf_path: string | null;
  pdf_name: string | null;
}

// Downloads a template PDF from the coach's bucket and re-uploads it into the
// client's nutrition-documents bucket, then inserts a row so it shows up in
// the client's document list — same flow as a manual upload, but sourced from
// a template. This keeps the client-facing storage path unchanged.
async function attachTemplateToClient(
  t: DbTemplate,
  coachId: string,
  clientId: string,
) {
  if (!t.pdf_path || !t.pdf_name) {
    throw new Error("Template has no PDF attached");
  }
  const { data: dl, error: dlErr } = await supabase.storage
    .from("nutrition-templates")
    .download(t.pdf_path);
  if (dlErr || !dl) throw new Error(dlErr?.message || "Download failed");

  const safe = t.pdf_name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const newPath = `${clientId}/${Date.now()}_tpl_${safe}`;

  const { error: upErr } = await supabase.storage
    .from("nutrition-documents")
    .upload(newPath, dl, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);

  const { error: dbErr } = await supabase
    .from("client_nutrition_documents")
    .insert({
      coach_id: coachId,
      client_id: clientId,
      file_path: newPath,
      file_name: t.pdf_name,
      mime_type: "application/pdf",
      size_bytes: dl.size,
    });
  if (dbErr) throw new Error(dbErr.message);
}

export function NutritionTemplateSuggestion({
  coachId,
  clientId,
  onAttached,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [targets, setTargets] = useState<ClientTargets | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [tplRes, nutRes, goalRes] = await Promise.all([
        supabase
          .from("nutrition_plan_templates")
          .select("id, name, goal_type, target_kcal, protein_g, carbs_g, fat_g, pdf_path, pdf_name")
          .eq("coach_id", coachId),
        supabase
          .from("nutrition_plans")
          .select("details")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("client_goals")
          .select("goal_type")
          .eq("client_id", clientId)
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const tpls = (tplRes.data as DbTemplate[]) ?? [];
      setTemplates(tpls);

      const d = (nutRes.data?.details ?? {}) as Record<string, unknown>;
      const kcal = Number(d.calories);
      const p = Number(d.protein_g);
      const c = Number(d.carbs_g);
      const f = Number(d.fat_g);
      if ([kcal, p, c, f].every((n) => Number.isFinite(n) && n > 0)) {
        setTargets({
          goal_type: (goalRes.data?.goal_type as ClientTargets["goal_type"]) ?? null,
          calories: kcal,
          protein_g: p,
          carbs_g: c,
          fat_g: f,
        });
      } else {
        setTargets(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [coachId, clientId]);

  const ranked = useMemo(() => {
    if (!targets) return [];
    return rankTemplates(templates, targets).slice(0, 3);
  }, [templates, targets]);

  if (loading) return null;
  if (templates.length === 0) return null;

  if (!targets) {
    return (
      <Card className="p-3 border-dashed">
        <p className="text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 inline mr-1" />
          Set this client's macro targets first to get template suggestions.
        </p>
      </Card>
    );
  }

  async function handleAttach(t: DbTemplate) {
    setAttachingId(t.id);
    try {
      await attachTemplateToClient(t, coachId, clientId);
      toast.success(`Attached "${t.name}" to client`);
      onAttached?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attach failed");
    } finally {
      setAttachingId(null);
    }
  }

  return (
    <Card className="p-3 sm:p-4 space-y-2 border-primary/30 bg-primary/[0.03]">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Suggested templates</h4>
        <span className="text-[11px] text-muted-foreground">
          matched to {targets.calories} kcal · P{targets.protein_g}/C
          {targets.carbs_g}/F{targets.fat_g}
        </span>
      </div>
      <ul className="space-y-1.5">
        {ranked.map((r, i) => (
          <li
            key={r.template.id}
            className="flex items-center gap-2 rounded-md bg-background border px-2.5 py-2"
          >
            {i === 0 && (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-medium truncate">
                  {r.template.name}
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {r.template.goal_type}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {r.template.target_kcal} kcal · P{r.template.protein_g}/C
                {r.template.carbs_g}/F{r.template.fat_g}
              </p>
            </div>
            <Button
              size="sm"
              variant={i === 0 ? "default" : "outline"}
              onClick={() => handleAttach(r.template)}
              disabled={attachingId === r.template.id || !r.template.pdf_path}
              className="gap-1 shrink-0"
            >
              {attachingId === r.template.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              Attach
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        Suggestions never auto-attach — you approve each one.
      </p>
    </Card>
  );
}
