import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { parseDecimal } from "@/lib/parseDecimal";
import { Lang } from "@/lib/onboardingSchema";
import { pushTargetsToCronometer } from "@/lib/cronometerTargets";
import { db } from "@/lib/db";

type Props = {
  clientId: string;
  coachId: string;
  lang: Lang;
  prefill?: Record<string, any>;
  existing?: any | null;
  onCompleted?: () => void;
  onCancel?: () => void;
};

type Values = Record<string, any>;

const stepLabels = (lang: Lang) => [
  { nl: "Eigen gegevens", en: "Your details" },
  { nl: "Jouw levensstijl", en: "Your lifestyle" },
  { nl: "Persoonlijk doel", en: "Personal goal" },
  { nl: "Voedingssamenstelling", en: "Nutrition composition" },
  { nl: "Macro's", en: "Macros" },
].map((s) => s[lang]);

const t = (nl: string, en: string, lang: Lang) => (lang === "nl" ? nl : en);

export const NutritionWizard = ({
  clientId,
  coachId,
  lang,
  prefill,
  existing,
  onCompleted,
  onCancel,
}: Props) => {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [v, setV] = useState<Values>(() => {
    const base: Values = { ...(prefill ?? {}) };
    if (existing) {
      Object.assign(base, {
        gender: existing.gender ?? base.gender,
        age: existing.age ?? base.age,
        height_cm: existing.height_cm ?? base.height_cm,
        weight_kg: existing.weight_kg ?? base.weight_kg,
        ...(existing.details ?? {}),
      });
    }
    return base;
  });

  const set = (k: string, val: any) => setV((p) => ({ ...p, [k]: val }));

  const labels = stepLabels(lang);

  const persist = async (markCompleted = false) => {
    setSaving(true);
    const { gender, age, height_cm, weight_kg, ...rest } = v;
    const row: any = {
      client_id: clientId,
      coach_id: coachId,
      gender: gender || null,
      age: parseDecimal(age),
      height_cm: parseDecimal(height_cm),
      weight_kg: parseDecimal(weight_kg),
      details: rest,
    };
    if (markCompleted) row.completed_at = new Date().toISOString();
    const { error } = await db
      .from("nutrition_plans")
      .upsert(row, { onConflict: "client_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  };

  const next = async () => {
    if (!(await persist(false))) return;
    setStep((s) => Math.min(s + 1, labels.length - 1));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));
  const jumpTo = async (i: number) => {
    if (i === step) return;
    if (!(await persist(false))) return;
    setStep(i);
  };

  const finish = async () => {
    if (!(await persist(true))) return;
    toast.success(t("Voedingsschema opgeslagen", "Nutrition plan saved", lang));
    // Fire-and-forget push to client's Cronometer (no-ops if not opted in)
    const det: any = v;
    const res = await pushTargetsToCronometer({
      client_id: clientId,
      calories: Number(det.calories) || 0,
      protein_g: Number(det.protein_g) || 0,
      carbs_g: Number(det.carbs_g) || 0,
      fat_g: Number(det.fat_g) || 0,
    });
    if (res.success) {
      toast.success(t("Doelen gesynchroniseerd met Cronometer", "Targets synced to Cronometer", lang));
    } else if (res.error) {
      toast.error(t(`Cronometer-sync mislukt: ${res.error}`, `Cronometer sync failed: ${res.error}`, lang));
    }
    onCompleted?.();
  };

  // Step header (numbered chips)
  const Header = (
    <div className="flex items-center justify-between gap-2 mb-6 overflow-x-auto">
      {labels.map((l, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <button
            key={l}
            type="button"
            onClick={() => jumpTo(i)}
            disabled={saving}
            className="flex items-center gap-2 shrink-0 rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title={t("Spring naar deze stap", "Jump to this step", lang)}
          >
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : done
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm whitespace-nowrap ${active ? "font-semibold" : "text-muted-foreground"}`}
            >
              {l}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Card className="p-6">
      {Header}

      {step === 0 && (
        <div className="grid gap-5 md:grid-cols-2 max-w-xl">
          <Field label={t("Geslacht", "Gender", lang)} className="md:col-span-2">
            <Select value={v.gender || ""} onValueChange={(val) => set("gender", val)}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder={t("Kies", "Select", lang)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">{t("Man", "Male", lang)}</SelectItem>
                <SelectItem value="female">{t("Vrouw", "Female", lang)}</SelectItem>
                <SelectItem value="other">{t("Anders", "Other", lang)}</SelectItem>
                <SelectItem value="prefer_not">{t("Zeg ik liever niet", "Prefer not to say", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("Leeftijd", "Age", lang)} suffix={t("jaar", "years", lang)}>
            <NumberInput value={v.age} onChange={(val) => set("age", val)} />
          </Field>
          <Field label={t("Lengte", "Height", lang)} suffix="cm">
            <NumberInput value={v.height_cm} onChange={(val) => set("height_cm", val)} />
          </Field>
          <Field label={t("Gewicht", "Weight", lang)} suffix="kg">
            <NumberInput value={v.weight_kg} onChange={(val) => set("weight_kg", val)} />
          </Field>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t("Activiteitsniveau", "Activity level", lang)}>
            <Select value={v.activity_level || ""} onValueChange={(val) => set("activity_level", val)}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t("Kies", "Select", lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sedentary">{t("Zittend (kantoor)", "Sedentary (office)", lang)}</SelectItem>
                <SelectItem value="light">{t("Licht actief", "Lightly active", lang)}</SelectItem>
                <SelectItem value="moderate">{t("Matig actief", "Moderately active", lang)}</SelectItem>
                <SelectItem value="very">{t("Zeer actief", "Very active", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("Trainingen per week", "Workouts per week", lang)}>
            <NumberInput value={v.workouts_per_week} onChange={(val) => set("workouts_per_week", val)} />
          </Field>
          <Field label={t("Slaap per nacht", "Sleep per night", lang)} suffix={t("uur", "hours", lang)}>
            <NumberInput value={v.sleep_hours} onChange={(val) => set("sleep_hours", val)} />
          </Field>
          <Field label={t("Stappen per dag", "Steps per day", lang)}>
            <NumberInput value={v.steps_per_day} onChange={(val) => set("steps_per_day", val)} />
          </Field>
          <Field label={t("Werk", "Occupation", lang)} className="md:col-span-2">
            <Input value={v.occupation || ""} onChange={(e) => set("occupation", e.target.value)} className="h-11" />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t("Doel", "Goal", lang)}>
            <Select value={v.goal || ""} onValueChange={(val) => set("goal", val)}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t("Kies", "Select", lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cut">{t("Vetverlies", "Fat loss", lang)}</SelectItem>
                <SelectItem value="maintain">{t("Onderhouden", "Maintain", lang)}</SelectItem>
                <SelectItem value="bulk">{t("Spier opbouwen", "Build muscle", lang)}</SelectItem>
                <SelectItem value="recomp">{t("Recomp", "Recomp", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("Streefgewicht", "Target weight", lang)} suffix="kg">
            <NumberInput value={v.target_weight_kg} onChange={(val) => set("target_weight_kg", val)} />
          </Field>
          <Field label={t("Tempo", "Pace", lang)}>
            <Select value={v.pace || ""} onValueChange={(val) => set("pace", val)}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t("Kies", "Select", lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="slow">{t("Rustig", "Slow", lang)}</SelectItem>
                <SelectItem value="normal">{t("Normaal", "Normal", lang)}</SelectItem>
                <SelectItem value="aggressive">{t("Agressief", "Aggressive", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("Deadline", "Deadline", lang)}>
            <Input type="date" value={v.deadline || ""} onChange={(e) => set("deadline", e.target.value)} className="h-11" />
          </Field>
          <Field label={t("Motivatie", "Motivation", lang)} className="md:col-span-2">
            <Textarea value={v.motivation || ""} onChange={(e) => set("motivation", e.target.value)} rows={3} />
          </Field>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t("Maaltijden per dag", "Meals per day", lang)}>
            <NumberInput value={v.meals_per_day} onChange={(val) => set("meals_per_day", val)} />
          </Field>
          <Field label={t("Dieetvoorkeur", "Diet preference", lang)}>
            <Select value={v.diet || ""} onValueChange={(val) => set("diet", val)}>
              <SelectTrigger className="h-11"><SelectValue placeholder={t("Kies", "Select", lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="omnivore">{t("Alles eten", "Omnivore", lang)}</SelectItem>
                <SelectItem value="vegetarian">{t("Vegetarisch", "Vegetarian", lang)}</SelectItem>
                <SelectItem value="vegan">{t("Veganistisch", "Vegan", lang)}</SelectItem>
                <SelectItem value="pescatarian">{t("Pescatarisch", "Pescatarian", lang)}</SelectItem>
                <SelectItem value="halal">{t("Halal", "Halal", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("Allergieën / intoleranties", "Allergies / intolerances", lang)} className="md:col-span-2">
            <Textarea value={v.allergies || ""} onChange={(e) => set("allergies", e.target.value)} rows={2} />
          </Field>
          <Field label={t("Voedsel dat je niet lust", "Foods you dislike", lang)} className="md:col-span-2">
            <Textarea value={v.dislikes || ""} onChange={(e) => set("dislikes", e.target.value)} rows={2} />
          </Field>
          <Field label={t("Supplementen", "Supplements", lang)} className="md:col-span-2">
            <Textarea value={v.supplements || ""} onChange={(e) => set("supplements", e.target.value)} rows={2} />
          </Field>
        </div>
      )}

      {step === 4 && <MacroStep v={v} set={set} lang={lang} />}

      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t">
        <Button variant="outline" onClick={prev} disabled={step === 0 || saving} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          {t("Terug", "Back", lang)}
        </Button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={saving}>
              {t("Annuleer", "Cancel", lang)}
            </Button>
          )}
          {step < labels.length - 1 ? (
            <Button onClick={next} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("Volgende", "Next", lang)}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("Opslaan", "Save", lang)}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

const Field = ({
  label,
  suffix,
  children,
  className,
}: {
  label: string;
  suffix?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`space-y-1.5 ${className ?? ""}`}>
    <Label className="text-sm">{label}</Label>
    {suffix ? (
      <div className="flex items-center gap-2">
        <div className="flex-1">{children}</div>
        <span className="text-sm text-muted-foreground w-10">{suffix}</span>
      </div>
    ) : (
      children
    )}
  </div>
);

const NumberInput = ({
  value,
  onChange,
  disabled,
}: {
  value: any;
  onChange: (v: string) => void;
  disabled?: boolean;
}) => (
  <Input
    type="text"
    inputMode="decimal"
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value)}
    onWheel={(e) => e.currentTarget.blur()}
    disabled={disabled}
    className="h-11"
  />
);

// --- Macro calculator (Mifflin-St Jeor) ----------------------------------
const ACTIVITY_MULT: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

const GOAL_ADJUST: Record<string, number> = {
  cut: -0.2,
  mild_cut: -0.1,
  maintain: 0,
  mild_bulk: 0.1,
  bulk: 0.2,
  recomp: -0.05,
};

const computeMacros = (v: Values) => {
  const age = parseDecimal(v.age) ?? 0;
  const h = parseDecimal(v.height_cm) ?? 0;
  const w = parseDecimal(v.weight_kg) ?? 0;
  const gender = v.gender;
  const activity = v.activity_level || "moderate";
  const goal = v.macro_goal || v.goal || "maintain";
  if (!age || !h || !w) return null;
  const bmr =
    gender === "female"
      ? 10 * w + 6.25 * h - 5 * age - 161
      : 10 * w + 6.25 * h - 5 * age + 5;
  const tdee = bmr * (ACTIVITY_MULT[activity] ?? 1.55);
  const adj = GOAL_ADJUST[goal] ?? 0;
  const calories = Math.round(tdee * (1 + adj));
  const pPct = Number(v.macro_p_pct ?? 30);
  const cPct = Number(v.macro_c_pct ?? 40);
  const fPct = Number(v.macro_f_pct ?? 30);
  const protein_g = Math.round((calories * pPct / 100) / 4);
  const carbs_g = Math.round((calories * cPct / 100) / 4);
  const fat_g = Math.round((calories * fPct / 100) / 9);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, protein_g, carbs_g, fat_g };
};

const MacroStep = ({
  v,
  set,
  lang,
}: {
  v: Values;
  set: (k: string, val: any) => void;
  lang: Lang;
}) => {
  useEffect(() => {
    if (!v.macro_goal && v.goal) {
      set("macro_goal", v.goal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = computeMacros(v);
  const totalPct =
    Number(v.macro_p_pct ?? 30) + Number(v.macro_c_pct ?? 40) + Number(v.macro_f_pct ?? 30);
  const overrideMode = !!v.macro_override;
  const finalProtein = overrideMode ? Number(v.protein_g || 0) : result?.protein_g ?? 0;
  const finalCarbs = overrideMode ? Number(v.carbs_g || 0) : result?.carbs_g ?? 0;
  const finalFat = overrideMode ? Number(v.fat_g || 0) : result?.fat_g ?? 0;
  const finalCalories = overrideMode
    ? finalProtein * 4 + finalCarbs * 4 + finalFat * 9
    : result?.calories ?? 0;

  useEffect(() => {
    if (!overrideMode && result) {
      set("calories", result.calories);
      set("protein_g", result.protein_g);
      set("carbs_g", result.carbs_g);
      set("fat_g", result.fat_g);
      set("bmr", result.bmr);
      set("tdee", result.tdee);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    v.age, v.gender, v.height_cm, v.weight_kg, v.activity_level,
    v.macro_goal, v.macro_p_pct, v.macro_c_pct, v.macro_f_pct, overrideMode,
  ]);

  useEffect(() => {
    if (overrideMode) set("calories", finalCalories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideMode, finalCalories]);

  const tt = (nl: string, en: string) => (lang === "nl" ? nl : en);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {tt(
          "Berekend met de Mifflin-St Jeor formule. Pas waarden aan of zet 'Handmatig overschrijven' aan voor eigen getallen.",
          "Calculated with the Mifflin-St Jeor formula. Adjust values or toggle 'Manual override' for custom numbers.",
        )}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={tt("Activiteitsniveau", "Activity level")}>
          <Select value={v.activity_level || "moderate"} onValueChange={(val) => set("activity_level", val)}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sedentary">{tt("Zittend (geen sport)", "Sedentary")} · ×1.2</SelectItem>
              <SelectItem value="light">{tt("Licht: 1-3x/week", "Light: 1-3×/week")} · ×1.375</SelectItem>
              <SelectItem value="moderate">{tt("Matig: 4-5x/week", "Moderate: 4-5×/week")} · ×1.55</SelectItem>
              <SelectItem value="very">{tt("Zwaar: 6-7x/week", "Heavy: 6-7×/week")} · ×1.725</SelectItem>
              <SelectItem value="extra">{tt("Zeer zwaar: 2x per dag", "Very heavy: 2×/day")} · ×1.9</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={tt("Doel (calorie-aanpassing)", "Goal (calorie adjustment)")}>
          <Select value={v.macro_goal || "maintain"} onValueChange={(val) => set("macro_goal", val)}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cut">{tt("Vetverlies", "Fat loss")} · −20%</SelectItem>
              <SelectItem value="mild_cut">{tt("Rustig afvallen", "Mild fat loss")} · −10%</SelectItem>
              <SelectItem value="maintain">{tt("Onderhouden", "Maintain")} · 0%</SelectItem>
              <SelectItem value="mild_bulk">{tt("Rustig opbouwen", "Mild bulk")} · +10%</SelectItem>
              <SelectItem value="bulk">{tt("Spier opbouwen", "Bulk")} · +20%</SelectItem>
              <SelectItem value="recomp">{tt("Recomp", "Recomp")} · −5%</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {result ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat2 label="BMR" value={`${result.bmr} kcal`} />
          <Stat2 label="TDEE" value={`${result.tdee} kcal`} />
          <Stat2
            label={tt("Aanpassing", "Adjustment")}
            value={`${Math.round((GOAL_ADJUST[v.macro_goal || "maintain"] ?? 0) * 100)}%`}
          />
          <Stat2 label={tt("Doel calorieën", "Target calories")} value={`${finalCalories} kcal`} highlight />
        </div>
      ) : (
        <Card className="p-4 text-sm text-muted-foreground">
          {tt(
            "Vul leeftijd, geslacht, lengte en gewicht in (stap 1) om macro's te berekenen.",
            "Fill in age, gender, height, and weight (step 1) to compute macros.",
          )}
        </Card>
      )}

      <div className="space-y-3">
        {(() => {
          const macroKcalLive = finalProtein * 4 + finalCarbs * 4 + finalFat * 9;
          const denom = macroKcalLive > 0 ? macroKcalLive : 1;
          const displayP = overrideMode
            ? Math.round((finalProtein * 4 * 100) / denom)
            : Number(v.macro_p_pct ?? 30);
          const displayC = overrideMode
            ? Math.round((finalCarbs * 4 * 100) / denom)
            : Number(v.macro_c_pct ?? 40);
          const displayF = overrideMode
            ? Math.round((finalFat * 9 * 100) / denom)
            : Number(v.macro_f_pct ?? 30);
          const displayTotal = overrideMode ? displayP + displayC + displayF : totalPct;
          return (
            <>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{tt("Macroverdeling", "Macro split")}</h4>
                <span className={`text-xs ${displayTotal === 100 ? "text-muted-foreground" : "text-destructive"}`}>
                  {tt("Totaal", "Total")}: {displayTotal}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label={tt("Eiwit %", "Protein %")}>
                  <NumberInput
                    value={displayP}
                    onChange={(val) => set("macro_p_pct", val)}
                    disabled={overrideMode}
                  />
                </Field>
                <Field label={tt("Koolhydraten %", "Carbs %")}>
                  <NumberInput
                    value={displayC}
                    onChange={(val) => set("macro_c_pct", val)}
                    disabled={overrideMode}
                  />
                </Field>
                <Field label={tt("Vet %", "Fat %")}>
                  <NumberInput
                    value={displayF}
                    onChange={(val) => set("macro_f_pct", val)}
                    disabled={overrideMode}
                  />
                </Field>
              </div>
              {overrideMode && (
                <p className="text-xs text-muted-foreground">
                  {tt(
                    "Percentages worden automatisch berekend uit de handmatige grammen.",
                    "Percentages are auto-calculated from the manual gram values.",
                  )}
                </p>
              )}
            </>
          );
        })()}
        <div className="grid grid-cols-3 gap-3">
          <Stat2 label={tt("Eiwit", "Protein")} value={`${finalProtein} g · ${finalProtein * 4} kcal`} />
          <Stat2 label={tt("Koolhydraten", "Carbs")} value={`${finalCarbs} g · ${finalCarbs * 4} kcal`} />
          <Stat2 label={tt("Vet", "Fat")} value={`${finalFat} g · ${finalFat * 9} kcal`} />
        </div>
        {(() => {
          const macroKcal = finalProtein * 4 + finalCarbs * 4 + finalFat * 9;
          const diff = macroKcal - finalCalories;
          const mismatch = Math.abs(diff) > 20 && finalCalories > 0;
          return (
            <div className={`rounded-md border p-3 text-xs ${mismatch ? "border-destructive/60 bg-destructive/5" : "bg-muted/40"}`}>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {tt("Macro's → kcal", "Macros → kcal")} (P×4 + C×4 + F×9)
                </span>
                <span className="font-semibold">{macroKcal} kcal</span>
              </div>
              {mismatch && (
                <p className="text-destructive mt-1">
                  {tt(
                    `Wijkt ${diff > 0 ? "+" : ""}${diff} kcal af van doel (${finalCalories} kcal).`,
                    `Off by ${diff > 0 ? "+" : ""}${diff} kcal vs target (${finalCalories} kcal).`,
                  )}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{tt("Handmatig overschrijven", "Manual override")}</p>
            <p className="text-xs text-muted-foreground">
              {tt("Negeer berekening en gebruik eigen getallen.", "Ignore calculation and use custom numbers.")}
            </p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={overrideMode}
            onChange={(e) => set("macro_override", e.target.checked)}
          />
        </div>
        {overrideMode && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="kcal" suffix={tt("auto", "auto")}>
              <NumberInput value={finalCalories} onChange={() => {}} disabled />
            </Field>
            <Field label={tt("Eiwit (g)", "Protein (g)")}><NumberInput value={v.protein_g} onChange={(val) => set("protein_g", val)} /></Field>
            <Field label={tt("KH (g)", "Carbs (g)")}><NumberInput value={v.carbs_g} onChange={(val) => set("carbs_g", val)} /></Field>
            <Field label={tt("Vet (g)", "Fat (g)")}><NumberInput value={v.fat_g} onChange={(val) => set("fat_g", val)} /></Field>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat2 = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div className={`rounded-md border p-3 ${highlight ? "border-primary bg-primary/5" : ""}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className={`text-sm font-semibold mt-0.5 ${highlight ? "text-primary" : ""}`}>{value}</p>
  </div>
);
