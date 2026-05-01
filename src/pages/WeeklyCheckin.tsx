import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ArrowLeft, Star, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatWeekStart } from "@/lib/weeklyCheckin";
import { CronometerConnectDialog } from "@/components/CronometerConnectDialog";
import { syncCronometer } from "@/lib/cronometer";

type Form = {
  training_count: string;
  training_count_other: string;
  intensity_rpe: number | null;
  progression: number | null;
  nutrition_stars: number | null;
  nutrition_deviations: string;
  cravings: string;
  sleep_cycle: string;
  sleep_cycle_other: string;
  energy: number | null;
  soreness: number | null;
  weight_kg: string;
  waist_cm: string;
  belly_cm: string;
  hips_cm: string;
  chest_cm: string;
  arm_cm: string;
  thigh_cm: string;
  body_fat_pct: string;
  feeling: number | null;
  structure_planning: string;
  progress_feeling: string;
  obstacles: string;
  supplements_consistency: number | null;
  hydration: number | null;
  other_notes: string;
};

const empty: Form = {
  training_count: "",
  training_count_other: "",
  intensity_rpe: null,
  progression: null,
  nutrition_stars: null,
  nutrition_deviations: "",
  cravings: "",
  sleep_cycle: "",
  sleep_cycle_other: "",
  energy: null,
  soreness: null,
  weight_kg: "",
  waist_cm: "",
  belly_cm: "",
  hips_cm: "",
  chest_cm: "",
  arm_cm: "",
  thigh_cm: "",
  body_fat_pct: "",
  feeling: null,
  structure_planning: "",
  progress_feeling: "",
  obstacles: "",
  supplements_consistency: null,
  hydration: null,
  other_notes: "",
};

const MEASUREMENT_FIELDS: Array<{ key: keyof Form; label: string }> = [
  { key: "waist_cm", label: "Taille (cm)" },
  { key: "belly_cm", label: "Buik (cm)" },
  { key: "hips_cm", label: "Heup (cm)" },
  { key: "chest_cm", label: "Borst (cm)" },
  { key: "arm_cm", label: "Arm (cm)" },
  { key: "thigh_cm", label: "Bovenbeen (cm)" },
];


function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5 space-y-4">
      {title && <h2 className="font-semibold text-base">{title}</h2>}
      {children}
    </Card>
  );
}

function ScaleRow({
  leftLabel,
  rightLabel,
  value,
  onChange,
  max = 5,
}: {
  leftLabel?: string;
  rightLabel?: string;
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {Array.from({ length: max }).map((_, i) => {
          const n = i + 1;
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-11 rounded-lg border text-sm font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted active:bg-muted"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between gap-2 text-[11px] sm:text-xs text-muted-foreground leading-tight">
          <span className="flex-1">{leftLabel}</span>
          <span className="flex-1 text-right">{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

function StarRow({
  value,
  onChange,
  max = 5,
}: {
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="flex gap-1 sm:gap-2">
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        const active = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="p-1.5 -m-0.5"
            aria-label={`${n} ster`}
          >
            <Star
              className={`h-8 w-8 sm:h-7 sm:w-7 ${
                active ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function WeeklyCheckin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cronoConnected, setCronoConnected] = useState<boolean | null>(null);
  const [cronoDialogOpen, setCronoDialogOpen] = useState(false);
  const [cronoSyncing, setCronoSyncing] = useState(false);
  const [cronoSynced, setCronoSynced] = useState(false);

  const handleCronoSync = async () => {
    if (!cronoConnected) {
      setCronoDialogOpen(true);
      return;
    }
    setCronoSyncing(true);
    const res = await syncCronometer();
    setCronoSyncing(false);
    if (!res.success) {
      if (res.sessionExpired || res.error === "no_session") {
        setCronoConnected(false);
        setCronoDialogOpen(true);
        toast.error("Cronometer-sessie verlopen. Verbind opnieuw.");
        return;
      }
      toast.error(res.error || "Synchroniseren mislukt");
      return;
    }
    setCronoSynced(true);
    toast.success(
      res.upToDate
        ? "Voedingsdata is al up-to-date"
        : `Voedingsdata gesynchroniseerd (${res.daysSynced ?? 0} dagen)`,
    );
  };

  const checkCrono = async (uid: string) => {
    const { data } = await supabase
      .from("cronometer_sessions")
      .select("id")
      .eq("client_id", uid)
      .maybeSingle();
    setCronoConnected(!!data);
  };

  useEffect(() => {
    if (user) checkCrono(user.id);
  }, [user]);

  const weekStart = formatWeekStart();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("weekly_checkins")
        .select("*")
        .eq("client_id", user.id)
        .eq("week_start", weekStart)
        .maybeSingle();
      if (data) {
        setForm({
          training_count: data.training_count ?? "",
          training_count_other: data.training_count_other ?? "",
          intensity_rpe: data.intensity_rpe ?? null,
          progression: data.progression ?? null,
          nutrition_stars: data.nutrition_stars ?? null,
          nutrition_deviations: data.nutrition_deviations ?? "",
          cravings: data.cravings ?? "",
          sleep_cycle: data.sleep_cycle ?? "",
          sleep_cycle_other: data.sleep_cycle_other ?? "",
          energy: data.energy ?? null,
          soreness: data.soreness ?? null,
          weight_kg: data.weight_kg != null ? String(data.weight_kg) : "",
          waist_cm: (data.details as any)?.measurements?.waist_cm ?? "",
          belly_cm: (data.details as any)?.measurements?.belly_cm ?? "",
          hips_cm: (data.details as any)?.measurements?.hips_cm ?? "",
          chest_cm: (data.details as any)?.measurements?.chest_cm ?? "",
          arm_cm: (data.details as any)?.measurements?.arm_cm ?? "",
          thigh_cm: (data.details as any)?.measurements?.thigh_cm ?? "",
          body_fat_pct: data.body_fat_pct != null ? String(data.body_fat_pct) : "",
          feeling: data.feeling ?? null,
          structure_planning: data.structure_planning ?? "",
          progress_feeling: data.progress_feeling ?? "",
          obstacles: data.obstacles ?? "",
          supplements_consistency: data.supplements_consistency ?? null,
          hydration: data.hydration ?? null,
          other_notes: data.other_notes ?? "",
        });
      }
      setLoading(false);
    })();
  }, [user, weekStart]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      client_id: user.id,
      week_start: weekStart,
      submitted_at: new Date().toISOString(),
      training_count: form.training_count || null,
      training_count_other: form.training_count_other || null,
      intensity_rpe: form.intensity_rpe,
      progression: form.progression,
      nutrition_stars: form.nutrition_stars,
      nutrition_deviations: form.nutrition_deviations || null,
      cravings: form.cravings || null,
      sleep_cycle: form.sleep_cycle || null,
      sleep_cycle_other: form.sleep_cycle_other || null,
      energy: form.energy,
      soreness: form.soreness,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      measurements: form.measurements || null,
      body_fat_pct: form.body_fat_pct ? Number(form.body_fat_pct) : null,
      feeling: form.feeling,
      structure_planning: form.structure_planning || null,
      progress_feeling: form.progress_feeling || null,
      obstacles: form.obstacles || null,
      supplements_consistency: form.supplements_consistency,
      hydration: form.hydration,
      other_notes: form.other_notes || null,
    };
    const { error } = await supabase
      .from("weekly_checkins")
      .upsert(payload, { onConflict: "client_id,week_start" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    localStorage.setItem(`checkin-submitted-${weekStart}`, new Date().toISOString());
    toast.success("Bedankt! Je check-in is opgeslagen.");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6 max-w-2xl">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>

      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Wekelijkse check-in</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vul in hoe je week is verlopen. Alle vragen zijn optioneel.
        </p>
      </div>

      <div className="space-y-4">
        {/* TRAINING */}
        <Section title="Training">
          <div className="space-y-2">
            <Label>Aantal (kracht)trainingen deze week (gelukt)</Label>
            <RadioGroup
              value={form.training_count}
              onValueChange={(v) => set("training_count", v)}
              className="space-y-1.5"
            >
              {["1x", "2x", "3x", "4x", "5x", "6x"].map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem id={`tc-${opt}`} value={opt} />
                  <Label htmlFor={`tc-${opt}`} className="font-normal">
                    {opt}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2 flex-wrap">
                <RadioGroupItem id="tc-other" value="anders" />
                <Label htmlFor="tc-other" className="font-normal">
                  Anders:
                </Label>
                <Input
                  value={form.training_count_other}
                  onChange={(e) => set("training_count_other", e.target.value)}
                  className="flex-1 min-w-[140px]"
                  disabled={form.training_count !== "anders"}
                />
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2 pt-2">
            <Label>Ervaren intensiteit (RIR/RPE) – was het zwaar genoeg?</Label>
            <ScaleRow
              leftLabel="Pussy stopt bij 9 ;)"
              rightLabel="Helemaal tot failure"
              value={form.intensity_rpe}
              onChange={(v) => set("intensity_rpe", v)}
            />
          </div>

          <div className="space-y-2 pt-2">
            <Label>Was er sprake van progressie of stagnatie?</Label>
            <ScaleRow
              leftLabel="Achteruitgang"
              rightLabel="Progressie"
              value={form.progression}
              onChange={(v) => set("progression", v)}
            />
          </div>
        </Section>

        {/* VOEDING */}
        <Section title="Voeding">
          <div className="space-y-2">
            <Label>Hoe goed heb je het voedingsschema gevolgd?</Label>
            <StarRow value={form.nutrition_stars} onChange={(v) => set("nutrition_stars", v)} />
          </div>
          <div className="space-y-2">
            <Label>Afwijkingen waar ik van moet weten? (sociale events, cheatmeals etc.)</Label>
            <Textarea
              value={form.nutrition_deviations}
              onChange={(e) => set("nutrition_deviations", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Eventuele trek, energiedips of cravings?</Label>
            <Textarea
              value={form.cravings}
              onChange={(e) => set("cravings", e.target.value)}
              rows={2}
            />
          </div>
          <div className="pt-4 mt-2 border-t space-y-3">
            <div className="space-y-1">
              <Label className="block text-sm font-medium">Wekelijks voedingsoverzicht</Label>
              <p className="text-xs text-muted-foreground">
                Eén klik haalt automatisch je laatste voedingsdata uit Cronometer op.
              </p>
            </div>
            {cronoSynced ? (
              <Button type="button" variant="outline" disabled className="w-full sm:w-auto gap-2">
                <Check className="h-4 w-4 text-primary" />
                Voedingsoverzicht gelogd
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={handleCronoSync}
                disabled={cronoSyncing}
                className="w-full sm:w-auto gap-2"
              >
                {cronoSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Log wekelijks voedingsoverzicht
              </Button>
            )}
          </div>
        </Section>

        {/* HERSTEL & SLAAP */}
        <Section title="Herstel en slaap">
          <div className="space-y-2">
            <Label>Resultaten uit Sleep cycle</Label>
            <RadioGroup
              value={form.sleep_cycle}
              onValueChange={(v) => set("sleep_cycle", v)}
              className="space-y-1.5"
            >
              {["60-70%", "70-80%", "80-90%", "90-100%"].map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <RadioGroupItem id={`sc-${opt}`} value={opt} />
                  <Label htmlFor={`sc-${opt}`} className="font-normal">
                    Gemiddeld tussen {opt}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2 flex-wrap">
                <RadioGroupItem id="sc-other" value="anders" />
                <Label htmlFor="sc-other" className="font-normal">
                  Anders:
                </Label>
                <Input
                  value={form.sleep_cycle_other}
                  onChange={(e) => set("sleep_cycle_other", e.target.value)}
                  className="flex-1 min-w-[140px]"
                  disabled={form.sleep_cycle !== "anders"}
                />
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2 pt-2">
            <Label>Energie overdag?</Label>
            <ScaleRow
              leftLabel="Slecht"
              rightLabel="Heel goed"
              value={form.energy}
              onChange={(v) => set("energy", v)}
            />
          </div>
          <div className="space-y-2 pt-2">
            <Label>Spierpijn of tekenen van overbelasting?</Label>
            <ScaleRow
              leftLabel="Heel veel spierpijn"
              rightLabel="Helemaal hersteld"
              value={form.soreness}
              onChange={(v) => set("soreness", v)}
            />
          </div>
        </Section>

        {/* LICHAAM */}
        <Section title="Lichaam">
          <div className="space-y-2">
            <Label>Gemiddeld gewicht afgelopen week (kg)</Label>
            <Input
              inputMode="decimal"
              value={form.weight_kg}
              onChange={(e) => set("weight_kg", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Metingen (heup, buik, taille)</Label>
            <Input
              value={form.measurements}
              onChange={(e) => set("measurements", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Vetpercentage (indien bekend)</Label>
            <Input
              inputMode="decimal"
              value={form.body_fat_pct}
              onChange={(e) => set("body_fat_pct", e.target.value)}
            />
          </div>
        </Section>

        {/* MENTALE STAAT */}
        <Section title="Mentale staat">
          <div className="space-y-2">
            <Label>Hoe voel je deze week? (motivatie, stress, focus)</Label>
            <ScaleRow
              leftLabel="Slecht"
              rightLabel="Goed"
              value={form.feeling}
              onChange={(v) => set("feeling", v)}
            />
          </div>
          <div className="space-y-2">
            <Label>Hoe zit het met structuur, planning?</Label>
            <Textarea
              value={form.structure_planning}
              onChange={(e) => set("structure_planning", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Heb je het gevoel dat je progressie maakt?</Label>
            <Textarea
              value={form.progress_feeling}
              onChange={(e) => set("progress_feeling", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Zijn er belemmeringen of obstakels geweest?</Label>
            <Textarea
              value={form.obstacles}
              onChange={(e) => set("obstacles", e.target.value)}
              rows={2}
            />
          </div>
        </Section>

        {/* SUPPLEMENTEN & OVERIG */}
        <Section title="Supplementen & overige factoren">
          <div className="space-y-2">
            <Label>Supplementen consistent gebruikt?</Label>
            <ScaleRow
              leftLabel="Slecht op en af"
              rightLabel="Elke dag consistent"
              value={form.supplements_consistency}
              onChange={(v) => set("supplements_consistency", v)}
            />
          </div>
          <div className="space-y-2">
            <Label>Hydratatie</Label>
            <ScaleRow
              leftLabel="Slecht"
              rightLabel="Elke dag minimaal geadviseerd"
              value={form.hydration}
              onChange={(v) => set("hydration", v)}
            />
          </div>
          <div className="space-y-2">
            <Label>Overige zaken waar ik op de hoogte van moet zijn</Label>
            <Textarea
              value={form.other_notes}
              onChange={(e) => set("other_notes", e.target.value)}
              rows={3}
            />
          </div>
        </Section>

        <div className="pt-2 pb-8 sticky bottom-0 sm:static bg-background sm:bg-transparent -mx-3 px-3 sm:mx-0 sm:px-0 border-t sm:border-0 pt-3 sm:pt-2">
          <Button onClick={submit} disabled={saving} size="lg" className="w-full sm:w-auto sm:ml-auto sm:flex">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verstuur check-in
          </Button>
        </div>
      </div>
      <CronometerConnectDialog
        open={cronoDialogOpen}
        onOpenChange={setCronoDialogOpen}
        onConnected={() => user && checkCrono(user.id)}
      />
    </div>
  );
}
