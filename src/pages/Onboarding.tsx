import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Loader2, ChevronLeft, ChevronRight, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  arrayColumns,
  booleanColumns,
  Field,
  Lang,
  numericColumns,
  onboardingSections,
  t,
} from "@/lib/onboardingSchema";

type Values = Record<string, any>;

const Onboarding = () => {
  const { user, refreshOnboarding } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("onbLang") as Lang) || "nl");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    localStorage.setItem("onbLang", lang);
  }, [lang]);

  // Pre-fill name from auth (legacy display_name) -> seed first_name when possible
  useEffect(() => {
    if (!user) return;
    setValues((v) => {
      if (v.first_name) return v;
      const dn = (user.user_metadata?.display_name as string | undefined)?.trim();
      if (!dn) return v;
      const sp = dn.indexOf(" ");
      return {
        ...v,
        first_name: sp === -1 ? dn : dn.slice(0, sp),
        last_name: sp === -1 ? "" : dn.slice(sp + 1),
      };
    });
  }, [user]);

  const sections = onboardingSections;
  const current = sections[step];
  const progress = ((step + 1) / sections.length) * 100;

  const setField = (name: string, value: any) =>
    setValues((v) => ({ ...v, [name]: value }));

  const validateStep = (): boolean => {
    for (const f of current.fields) {
      if (f.optional) continue;
      const v = values[f.name];
      if (f.type === "checkbox-group") {
        if (!Array.isArray(v) || v.length === 0) {
          toast.error(`${t(f.label, lang)} ${lang === "nl" ? "is verplicht" : "is required"}`);
          return false;
        }
        continue;
      }
      if (f.type === "boolean") {
        if (typeof v !== "boolean") {
          toast.error(`${t(f.label, lang)} ${lang === "nl" ? "is verplicht" : "is required"}`);
          return false;
        }
        continue;
      }
      if (v === undefined || v === null || v === "") {
        toast.error(`${t(f.label, lang)} ${lang === "nl" ? "is verplicht" : "is required"}`);
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, sections.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const prev = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadFile = async (fieldName: string, file: File) => {
    if (!user) return;
    setUploading(fieldName);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${fieldName}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("onboarding-uploads")
      .upload(path, file, { upsert: true });
    setUploading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setField(fieldName, path);
    toast.success(lang === "nl" ? "Geüpload" : "Uploaded");
  };

  const submit = async () => {
    if (!user) return;
    if (!validateStep()) return;
    setSubmitting(true);

    const row: Values = { user_id: user.id, completed_at: new Date().toISOString() };
    const details: Values = {};
    for (const sec of sections) {
      for (const f of sec.fields) {
        const v = values[f.name];
        if (v === undefined || v === null || v === "") continue;
        if (f.storeIn === "details") {
          details[f.name] = v;
          continue;
        }
        if (f.type === "image-front-side-back") continue;
        row[f.name] = numericColumns.has(f.name) ? Number(v) : v;
      }
    }

    // Derive legacy fields for AI/back-compat
    const firstName = (values.first_name as string | undefined)?.trim() || null;
    const lastName = (values.last_name as string | undefined)?.trim() || null;
    if (firstName || lastName) {
      row.full_name = [firstName, lastName].filter(Boolean).join(" ");
    }
    // Map new goal_type back to legacy primary_goal slug
    const goalType = values.goal_type as string | undefined;
    if (goalType) {
      row.primary_goal = goalType === "bulk" ? "muscle" : goalType === "maintain" ? "energy" : goalType === "custom" ? "combo" : goalType;
    }
    row.details = details;

    const { error } = await supabase
      .from("onboarding_responses")
      .upsert(row as any, { onConflict: "user_id" });

    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }

    // Write first/last name to profiles (used by all coach UI)
    if (firstName || lastName) {
      await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          display_name: [firstName, lastName].filter(Boolean).join(" ") || undefined,
        })
        .eq("user_id", user.id);
    }

    // Create the first active client_goals row from onboarding answers
    if (goalType) {
      const gw = values.goal_weight_kg ? Number(values.goal_weight_kg) : null;
      const sw = values.weight_kg ? Number(values.weight_kg) : null;
      await supabase.from("client_goals").insert({
        client_id: user.id,
        goal_type: goalType as any,
        goal_label: values.goal_reason || values.target_outcome || null,
        goal_weight_kg: gw,
        starting_weight_kg: sw,
        notes: values.target_outcome || null,
        is_active: true,
        created_by: user.id,
      });
    }

    setSubmitting(false);
    toast.success(lang === "nl" ? "Gelukt! Welkom." : "Done! Welcome.");
    await refreshOnboarding();
    navigate("/");
  };

  const renderField = (f: Field) => {
    const v = values[f.name];
    switch (f.type) {
      case "text":
        return (
          <Input
            value={v ?? ""}
            onChange={(e) => setField(f.name, e.target.value)}
            className="h-11"
          />
        );
      case "number":
        return (
          <Input
            type="number"
            inputMode="decimal"
            value={v ?? ""}
            onChange={(e) => setField(f.name, e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className="h-11"
          />
        );
      case "textarea":
        return (
          <Textarea
            value={v ?? ""}
            onChange={(e) => setField(f.name, e.target.value)}
            rows={3}
          />
        );
      case "radio":
        return (
          <RadioGroup value={v ?? ""} onValueChange={(val) => setField(f.name, val)} className="space-y-2">
            {f.options?.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <RadioGroupItem value={opt.value} id={`${f.name}-${opt.value}`} />
                <Label htmlFor={`${f.name}-${opt.value}`} className="font-normal cursor-pointer">
                  {t(opt.label, lang)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      case "checkbox-group": {
        const arr: string[] = Array.isArray(v) ? v : [];
        return (
          <div className="space-y-2">
            {f.options?.map((opt) => {
              const checked = arr.includes(opt.value);
              return (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`${f.name}-${opt.value}`}
                    checked={checked}
                    onCheckedChange={(c) => {
                      const next = c
                        ? [...arr, opt.value]
                        : arr.filter((x) => x !== opt.value);
                      setField(f.name, next);
                    }}
                  />
                  <Label htmlFor={`${f.name}-${opt.value}`} className="font-normal cursor-pointer">
                    {t(opt.label, lang)}
                  </Label>
                </div>
              );
            })}
          </div>
        );
      }
      case "boolean":
        return (
          <div className="flex items-center gap-3">
            <Switch
              checked={!!v}
              onCheckedChange={(c) => setField(f.name, c)}
            />
            <span className="text-sm text-muted-foreground">
              {v ? (lang === "nl" ? "Ja" : "Yes") : lang === "nl" ? "Nee" : "No"}
            </span>
          </div>
        );
      case "image":
        return (
          <div className="flex items-center gap-3">
            <input
              ref={(el) => (fileInputs.current[f.name] = el)}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(f.name, file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputs.current[f.name]?.click()}
              disabled={uploading === f.name}
              className="gap-2"
            >
              {uploading === f.name ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {v ? (lang === "nl" ? "Vervangen" : "Replace") : lang === "nl" ? "Upload" : "Upload"}
            </Button>
            {v && <span className="text-xs text-muted-foreground truncate">{(v as string).split("/").pop()}</span>}
          </div>
        );
      case "image-front-side-back":
        return (
          <div className="grid grid-cols-3 gap-3">
            {(["progress_photo_front_path", "progress_photo_side_path", "progress_photo_back_path"] as const).map((fname, i) => {
              const labels = [
                { nl: "Voorkant", en: "Front" },
                { nl: "Zijkant", en: "Side" },
                { nl: "Achterkant", en: "Back" },
              ];
              return (
                <div key={fname} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t(labels[i], lang)}</p>
                  <input
                    ref={(el) => (fileInputs.current[fname] = el)}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(fname, file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputs.current[fname]?.click()}
                    disabled={uploading === fname}
                    className="w-full gap-1"
                  >
                    {uploading === fname ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : values[fname] ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Upload className="h-3 w-3" />
                    )}
                    {values[fname] ? (lang === "nl" ? "OK" : "OK") : lang === "nl" ? "Upload" : "Upload"}
                  </Button>
                </div>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {lang === "nl" ? "Intakeformulier" : "Intake form"}
            </p>
            <h1 className="text-2xl font-bold">LIFT360</h1>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(["nl", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2.5 py-1 text-xs rounded ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {lang === "nl" ? "Stap" : "Step"} {step + 1} / {sections.length} · {t(current.title, lang)}
          </p>
        </div>

        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold">{t(current.title, lang)}</h2>
            {current.description && (
              <p className="text-sm text-muted-foreground mt-1">{t(current.description, lang)}</p>
            )}
          </div>

          {current.fields.map((f) => (
            <div key={f.name} className="space-y-2">
              <Label className="text-sm">
                {t(f.label, lang)}
                {f.optional && (
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    ({lang === "nl" ? "optioneel" : "optional"})
                  </span>
                )}
              </Label>
              {renderField(f)}
            </div>
          ))}
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={prev} disabled={step === 0} className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            {lang === "nl" ? "Terug" : "Back"}
          </Button>
          {step < sections.length - 1 ? (
            <Button onClick={next} className="gap-1">
              {lang === "nl" ? "Volgende" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} className="gap-1">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {lang === "nl" ? "Indienen" : "Submit"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
