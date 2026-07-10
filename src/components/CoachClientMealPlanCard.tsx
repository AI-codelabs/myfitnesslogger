import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ChefHat, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  EMPTY_STRUCTURE,
  MealPlanStructure,
  coerceStructure,
} from "@/lib/mealPlan";
import { MealPlanEditor } from "@/components/MealPlanEditor";

interface Props {
  coachId: string;
  clientId: string;
}

interface Template {
  id: string;
  name: string;
  goal_type: "cut" | "bulk" | "maintain";
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  structure: unknown;
}

interface ClientPlan {
  id: string;
  name: string;
  goal_type: string;
  target_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  structure: unknown;
  template_id: string | null;
  updated_at: string;
}

// Shown on the coach's client profile. Lets the coach:
// - pick a template to start a new plan for this client (copies structure)
// - open the editor to customize
// - save changes as an update to the client's plan
// - save the customized version as a brand-new template (leaves the source untouched)
export function CoachClientMealPlanCard({ coachId, clientId }: Props) {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [plan, setPlan] = useState<ClientPlan | null>(null);

  // Editor dialog state
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<{
    name: string;
    target_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    goal_type: "cut" | "bulk" | "maintain";
    structure: MealPlanStructure;
    templateSourceId: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Save-as-template dialog
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [newTplName, setNewTplName] = useState("");

  async function load() {
    setLoading(true);
    const [tRes, pRes] = await Promise.all([
      supabase
        .from("nutrition_plan_templates")
        .select("id, name, goal_type, target_kcal, protein_g, carbs_g, fat_g, structure")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_meal_plans")
        .select("*")
        .eq("coach_id", coachId)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (tRes.error) toast.error(tRes.error.message);
    setTemplates((tRes.data as Template[]) ?? []);
    setPlan((pRes.data as ClientPlan) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId, clientId]);

  function startFromTemplate(t: Template) {
    setDraft({
      name: `${t.name} — Client copy`,
      target_kcal: t.target_kcal,
      protein_g: t.protein_g,
      carbs_g: t.carbs_g,
      fat_g: t.fat_g,
      goal_type: t.goal_type,
      structure: coerceStructure(t.structure),
      templateSourceId: t.id,
    });
    setEditorOpen(true);
  }

  function startEmpty() {
    setDraft({
      name: "Custom meal plan",
      target_kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      goal_type: "maintain",
      structure: EMPTY_STRUCTURE,
      templateSourceId: null,
    });
    setEditorOpen(true);
  }

  function editExisting() {
    if (!plan) return;
    setDraft({
      name: plan.name,
      target_kcal: plan.target_kcal,
      protein_g: plan.protein_g,
      carbs_g: plan.carbs_g,
      fat_g: plan.fat_g,
      goal_type: (plan.goal_type as "cut" | "bulk" | "maintain") ?? "maintain",
      structure: coerceStructure(plan.structure),
      templateSourceId: plan.template_id,
    });
    setEditorOpen(true);
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Give the plan a name");
      return;
    }
    setSaving(true);
    const payload = {
      coach_id: coachId,
      client_id: clientId,
      template_id: draft.templateSourceId,
      name: draft.name.trim(),
      goal_type: draft.goal_type,
      target_kcal: Math.round(draft.target_kcal) || 0,
      protein_g: Math.round(draft.protein_g) || 0,
      carbs_g: Math.round(draft.carbs_g) || 0,
      fat_g: Math.round(draft.fat_g) || 0,
      structure: draft.structure as unknown as never,
      is_active: true,
    };

    const { error } = plan
      ? await supabase.from("client_meal_plans").update(payload).eq("id", plan.id)
      : await supabase.from("client_meal_plans").insert([payload]);

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(plan ? "Client's plan updated" : "Meal plan assigned");
    setEditorOpen(false);
    load();
  }

  async function saveDraftAsNewTemplate() {
    if (!draft) return;
    const name = newTplName.trim();
    if (!name) {
      toast.error("Enter a template name");
      return;
    }
    const { error } = await supabase.from("nutrition_plan_templates").insert([
      {
        coach_id: coachId,
        name,
        goal_type: draft.goal_type,
        target_kcal: Math.round(draft.target_kcal) || 0,
        protein_g: Math.round(draft.protein_g) || 0,
        carbs_g: Math.round(draft.carbs_g) || 0,
        fat_g: Math.round(draft.fat_g) || 0,
        structure: draft.structure as unknown as never,
      },
    ]);
    if (error) return toast.error(error.message);
    toast.success("Saved as new template");
    setSaveTplOpen(false);
    setNewTplName("");
    load();
  }

  async function deletePlan() {
    if (!plan) return;
    if (!confirm(`Remove "${plan.name}" from this client?`)) return;
    const { error } = await supabase
      .from("client_meal_plans")
      .delete()
      .eq("id", plan.id);
    if (error) return toast.error(error.message);
    toast.success("Meal plan removed");
    setPlan(null);
  }

  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading meal plan…
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Structured meal plan</h4>
          {plan && (
            <Badge variant="secondary" className="ml-auto">
              Assigned
            </Badge>
          )}
        </div>

        {plan ? (
          <div className="rounded-md border p-3 space-y-1">
            <p className="font-medium">{plan.name}</p>
            <p className="text-xs text-muted-foreground">
              {plan.target_kcal} kcal · P{plan.protein_g}/C{plan.carbs_g}/F{plan.fat_g}
              {" · "}
              {coerceStructure(plan.structure).categories.length} meals
            </p>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={editExisting} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={deletePlan}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Assign a template as a starting point (you can customize before saving), or
              build one from scratch. The template itself is never modified.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {templates.length > 0 && (
                <Select
                  onValueChange={(id) => {
                    const t = templates.find((x) => x.id === id);
                    if (t) startFromTemplate(t);
                  }}
                >
                  <SelectTrigger className="h-9 w-[240px]">
                    <SelectValue placeholder="Start from template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {t.target_kcal} kcal
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" variant="outline" onClick={startEmpty} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Blank plan
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {plan ? "Edit client's meal plan" : "Assign meal plan"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <div className="col-span-2">
                  <Label>Plan name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Goal</Label>
                  <Select
                    value={draft.goal_type}
                    onValueChange={(v) =>
                      setDraft({ ...draft, goal_type: v as typeof draft.goal_type })
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
                {(
                  [
                    ["target_kcal", "kcal"],
                    ["protein_g", "P (g)"],
                    ["carbs_g", "C (g)"],
                    ["fat_g", "F (g)"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Input
                      type="number"
                      value={draft[k]}
                      onChange={(e) =>
                        setDraft({ ...draft, [k]: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                ))}
              </div>

              <MealPlanEditor
                value={draft.structure}
                onChange={(structure) => setDraft({ ...draft, structure })}
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setNewTplName(draft?.name ?? "");
                setSaveTplOpen(true);
              }}
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              Save as new template
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveDraft} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {plan ? "Save changes" : "Assign to client"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save-as-template dialog */}
      <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as new template</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Template name</Label>
            <Input
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="e.g. Cut 2200 kcal – seafood focus"
            />
            <p className="text-xs text-muted-foreground">
              Creates a new template in your library. The original template stays
              unchanged.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTplOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDraftAsNewTemplate}>Save template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
