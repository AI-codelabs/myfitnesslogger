import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Lang } from "@/lib/onboardingSchema";

type Props = {
  clientId: string;
  coachId: string;
  lang: Lang;
  prefill?: Record<string, any>;
  existing?: any | null;
  onCompleted?: () => void;
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
      age: age === "" ? null : Number(age),
      height_cm: height_cm === "" ? null : Number(height_cm),
      weight_kg: weight_kg === "" ? null : Number(weight_kg),
      details: rest,
    };
    if (markCompleted) row.completed_at = new Date().toISOString();
    const { error } = await supabase
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

  const finish = async () => {
    if (!(await persist(true))) return;
    toast.success(t("Voedingsschema opgeslagen", "Nutrition plan saved", lang));
    onCompleted?.();
  };

  // Step header (numbered chips)
  const Header = (
    <div className="flex items-center justify-between gap-2 mb-6 overflow-x-auto">
      {labels.map((l, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={l} className="flex items-center gap-2 shrink-0">
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
          </div>
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

      {step === 4 && (
        <div className="text-center py-6 space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <Check className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">
            {t("Alles ingevuld!", "All set!", lang)}
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t(
              "Klik op opslaan om het voedingsschema te bewaren. Je kunt het later altijd nog aanpassen.",
              "Click save to store the nutrition plan. You can edit it later anytime.",
              lang,
            )}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t">
        <Button variant="outline" onClick={prev} disabled={step === 0 || saving} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          {t("Terug", "Back", lang)}
        </Button>
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
}: {
  value: any;
  onChange: (v: string) => void;
}) => (
  <Input
    type="number"
    inputMode="decimal"
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value)}
    onWheel={(e) => e.currentTarget.blur()}
    className="h-11"
  />
);
