import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Target, History, Sparkles, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  ClientGoal,
  GOAL_TYPE_LABELS,
  GoalType,
} from "@/lib/clientGoal";
import { Lang } from "@/lib/onboardingSchema";

type DraftGoal = {
  goal_type: GoalType;
  goal_label: string;
  goal_weight_kg: string;
  starting_weight_kg: string;
  target_date: string;
  maintenance_calories: string;
  activity_level: string;
  weekly_drift_tolerance_kg: string;
  notes: string;
};

const emptyDraft: DraftGoal = {
  goal_type: "maintain",
  goal_label: "",
  goal_weight_kg: "",
  starting_weight_kg: "",
  target_date: "",
  maintenance_calories: "",
  activity_level: "",
  weekly_drift_tolerance_kg: "0.3",
  notes: "",
};

function fromGoal(g: ClientGoal): DraftGoal {
  return {
    goal_type: g.goal_type,
    goal_label: g.goal_label ?? "",
    goal_weight_kg: g.goal_weight_kg != null ? String(g.goal_weight_kg) : "",
    starting_weight_kg: g.starting_weight_kg != null ? String(g.starting_weight_kg) : "",
    target_date: g.target_date ?? "",
    maintenance_calories: g.maintenance_calories != null ? String(g.maintenance_calories) : "",
    activity_level: g.activity_level ?? "",
    weekly_drift_tolerance_kg:
      g.weekly_drift_tolerance_kg != null ? String(g.weekly_drift_tolerance_kg) : "0.3",
    notes: g.notes ?? "",
  };
}

interface AiVariables {
  current_weight_kg: number | null;
  starting_weight_kg: number | null;
  weight_change_kg: number | null;
  avg_calories_7d: number | null;
  avg_rpe_4w: number | null;
  avg_sleep_4w: number | null;
  avg_energy_4w: number | null;
  avg_nutrition_4w: number | null;
  checkins_count_4w: number;
}

export function ClientGoalsTab({
  clientId,
  coachId,
  lang,
}: {
  clientId: string;
  coachId: string;
  lang: Lang;
}) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const [draft, setDraft] = useState<DraftGoal>(emptyDraft);
  const [creatingNew, setCreatingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [vars, setVars] = useState<AiVariables | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: gs }, { data: checkins }, { data: nutritionLogs }] = await Promise.all([
      supabase
        .from("client_goals")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("weekly_checkins")
        .select("week_start, weight_kg, intensity_rpe, energy, nutrition_stars, hydration")
        .eq("client_id", clientId)
        .order("week_start", { ascending: false })
        .limit(4),
      supabase
        .from("cronometer_nutrition_logs")
        .select("log_date, calories")
        .eq("client_id", clientId)
        .order("log_date", { ascending: false })
        .limit(7),
    ]);
    const list = (gs ?? []) as ClientGoal[];
    setGoals(list);
    const active = list.find((g) => g.is_active);
    if (active) {
      setDraft(fromGoal(active));
      setEditingId(active.id);
      setCreatingNew(false);
    } else {
      setDraft(emptyDraft);
      setEditingId(null);
      setCreatingNew(true);
    }

    const ck = (checkins ?? []) as any[];
    const avg = (arr: number[]) =>
      arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
    const weights = ck.map((c) => c.weight_kg).filter((v): v is number => v != null);
    const current = weights[0] ?? null;
    const startingFromGoal = active?.starting_weight_kg ?? weights[weights.length - 1] ?? null;
    const change = current != null && startingFromGoal != null ? Math.round((current - startingFromGoal) * 10) / 10 : null;

    const cals = ((nutritionLogs ?? []) as any[]).map((l) => Number(l.calories) || 0);

    setVars({
      current_weight_kg: current,
      starting_weight_kg: startingFromGoal,
      weight_change_kg: change,
      avg_calories_7d: cals.length ? avg(cals) : null,
      avg_rpe_4w: avg(ck.map((c) => c.intensity_rpe).filter((v: any) => v != null)),
      avg_sleep_4w: null,
      avg_energy_4w: avg(ck.map((c) => c.energy).filter((v: any) => v != null)),
      avg_nutrition_4w: avg(ck.map((c) => c.nutrition_stars).filter((v: any) => v != null)),
      checkins_count_4w: ck.length,
    });

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const save = async () => {
    setSaving(true);
    const payload: any = {
      client_id: clientId,
      goal_type: draft.goal_type,
      goal_label: draft.goal_label || null,
      goal_weight_kg: draft.goal_weight_kg ? Number(draft.goal_weight_kg) : null,
      starting_weight_kg: draft.starting_weight_kg ? Number(draft.starting_weight_kg) : null,
      target_date: draft.target_date || null,
      maintenance_calories: draft.maintenance_calories ? Number(draft.maintenance_calories) : null,
      activity_level: draft.activity_level || null,
      weekly_drift_tolerance_kg: draft.weekly_drift_tolerance_kg
        ? Number(draft.weekly_drift_tolerance_kg)
        : 0.3,
      notes: draft.notes || null,
      is_active: true,
      created_by: coachId,
    };

    let error: any = null;
    if (creatingNew || !editingId) {
      const r = await supabase.from("client_goals").insert(payload);
      error = r.error;
    } else {
      const r = await supabase.from("client_goals").update(payload).eq("id", editingId);
      error = r.error;
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(tx("Doel opgeslagen", "Goal saved"));
    setCreatingNew(false);
    load();
  };

  const activateHistorical = async (goalId: string) => {
    const { error } = await supabase
      .from("client_goals")
      .update({ is_active: true })
      .eq("id", goalId);
    if (error) return toast.error(error.message);
    toast.success(tx("Doel geactiveerd", "Goal activated"));
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Editor */}
      <Card className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            {creatingNew
              ? tx("Nieuw doel instellen", "Set new goal")
              : tx("Actief doel", "Active goal")}
          </h3>
          {!creatingNew && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreatingNew(true);
                setEditingId(null);
                setDraft({ ...emptyDraft, starting_weight_kg: draft.goal_weight_kg ? "" : "" });
              }}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {tx("Nieuw doel", "New goal")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{tx("Doeltype", "Goal type")}</Label>
            <Select
              value={draft.goal_type}
              onValueChange={(v) => setDraft({ ...draft, goal_type: v as GoalType })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GOAL_TYPE_LABELS) as GoalType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {GOAL_TYPE_LABELS[k][lang]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tx("Streefgewicht (kg)", "Goal weight (kg)")}</Label>
            <Input
              type="number" inputMode="decimal" step="0.1"
              value={draft.goal_weight_kg}
              onChange={(e) => setDraft({ ...draft, goal_weight_kg: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tx("Startgewicht (kg)", "Starting weight (kg)")}</Label>
            <Input
              type="number" inputMode="decimal" step="0.1"
              value={draft.starting_weight_kg}
              onChange={(e) => setDraft({ ...draft, starting_weight_kg: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tx("Streefdatum", "Target date")}</Label>
            <Input
              type="date"
              value={draft.target_date}
              onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tx("Onderhoudscalorieën", "Maintenance kcal")}</Label>
            <Input
              type="number" inputMode="numeric"
              value={draft.maintenance_calories}
              onChange={(e) => setDraft({ ...draft, maintenance_calories: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{tx("Activiteitsniveau", "Activity level")}</Label>
            <Select
              value={draft.activity_level || undefined}
              onValueChange={(v) => setDraft({ ...draft, activity_level: v })}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {["sedentary", "light", "moderate", "active", "very_active"].map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {draft.goal_type === "maintain" && (
            <div className="space-y-1.5">
              <Label>{tx("Wekelijkse drift-tolerantie (kg)", "Weekly drift tolerance (kg)")}</Label>
              <Input
                type="number" inputMode="decimal" step="0.05"
                value={draft.weekly_drift_tolerance_kg}
                onChange={(e) => setDraft({ ...draft, weekly_drift_tolerance_kg: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                {tx("Binnen deze bandbreedte = op koers.", "Inside this band = on track.")}
              </p>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tx("Doelomschrijving", "Goal label")}</Label>
            <Input
              value={draft.goal_label}
              onChange={(e) => setDraft({ ...draft, goal_label: e.target.value })}
              placeholder={tx("Bv: zomerlichaam, contestprep…", "e.g. summer cut, contest prep…")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tx("Notities", "Notes")}</Label>
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {creatingNew && goals.find((g) => g.is_active) && (
            <Button variant="ghost" onClick={() => { setCreatingNew(false); const a = goals.find((g) => g.is_active); if (a) { setDraft(fromGoal(a)); setEditingId(a.id); } }}>
              {tx("Annuleer", "Cancel")}
            </Button>
          )}
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {creatingNew
              ? tx("Doel opslaan & activeren", "Save & activate goal")
              : tx("Wijzigingen opslaan", "Save changes")}
          </Button>
        </div>
      </Card>

      {/* AI variables */}
      <Card className="p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {tx("AI variabelen", "AI variables")}
        </h3>
        <p className="text-xs text-muted-foreground -mt-1">
          {tx(
            "Deze waarden voedt de AI bij het genereren van check-ins. Pas het doel hierboven aan om de AI bij te sturen.",
            "These values feed the AI when generating check-ins. Edit the goal above to steer the AI.",
          )}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-sm">
          <Stat label={tx("Huidig gewicht", "Current weight")} value={vars?.current_weight_kg} unit="kg" />
          <Stat label={tx("Startgewicht", "Starting weight")} value={vars?.starting_weight_kg} unit="kg" />
          <Stat label={tx("Verandering", "Change")} value={vars?.weight_change_kg} unit="kg" signed />
          <Stat label={tx("Gem. kcal (7d)", "Avg kcal (7d)")} value={vars?.avg_calories_7d} unit="" />
          <Stat label={tx("Gem. RPE (4w)", "Avg RPE (4w)")} value={vars?.avg_rpe_4w} unit="/5" />
          <Stat label={tx("Gem. energie (4w)", "Avg energy (4w)")} value={vars?.avg_energy_4w} unit="/5" />
          <Stat label={tx("Gem. voeding (4w)", "Avg nutrition (4w)")} value={vars?.avg_nutrition_4w} unit="★" />
          <Stat label={tx("Check-ins (4w)", "Check-ins (4w)")} value={vars?.checkins_count_4w ?? 0} unit="" />
        </div>
      </Card>

      {/* History */}
      {goals.length > 1 && (
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            {tx("Doel-historie", "Goal history")}
          </h3>
          <ul className="divide-y">
            {goals.map((g) => (
              <li key={g.id} className="py-2.5 flex items-center gap-3">
                <Badge variant={g.is_active ? "default" : "outline"}>
                  {GOAL_TYPE_LABELS[g.goal_type][lang]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">
                    {g.goal_label || g.notes || "—"}
                    {g.goal_weight_kg != null && ` · ${g.goal_weight_kg} kg`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(g.created_at).toLocaleDateString()}
                  </p>
                </div>
                {!g.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => activateHistorical(g.id)}>
                    {tx("Heractiveer", "Reactivate")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  signed,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  signed?: boolean;
}) {
  const display =
    value == null
      ? "—"
      : signed && typeof value === "number" && value > 0
        ? `+${value}`
        : String(value);
  return (
    <div className="rounded-md border bg-card/50 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">
        {display}
        {value != null && unit ? <span className="text-muted-foreground font-normal ml-0.5">{unit}</span> : null}
      </p>
    </div>
  );
}
