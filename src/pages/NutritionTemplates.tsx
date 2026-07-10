import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  ChefHat,
} from "lucide-react";
import { MealPlanEditor } from "@/components/MealPlanEditor";
import {
  MealPlanStructure,
  coerceStructure,
  EMPTY_STRUCTURE,
} from "@/lib/mealPlan";

const BUCKET = "nutrition-templates";

interface Template {
  id: string;
  coach_id: string;
  name: string;
  goal_type: "cut" | "bulk" | "maintain";
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  pdf_path: string | null;
  pdf_name: string | null;
  notes: string | null;
  structure: unknown;
  created_at: string;
}

interface FormState {
  id?: string;
  name: string;
  goal_type: "cut" | "bulk" | "maintain";
  target_kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  notes: string;
  file?: File | null;
  existing_pdf_path?: string | null;
  existing_pdf_name?: string | null;
}

const emptyForm: FormState = {
  name: "",
  goal_type: "cut",
  target_kcal: "",
  protein_g: "",
  carbs_g: "",
  fat_g: "",
  notes: "",
  file: null,
};

const goalLabels: Record<string, string> = {
  cut: "Cut",
  bulk: "Bulk",
  maintain: "Maintain",
};

export default function NutritionTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Meals editor state (per template)
  const [mealsOpen, setMealsOpen] = useState(false);
  const [mealsTarget, setMealsTarget] = useState<Template | null>(null);
  const [mealsDraft, setMealsDraft] = useState<MealPlanStructure>(EMPTY_STRUCTURE);
  const [mealsSaving, setMealsSaving] = useState(false);

  function openMeals(t: Template) {
    setMealsTarget(t);
    setMealsDraft(coerceStructure(t.structure));
    setMealsOpen(true);
  }

  async function saveMeals() {
    if (!mealsTarget) return;
    setMealsSaving(true);
    const { error } = await supabase
      .from("nutrition_plan_templates")
      .update({ structure: mealsDraft as unknown as never })
      .eq("id", mealsTarget.id);
    setMealsSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Meals updated");
    setMealsOpen(false);
    load();
  }

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("nutrition_plan_templates")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setTemplates((data as Template[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function openNew() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(t: Template) {
    setForm({
      id: t.id,
      name: t.name,
      goal_type: t.goal_type,
      target_kcal: String(t.target_kcal),
      protein_g: String(t.protein_g),
      carbs_g: String(t.carbs_g),
      fat_g: String(t.fat_g),
      notes: t.notes ?? "",
      file: null,
      existing_pdf_path: t.pdf_path,
      existing_pdf_name: t.pdf_name,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!user) return;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const kcal = Number(form.target_kcal);
    const p = Number(form.protein_g);
    const c = Number(form.carbs_g);
    const f = Number(form.fat_g);
    if ([kcal, p, c, f].some((n) => !Number.isFinite(n) || n < 0)) {
      toast.error("Enter valid macro numbers");
      return;
    }
    setSaving(true);

    let pdf_path = form.existing_pdf_path ?? null;
    let pdf_name = form.existing_pdf_name ?? null;

    if (form.file) {
      if (form.file.size > 20 * 1024 * 1024) {
        setSaving(false);
        toast.error("PDF too large (max 20 MB)");
        return;
      }
      const safe = form.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const newPath = `${user.id}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, form.file, {
          contentType: form.file.type || "application/pdf",
          upsert: false,
        });
      if (upErr) {
        setSaving(false);
        toast.error(upErr.message);
        return;
      }
      // Remove previous file if we're replacing
      if (pdf_path) {
        await supabase.storage.from(BUCKET).remove([pdf_path]);
      }
      pdf_path = newPath;
      pdf_name = form.file.name;
    }

    const payload = {
      coach_id: user.id,
      name: form.name.trim(),
      goal_type: form.goal_type,
      target_kcal: Math.round(kcal),
      protein_g: Math.round(p),
      carbs_g: Math.round(c),
      fat_g: Math.round(f),
      notes: form.notes.trim() || null,
      pdf_path,
      pdf_name,
    };

    const { error } = form.id
      ? await supabase
          .from("nutrition_plan_templates")
          .update(payload)
          .eq("id", form.id)
      : await supabase.from("nutrition_plan_templates").insert(payload);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? "Template updated" : "Template created");
    setDialogOpen(false);
    load();
  }

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    if (t.pdf_path) {
      await supabase.storage.from(BUCKET).remove([t.pdf_path]);
    }
    const { error } = await supabase
      .from("nutrition_plan_templates")
      .delete()
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  async function downloadPdf(t: Template) {
    if (!t.pdf_path) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(t.pdf_path, 60 * 5, { download: t.pdf_name || "template.pdf" });
    if (error || !data?.signedUrl) {
      toast.error(error?.message || "Couldn't generate link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-5xl mx-auto w-full">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Nutrition templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload reusable meal plan PDFs with macro targets. After onboarding,
            the system suggests the closest match for each client — you approve
            before it attaches.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New template
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first cut / bulk / maintain template to get automatic
            best-match suggestions.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold truncate">{t.name}</p>
                    <Badge variant="secondary">{goalLabels[t.goal_type]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.target_kcal} kcal · P {t.protein_g} / C {t.carbs_g} / F{" "}
                    {t.fat_g}
                  </p>
                </div>
              </div>

              {t.pdf_name && (
                <div className="flex items-center gap-2 rounded-md bg-muted/40 border px-2.5 py-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate flex-1">{t.pdf_name}</span>
                  <button
                    onClick={() => downloadPdf(t)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {t.notes && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {t.notes}
                </p>
              )}

              {(() => {
                const s = coerceStructure(t.structure);
                const mealCount = s.categories.length;
                return (
                  <div className="text-[11px] text-muted-foreground">
                    {mealCount > 0
                      ? `${mealCount} meal${mealCount === 1 ? "" : "s"} configured`
                      : "No meals yet — add editable meals"}
                  </div>
                );
              })()}

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => openMeals(t)}
                  className="gap-1.5"
                >
                  <ChefHat className="h-3.5 w-3.5" />
                  Meals
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(t)}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(t)}
                  className="gap-1.5 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Cut 2200 kcal"
              />
            </div>
            <div>
              <Label>Goal type</Label>
              <Select
                value={form.goal_type}
                onValueChange={(v) =>
                  setForm({ ...form, goal_type: v as FormState["goal_type"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cut">Cut</SelectItem>
                  <SelectItem value="bulk">Bulk</SelectItem>
                  <SelectItem value="maintain">Maintain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Calories</Label>
                <Input
                  type="number"
                  value={form.target_kcal}
                  onChange={(e) =>
                    setForm({ ...form, target_kcal: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Protein (g)</Label>
                <Input
                  type="number"
                  value={form.protein_g}
                  onChange={(e) =>
                    setForm({ ...form, protein_g: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Carbs (g)</Label>
                <Input
                  type="number"
                  value={form.carbs_g}
                  onChange={(e) => setForm({ ...form, carbs_g: e.target.value })}
                />
              </div>
              <div>
                <Label>Fat (g)</Label>
                <Input
                  type="number"
                  value={form.fat_g}
                  onChange={(e) => setForm({ ...form, fat_g: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>PDF</Label>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) =>
                      setForm({ ...form, file: e.target.files?.[0] || null })
                    }
                  />
                  <Button asChild variant="outline" size="sm" className="w-full gap-2">
                    <span className="cursor-pointer">
                      <Upload className="h-4 w-4" />
                      {form.file
                        ? form.file.name
                        : form.existing_pdf_name || "Choose PDF"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mealsOpen} onOpenChange={setMealsOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Meals — {mealsTarget?.name ?? "template"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Editing the template itself. To customize per client without touching this
            template, use "Assign meal plan" from the client's profile.
          </p>
          <MealPlanEditor value={mealsDraft} onChange={setMealsDraft} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMealsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveMeals} disabled={mealsSaving}>
              {mealsSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save meals
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
