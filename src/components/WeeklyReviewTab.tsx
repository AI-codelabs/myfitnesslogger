import { invokeFn } from "@/lib/api/fn";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Sparkles,
  Mic,
  Copy,
  Save,
  Send,
  Plus,
  Trash2,
  MessageSquare,
  ClipboardCheck,
  Activity,
  Apple,
  Dumbbell,
  TrendingUp,
  Check,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Lang } from "@/lib/onboardingSchema";
import { formatHumanDate } from "@/lib/weeklyCheckin";
import { pushTargetsToCronometer, cronometerPushSuccessCopy } from "@/lib/cronometerTargets";
import { db } from "@/lib/db";

interface Props {
  clientId: string;
  coachId: string;
  lang: Lang;
}

interface NutritionAdj {
  calories_delta: number;
  protein_delta: number;
  carbs_delta: number;
  fat_delta: number;
  rationale: string;
}

interface TrainingAdj {
  focus: string;
  change: string;
  rationale: string;
}

interface SuggestedAdjustments {
  nutrition: NutritionAdj;
  training: TrainingAdj[];
}

interface Insights {
  week_start?: string;
  workouts?: { sessions_completed: number; sessions_partial?: number; sessions_not_completed?: number; sessions_planned: number; adherence_pct: number };
  progression?: {
    exercises_improved: number;
    exercises_regressed: number;
    notable: Array<{ name: string; change: string }>;
  };
  nutrition?: {
    days_logged: number;
    avg_calories: number;
    avg_protein_g: number;
    avg_carbs_g: number;
    avg_fat_g: number;
    target_calories: number | null;
    target_protein_g: number | null;
    target_carbs_g: number | null;
    target_fat_g: number | null;
    calorie_adherence_pct: number | null;
    protein_adherence_pct: number | null;
  };
  body?: {
    weight_kg_current: number | null;
    weight_kg_previous: number | null;
    weight_change_kg: number | null;
  };
}

interface Draft {
  id: string;
  week_start: string;
  voice_memo: string;
  client_positive: string[];
  client_attention: string[];
  client_actions: string[];
  suggested_adjustments: SuggestedAdjustments | Record<string, never>;
  insights: Insights | Record<string, never>;
  generated_at: string | null;
  published_at: string | null;
  applied_to_nutrition_at: string | null;
  voice_memo_recorded_at: string | null;
}

const tx = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

const emptyAdj: SuggestedAdjustments = {
  nutrition: {
    calories_delta: 0,
    protein_delta: 0,
    carbs_delta: 0,
    fat_delta: 0,
    rationale: "",
  },
  training: [],
};

export function WeeklyReviewTab({ clientId, coachId, lang }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  // editable fields
  const [voice, setVoice] = useState("");
  const [positive, setPositive] = useState<string[]>([]);
  const [attention, setAttention] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [adjustments, setAdjustments] = useState<SuggestedAdjustments>(emptyAdj);

  const selected = useMemo(
    () => drafts.find((d) => d.id === selectedId) ?? null,
    [drafts, selectedId],
  );

  const loadDrafts = async () => {
    setLoading(true);
    const { data } = await db.from("weekly_review_drafts")
      .select("*")
      .eq("client_id", clientId)
      .eq("coach_id", coachId)
      .order("week_start", { ascending: false });
    const list = (data ?? []) as unknown as Draft[];
    setDrafts(list);
    if (list.length > 0 && !selectedId) {
      setSelectedId(list[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, coachId]);

  // Sync editor state when selection changes
  useEffect(() => {
    if (!selected) {
      setVoice("");
      setPositive([]);
      setAttention([]);
      setActions([]);
      setAdjustments(emptyAdj);
      return;
    }
    setVoice(selected.voice_memo ?? "");
    setPositive(selected.client_positive ?? []);
    setAttention(selected.client_attention ?? []);
    setActions(selected.client_actions ?? []);
    const adj = selected.suggested_adjustments as SuggestedAdjustments;
    setAdjustments({
      nutrition: {
        calories_delta: adj?.nutrition?.calories_delta ?? 0,
        protein_delta: adj?.nutrition?.protein_delta ?? 0,
        carbs_delta: adj?.nutrition?.carbs_delta ?? 0,
        fat_delta: adj?.nutrition?.fat_delta ?? 0,
        rationale: adj?.nutrition?.rationale ?? "",
      },
      training: Array.isArray(adj?.training) ? adj.training : [],
    });
  }, [selected?.id]);

  // Auto-save edits (debounced) so coach work survives navigation.
  // Only saves drafts that have already been generated at least once,
  // to avoid creating empty drafts.
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  useEffect(() => {
    if (!selected || !selected.generated_at) return;
    // Skip if nothing has been loaded into editor yet
    const handle = setTimeout(async () => {
      const payload: any = {
        voice_memo: voice,
        client_positive: positive.filter((s) => s.trim()),
        client_attention: attention.filter((s) => s.trim()),
        client_actions: actions.filter((s) => s.trim()),
        suggested_adjustments: adjustments,
      };
      const { error } = await db.from("weekly_review_drafts")
        .update(payload)
        .eq("id", selected.id);
      if (!error) setAutoSavedAt(new Date().toISOString());
    }, 1200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice, positive, attention, actions, adjustments, selected?.id]);


  const generate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const { data, error } = await invokeFn("generate-weekly-review", {
        body: { clientId, weekStart: selected.week_start },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const nextPositive = data.client_positive ?? [];
      const nextAttention = data.client_attention ?? [];
      const nextActions = data.client_actions ?? [];
      const nextAdjustments = {
        nutrition: {
          calories_delta: data.suggested_adjustments?.nutrition?.calories_delta ?? 0,
          protein_delta: data.suggested_adjustments?.nutrition?.protein_delta ?? 0,
          carbs_delta: data.suggested_adjustments?.nutrition?.carbs_delta ?? 0,
          fat_delta: data.suggested_adjustments?.nutrition?.fat_delta ?? 0,
          rationale: data.suggested_adjustments?.nutrition?.rationale ?? "",
        },
        training: Array.isArray(data.suggested_adjustments?.training)
          ? data.suggested_adjustments.training
          : [],

      };
      setVoice(data.voice_memo ?? "");
      setPositive(nextPositive);
      setAttention(nextAttention);
      setActions(nextActions);
      setAdjustments(nextAdjustments);
      // Persist ALL generated content immediately so the coach never loses it
      // when navigating away before manually saving.
      const persistPayload: any = {
        voice_memo: data.voice_memo ?? "",
        client_positive: nextPositive,
        client_attention: nextAttention,
        client_actions: nextActions,
        suggested_adjustments: nextAdjustments,
        insights: data.insights ?? {},
        generated_at: new Date().toISOString(),
      };
      await db.from("weekly_review_drafts")
        .update(persistPayload)
        .eq("id", selected.id);
      toast.success(tx(lang, "Review gegenereerd", "Review generated"));
      loadDrafts();
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const save = async (publish: boolean) => {
    if (!selected) return;
    setSaving(true);
    const payload: any = {
      voice_memo: voice,
      client_positive: positive.filter((s) => s.trim()),
      client_attention: attention.filter((s) => s.trim()),
      client_actions: actions.filter((s) => s.trim()),
      suggested_adjustments: adjustments,
      generated_at: selected.generated_at ?? new Date().toISOString(),
    };
    if (publish) {
      payload.published_at = new Date().toISOString();
      // Auto-mark the voice memo as recorded on publish — coaches asked to skip
      // the manual toggle when the bullets go live.
      if (!selected.voice_memo_recorded_at) {
        payload.voice_memo_recorded_at = new Date().toISOString();
      }
    }
    const { error } = await db.from("weekly_review_drafts")
      .update(payload)
      .eq("id", selected.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(
      publish
        ? tx(lang, "Review gepubliceerd voor klant", "Review published to client")
        : tx(lang, "Concept opgeslagen", "Draft saved"),
    );
    loadDrafts();
  };

  const applyNutrition = async () => {
    if (!selected) return;
    const delta = adjustments.nutrition;
    if (
      delta.calories_delta === 0 &&
      delta.protein_delta === 0 &&
      delta.carbs_delta === 0 &&
      delta.fat_delta === 0
    ) {
      toast.info(tx(lang, "Geen aanpassingen om toe te passen", "No deltas to apply"));
      return;
    }
    setApplying(true);
    const { data: plan } = await db
      .from("nutrition_plans")
      .select("id, details")
      .eq("client_id", clientId)
      .maybeSingle();
    if (!plan) {
      setApplying(false);
      return toast.error(tx(lang, "Geen voedingsplan gevonden", "No nutrition plan found"));
    }
    const det = (plan.details as any) ?? {};
    const next = {
      ...det,
      calories: Math.max(0, Number(det.calories ?? 0) + delta.calories_delta),
      protein_g: Math.max(0, Number(det.protein_g ?? 0) + delta.protein_delta),
      carbs_g: Math.max(0, Number(det.carbs_g ?? 0) + delta.carbs_delta),
      fat_g: Math.max(0, Number(det.fat_g ?? 0) + delta.fat_delta),
    };
    const { error } = await db
      .from("nutrition_plans")
      .update({ details: next })
      .eq("id", plan.id);
    if (!error) {
      await db.from("weekly_review_drafts")
        .update({ applied_to_nutrition_at: new Date().toISOString() })
        .eq("id", selected.id);
    }
    setApplying(false);
    if (error) return toast.error(error.message);
    toast.success(tx(lang, "Voedingsplan bijgewerkt", "Nutrition plan updated"));
    // Push updated targets to client's Cronometer (no-op if not opted in)
    const res = await pushTargetsToCronometer({
      client_id: clientId,
      calories: Number(next.calories) || 0,
      protein_g: Number(next.protein_g) || 0,
      carbs_g: Number(next.carbs_g) || 0,
      fat_g: Number(next.fat_g) || 0,
    });
    if (res.success) {
      toast.success(cronometerPushSuccessCopy(lang === "nl"), { duration: 8000 });
    } else if (res.error) {
      toast.error(tx(lang, `Cronometer-sync mislukt: ${res.error}`, `Cronometer sync failed: ${res.error}`));
    }
    loadDrafts();
  };

  const copyVoice = () => {
    navigator.clipboard.writeText(voice);
    toast.success(tx(lang, "Gekopieerd", "Copied"));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <Card className="p-10 text-center">
        <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium">
          {tx(lang, "Nog geen reviews", "No reviews yet")}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {tx(
            lang,
            "Zodra deze klant een wekelijkse check-in invult verschijnt hier een concept om te reviewen.",
            "As soon as this client submits a weekly check-in, a draft will appear here for you to review.",
          )}
        </p>
      </Card>
    );
  }

  const empty = selected
    ? !selected.generated_at && !voice && positive.length === 0
    : true;

  return (
    <div className="space-y-4">
      {/* Header: week selector + generate */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {tx(lang, "Wekelijkse review", "Weekly review")}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              {tx(
                lang,
                "AI-gegenereerd op basis van check-in, trainingen, voeding en gewichtsverloop. Review en pas aan voor publicatie.",
                "AI-generated from the check-in, workouts, nutrition and weight trend. Review and edit before publishing.",
              )}
            </p>
            {selected && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>
                  {tx(lang, "Week van", "Week of")}{" "}
                  <strong className="text-foreground">
                    {formatHumanDate(selected.week_start, lang)}
                  </strong>
                </span>
                {selected.generated_at && (
                  <span>
                    · {tx(lang, "gegenereerd", "generated")}{" "}
                    {new Date(selected.generated_at).toLocaleString()}
                  </span>
                )}
                {autoSavedAt && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    · {tx(lang, "automatisch opgeslagen", "auto-saved")}{" "}
                    {new Date(autoSavedAt).toLocaleTimeString()}
                  </span>
                )}
                {selected.published_at ? (
                  <Badge variant="secondary">{tx(lang, "Gepubliceerd", "Published")}</Badge>
                ) : selected.generated_at ? (
                  <Badge variant="outline">{tx(lang, "Concept", "Draft")}</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400">
                    {tx(lang, "Nog niet gegenereerd", "Not generated yet")}
                  </Badge>
                )}
                {selected.applied_to_nutrition_at && (
                  <Badge variant="secondary" className="gap-1">
                    <Check className="h-3 w-3" />
                    {tx(lang, "Voeding aangepast", "Nutrition applied")}
                  </Badge>
                )}
                {selected.voice_memo_recorded_at && (
                  <Badge variant="secondary" className="gap-1">
                    <Mic className="h-3 w-3" />
                    {tx(lang, "Spraakmemo opgenomen", "Voice memo recorded")}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {drafts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {formatHumanDate(d.week_start, lang)}
                    {d.published_at ? " · ✓" : d.generated_at ? " · 📝" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={generate} disabled={generating} className="gap-2">
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {empty
                ? tx(lang, "Genereer", "Generate")
                : tx(lang, "Opnieuw genereren", "Regenerate")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Insights panel */}
      {selected?.insights && Object.keys(selected.insights).length > 0 && (
        <InsightsPanel insights={selected.insights as Insights} lang={lang} />
      )}

      {(voice || !empty) && (
        <>
          {/* Voice memo */}
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Mic className="h-4 w-4" />
                {tx(lang, "Spraakmemo (alleen voor coach)", "Voice memo (coach only)")}
              </h3>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={selected.voice_memo_recorded_at ? "secondary" : "outline"}
                  size="sm"
                  onClick={async () => {
                    const value = selected.voice_memo_recorded_at ? null : new Date().toISOString();
                    const { error } = await db.from("weekly_review_drafts")
                      .update({ voice_memo_recorded_at: value })
                      .eq("id", selected.id);
                    if (error) return toast.error(error.message);
                    toast.success(
                      value
                        ? tx(lang, "Spraakmemo gemarkeerd", "Voice memo marked")
                        : tx(lang, "Markering ongedaan", "Mark removed"),
                    );
                    loadDrafts();
                  }}
                  className="gap-1.5 h-8"
                >
                  <Check className="h-3.5 w-3.5" />
                  {selected.voice_memo_recorded_at
                    ? tx(lang, "Opgenomen", "Recorded")
                    : tx(lang, "Markeer opgenomen", "Mark recorded")}
                </Button>
                <Button variant="ghost" size="sm" onClick={copyVoice} className="gap-1.5 h-8">
                  <Copy className="h-3.5 w-3.5" />
                  {tx(lang, "Kopieer", "Copy")}
                </Button>
              </div>
            </div>
            <Textarea
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder={tx(lang, "Spraakmemo tekst…", "Voice memo script…")}
              className="min-h-[260px] text-sm leading-relaxed"
            />
          </Card>

          {/* Suggested adjustments */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  {tx(lang, "Voorgestelde aanpassingen", "Suggested adjustments")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {tx(
                    lang,
                    "Pas indien nodig aan en pas direct toe op het voedingsplan.",
                    "Edit if needed and apply directly to the nutrition plan.",
                  )}
                </p>
              </div>
            </div>

            {/* Nutrition deltas */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-medium text-sm flex items-center gap-2">
                  <Apple className="h-4 w-4 text-emerald-500" />
                  {tx(lang, "Voeding", "Nutrition")}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyNutrition}
                  disabled={applying}
                  className="gap-1.5 h-8"
                >
                  {applying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {tx(lang, "Pas toe op voedingsplan", "Apply to nutrition plan")}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <DeltaInput
                  label={tx(lang, "Calorieën Δ", "Calories Δ")}
                  unit="kcal"
                  value={adjustments.nutrition.calories_delta}
                  onChange={(v) =>
                    setAdjustments({
                      ...adjustments,
                      nutrition: { ...adjustments.nutrition, calories_delta: v },
                    })
                  }
                />
                <DeltaInput
                  label={tx(lang, "Eiwit Δ", "Protein Δ")}
                  unit="g"
                  value={adjustments.nutrition.protein_delta}
                  onChange={(v) =>
                    setAdjustments({
                      ...adjustments,
                      nutrition: { ...adjustments.nutrition, protein_delta: v },
                    })
                  }
                />
                <DeltaInput
                  label={tx(lang, "Koolhydr. Δ", "Carbs Δ")}
                  unit="g"
                  value={adjustments.nutrition.carbs_delta}
                  onChange={(v) =>
                    setAdjustments({
                      ...adjustments,
                      nutrition: { ...adjustments.nutrition, carbs_delta: v },
                    })
                  }
                />
                <DeltaInput
                  label={tx(lang, "Vet Δ", "Fat Δ")}
                  unit="g"
                  value={adjustments.nutrition.fat_delta}
                  onChange={(v) =>
                    setAdjustments({
                      ...adjustments,
                      nutrition: { ...adjustments.nutrition, fat_delta: v },
                    })
                  }
                />
              </div>
              <Textarea
                value={adjustments.nutrition.rationale}
                onChange={(e) =>
                  setAdjustments({
                    ...adjustments,
                    nutrition: { ...adjustments.nutrition, rationale: e.target.value },
                  })
                }
                placeholder={tx(lang, "Toelichting…", "Rationale…")}
                rows={2}
                className="text-sm"
              />
            </div>

            {/* Training */}
            <div className="space-y-3 rounded-lg border p-4">
              <p className="font-medium text-sm flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" />
                {tx(lang, "Training", "Training")}
              </p>
              {adjustments.training.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  {tx(lang, "Geen voorgestelde aanpassingen.", "No suggested changes.")}
                </p>
              ) : (
                <div className="space-y-2">
                  {adjustments.training.map((t, idx) => (
                    <div key={idx} className="grid sm:grid-cols-[140px,1fr,auto] gap-2 items-start">
                      <Input
                        value={t.focus}
                        onChange={(e) => {
                          const next = [...adjustments.training];
                          next[idx] = { ...t, focus: e.target.value };
                          setAdjustments({ ...adjustments, training: next });
                        }}
                        placeholder={tx(lang, "Dag/oefening", "Day/exercise")}
                      />
                      <div className="space-y-1">
                        <Input
                          value={t.change}
                          onChange={(e) => {
                            const next = [...adjustments.training];
                            next[idx] = { ...t, change: e.target.value };
                            setAdjustments({ ...adjustments, training: next });
                          }}
                          placeholder={tx(lang, "Aanpassing", "Change")}
                        />
                        <Input
                          value={t.rationale}
                          onChange={(e) => {
                            const next = [...adjustments.training];
                            next[idx] = { ...t, rationale: e.target.value };
                            setAdjustments({ ...adjustments, training: next });
                          }}
                          placeholder={tx(lang, "Toelichting", "Rationale")}
                          className="text-xs"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setAdjustments({
                            ...adjustments,
                            training: adjustments.training.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 h-8 text-muted-foreground"
                onClick={() =>
                  setAdjustments({
                    ...adjustments,
                    training: [
                      ...adjustments.training,
                      { focus: "", change: "", rationale: "" },
                    ],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {tx(lang, "Aanpassing toevoegen", "Add adjustment")}
              </Button>
            </div>
          </Card>

          {/* Bullets */}
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                {tx(lang, "Bericht voor klant", "Client message")}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {tx(
                  lang,
                  "Deze bullets vervangen het startbericht en verschijnen op het dashboard van de klant.",
                  "These bullets replace the start message on the client dashboard.",
                )}
              </p>
            </div>
            <BulletEditor
              label={tx(lang, "✅ Positief", "✅ Positive")}
              items={positive}
              onChange={setPositive}
              lang={lang}
            />
            <BulletEditor
              label={tx(lang, "⚠️ Aandachtspunten", "⚠️ Attention points")}
              items={attention}
              onChange={setAttention}
              lang={lang}
            />
            <BulletEditor
              label={tx(lang, "🎯 Actiepunten", "🎯 Action points")}
              items={actions}
              onChange={setActions}
              lang={lang}
            />
          </Card>

          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Button variant="outline" onClick={() => save(false)} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {tx(lang, "Concept opslaan", "Save draft")}
            </Button>
            <Button onClick={() => save(true)} disabled={saving} className="gap-2">
              <Send className="h-4 w-4" />
              {tx(lang, "Publiceren naar klant", "Publish to client")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InsightsPanel({ insights, lang }: { insights: Insights; lang: Lang }) {
  const w = insights.workouts;
  const n = insights.nutrition;
  const b = insights.body;
  const p = insights.progression;

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        {tx(lang, "Inzichten (laatste 7 dagen)", "Insights (last 7 days)")}
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {w && (
          <Stat
            icon={Dumbbell}
            label={tx(lang, "Trainingen", "Workouts")}
            value={`${w.sessions_completed}/${w.sessions_planned}`}
            sub={`${w.adherence_pct}% ${tx(lang, "adherence", "adherence")}${
              (w.sessions_partial ?? 0) > 0
                ? ` · ${w.sessions_partial} ${tx(lang, "deels", "partial")}`
                : ""
            }`}
            tone={w.adherence_pct >= 80 ? "good" : w.adherence_pct >= 50 ? "warn" : "bad"}
          />
        )}
        {n && (
          <Stat
            icon={Apple}
            label={tx(lang, "Calorieën", "Calories")}
            value={`${Math.round(n.avg_calories)} kcal`}
            sub={
              n.calorie_adherence_pct != null
                ? `${n.calorie_adherence_pct}% ${tx(lang, "van target", "of target")} · ${n.days_logged} ${tx(lang, "dag(en) gelogd", "day(s) logged")}`
                : `${n.days_logged} ${tx(lang, "dag(en) gelogd", "day(s) logged")}`
            }
            tone={
              n.calorie_adherence_pct == null
                ? "neutral"
                : Math.abs(n.calorie_adherence_pct - 100) <= 10
                  ? "good"
                  : Math.abs(n.calorie_adherence_pct - 100) <= 20
                    ? "warn"
                    : "bad"
            }
          />
        )}
        {n && (
          <Stat
            icon={TrendingUp}
            label={tx(lang, "Eiwit", "Protein")}
            value={`${Math.round(n.avg_protein_g)} g`}
            sub={
              n.protein_adherence_pct != null
                ? `${n.protein_adherence_pct}% ${tx(lang, "van target", "of target")}`
                : ""
            }
            tone={
              n.protein_adherence_pct == null
                ? "neutral"
                : n.protein_adherence_pct >= 90
                  ? "good"
                  : n.protein_adherence_pct >= 70
                    ? "warn"
                    : "bad"
            }
          />
        )}
        {b && (
          <Stat
            icon={Activity}
            label={tx(lang, "Gewicht", "Weight")}
            value={b.weight_kg_current ? `${b.weight_kg_current} kg` : "—"}
            sub={
              b.weight_change_kg !== null && b.weight_change_kg !== undefined
                ? `${b.weight_change_kg > 0 ? "+" : ""}${b.weight_change_kg} kg`
                : tx(lang, "geen vergelijking", "no comparison")
            }
            tone="neutral"
          />
        )}
      </div>

      {p && (p.notable?.length ?? 0) > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
            {tx(lang, "Progressie hoogtepunten", "Progression highlights")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {p.notable.map((it, i) => (
              <Badge
                key={i}
                variant="outline"
                className={
                  it.change.startsWith("-")
                    ? "border-destructive/40 text-destructive"
                    : "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                }
              >
                {it.name} · {it.change}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "bad"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className={`text-xs ${toneClass}`}>{sub}</p>}
    </div>
  );
}

function DeltaInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-9"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

function BulletEditor({
  label,
  items,
  onChange,
  lang,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  lang: Lang;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={it}
              onChange={(e) => {
                const next = [...items];
                next[idx] = e.target.value;
                onChange(next);
              }}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8 text-muted-foreground"
          onClick={() => onChange([...items, ""])}
        >
          <Plus className="h-3.5 w-3.5" />
          {tx(lang, "Punt toevoegen", "Add bullet")}
        </Button>
      </div>
    </div>
  );
}
