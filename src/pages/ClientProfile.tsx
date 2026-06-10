import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarClock, Loader2, Save, Trash2, UserCheck, UserX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Lang, onboardingSections, t } from "@/lib/onboardingSchema";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

import { NutritionWizard } from "@/components/NutritionWizard";
import { ClientWorkouts } from "@/components/ClientWorkouts";
import { CoachMessageTab } from "@/components/CoachMessageTab";
import { WeeklyCheckinsTab } from "@/components/WeeklyCheckinsTab";
import { WeeklyReviewTab } from "@/components/WeeklyReviewTab";
import { ClientProgressionTab } from "@/components/ClientProgressionTab";
import { NutritionWeeklyOverview, DailyLog } from "@/components/NutritionWeeklyOverview";
import { ClientNutritionDocuments } from "@/components/ClientNutritionDocuments";
import { ClientGoalsTab } from "@/components/ClientGoalsTab";
import { clientFullName } from "@/lib/clientName";



const ClientProfile = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("onbLang") as Lang) || "nl");
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [response, setResponse] = useState<any>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [nutrition, setNutrition] = useState<any>(null);
  const [editingNutrition, setEditingNutrition] = useState(false);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [nutritionLogs, setNutritionLogs] = useState<DailyLog[]>([]);
  const [coachingStart, setCoachingStart] = useState<string>("");
  const [coachingEnd, setCoachingEnd] = useState<string>("");
  const [savingPeriod, setSavingPeriod] = useState(false);

  const saveCoachingPeriod = async () => {
    if (!invite) return;
    setSavingPeriod(true);
    const { error } = await supabase
      .from("invitations")
      .update({
        coaching_start_date: coachingStart || null,
        coaching_end_date: coachingEnd || null,
      })
      .eq("id", invite.id);
    setSavingPeriod(false);
    if (error) return toast.error(error.message);
    setInvite({
      ...invite,
      coaching_start_date: coachingStart || null,
      coaching_end_date: coachingEnd || null,
    });
    toast.success(lang === "nl" ? "Coachingsperiode opgeslagen" : "Coaching period saved");
  };

  const getExpiryInfo = (endDate?: string | null) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { kind: "expired" as const, days: Math.abs(diffDays) };
    if (diffDays <= 14) return { kind: "soon" as const, days: diffDays };
    return { kind: "ok" as const, days: diffDays };
  };

  const updateStatus = async (status: "active" | "inactive") => {
    if (!invite) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("invitations")
      .update({ status })
      .eq("id", invite.id);
    setActionLoading(false);
    if (error) return toast.error(error.message);
    setInvite({ ...invite, status });
    toast.success(status === "inactive" ? "Client set to inactive" : "Client reactivated");
  };

  const deleteClient = async () => {
    if (!clientId) return;
    setActionLoading(true);
    const { data, error } = await supabase.functions.invoke("delete-client", {
      body: { clientId },
    });
    setActionLoading(false);
    if (error || (data as any)?.error) {
      return toast.error(error?.message || (data as any)?.error || "Failed to delete");
    }
    toast.success("Client account deleted");
    navigate("/");
  };

  const loadNutrition = async () => {
    if (!clientId) return;
    const { data } = await supabase
      .from("nutrition_plans")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    setNutrition(data);
  };

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      setCoachId(u.user?.id ?? null);
      const [invQ, respQ, nutQ, logsQ, profQ] = await Promise.all([
        supabase
          .from("invitations")
          .select("id, email, status, accepted_at, created_at, coaching_start_date, coaching_end_date")
          .eq("accepted_user_id", clientId)
          .maybeSingle(),
        supabase
          .from("onboarding_responses")
          .select("*")
          .eq("user_id", clientId)
          .maybeSingle(),
        supabase
          .from("nutrition_plans")
          .select("*")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("cronometer_nutrition_logs")
          .select("log_date, calories, protein_g, carbs_g, fat_g")
          .eq("client_id", clientId)
          .order("log_date", { ascending: false })
          .limit(60),
        supabase
          .from("profiles")
          .select("first_name, last_name, display_name")
          .eq("user_id", clientId)
          .maybeSingle(),
      ]);
      setInvite({ ...(invQ.data as any), ...(profQ.data as any) });
      setCoachingStart((invQ.data as any)?.coaching_start_date ?? "");
      setCoachingEnd((invQ.data as any)?.coaching_end_date ?? "");
      setResponse(respQ.data);
      setNutrition(nutQ.data);
      setNutritionLogs((logsQ.data as DailyLog[]) || []);
      setLoading(false);


      // Sign URLs for any uploaded photos
      if (respQ.data) {
        const paths = [
          respQ.data.progress_photo_front_path,
          respQ.data.progress_photo_side_path,
          respQ.data.progress_photo_back_path,
          respQ.data.step_tracker_screenshot_path,
        ].filter(Boolean) as string[];
        const urls: Record<string, string> = {};
        for (const p of paths) {
          const { data } = await supabase.storage
            .from("onboarding-uploads")
            .createSignedUrl(p, 3600);
          if (data) urls[p] = data.signedUrl;
        }
        setPhotoUrls(urls);
      }
    })();
  }, [clientId]);

  const formatValue = (name: string, value: any): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? (lang === "nl" ? "Ja" : "Yes") : lang === "nl" ? "Nee" : "No";
    if (Array.isArray(value)) {
      // Map to localized labels if option exists
      const field = onboardingSections
        .flatMap((s) => s.fields)
        .find((f) => f.name === name);
      if (field?.options) {
        return value
          .map((v) => {
            const opt = field.options!.find((o) => o.value === v);
            return opt ? t(opt.label, lang) : v;
          })
          .join(", ");
      }
      return value.join(", ");
    }
    // Localize single radio value
    const field = onboardingSections.flatMap((s) => s.fields).find((f) => f.name === name);
    if (field?.options) {
      const opt = field.options.find((o) => o.value === value);
      if (opt) return t(opt.label, lang);
    }
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusVariant =
    invite?.status === "active"
      ? "default"
      : invite?.status === "onboarding"
        ? "secondary"
        : "outline";

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8 max-w-4xl mx-auto w-full">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1 mb-4 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        {lang === "nl" ? "Terug" : "Back"}
      </Button>

      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {clientFullName({ ...(invite ?? {}), full_name: response?.full_name })}
          </h1>
          <p className="text-sm text-muted-foreground">{invite?.email}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={statusVariant as any} className="capitalize h-8 px-3 rounded-md text-xs flex items-center">{invite?.status}</Badge>
          {(() => {
            const info = getExpiryInfo(invite?.coaching_end_date);
            if (!info) return null;
            if (info.kind === "expired") {
              return (
                <Badge variant="destructive" className="h-8 px-3 rounded-md text-xs flex items-center gap-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {lang === "nl" ? `Verlopen (${info.days}d)` : `Expired (${info.days}d)`}
                </Badge>
              );
            }
            if (info.kind === "soon") {
              return (
                <Badge className="h-8 px-3 rounded-md text-xs flex items-center gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {lang === "nl" ? `Verloopt over ${info.days}d` : `Ends in ${info.days}d`}
                </Badge>
              );
            }
            return null;
          })()}
          <div className="flex items-center gap-1 rounded-md border h-8 p-0.5">
            {(["nl", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setLang(l);
                  localStorage.setItem("onbLang", l);
                }}
                className={`h-full px-2.5 text-xs rounded-sm flex items-center ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {invite && invite.status !== "inactive" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus("inactive")}
              disabled={actionLoading}
              className="gap-1"
            >
              <UserX className="h-4 w-4" />
              {lang === "nl" ? "Op inactief" : "Set inactive"}
            </Button>
          ) : invite ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus("active")}
              disabled={actionLoading}
              className="gap-1"
            >
              <UserCheck className="h-4 w-4" />
              {lang === "nl" ? "Heractiveer" : "Reactivate"}
            </Button>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={actionLoading} className="gap-1">
                <Trash2 className="h-4 w-4" />
                {lang === "nl" ? "Verwijder" : "Delete"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {lang === "nl" ? "Klant verwijderen?" : "Delete client?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {lang === "nl"
                    ? "Hierdoor wordt deze klant uit jouw lijst verwijderd. Hun account blijft bestaan, maar je hebt geen toegang meer tot hun gegevens."
                    : "This removes the client from your list. Their account stays, but you'll lose access to their data."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{lang === "nl" ? "Annuleer" : "Cancel"}</AlertDialogCancel>
                <AlertDialogAction onClick={deleteClient} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {lang === "nl" ? "Verwijder" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") || "overview"}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">{lang === "nl" ? "Overzicht" : "Overview"}</TabsTrigger>
          <TabsTrigger value="workouts">{lang === "nl" ? "Workouts" : "Workouts"}</TabsTrigger>
          <TabsTrigger value="nutrition">{lang === "nl" ? "Voeding" : "Nutrition"}</TabsTrigger>
          <TabsTrigger value="progression">{lang === "nl" ? "Progressie" : "Progress"}</TabsTrigger>
          <TabsTrigger value="message">{lang === "nl" ? "Bericht" : "Message"}</TabsTrigger>
          <TabsTrigger value="checkins">{lang === "nl" ? "Check-ins" : "Check-ins"}</TabsTrigger>
          <TabsTrigger value="review">{lang === "nl" ? "Review" : "Review"}</TabsTrigger>
        </TabsList>

        <TabsContent value="message" className="mt-4">
          {coachId && clientId ? (
            <CoachMessageTab clientId={clientId} coachId={coachId} lang={lang} />
          ) : null}
        </TabsContent>

        <TabsContent value="checkins" className="mt-4">
          {clientId ? <WeeklyCheckinsTab clientId={clientId} lang={lang} /> : null}
        </TabsContent>

        <TabsContent value="review" className="mt-4">
          {coachId && clientId ? (
            <WeeklyReviewTab clientId={clientId} coachId={coachId} lang={lang} />
          ) : null}
        </TabsContent>

        <TabsContent value="progression" className="mt-4">
          {clientId ? <ClientProgressionTab clientId={clientId} lang={lang} /> : null}
        </TabsContent>

        <TabsContent value="workouts" className="mt-4">
          {coachId && clientId ? (
            <ClientWorkouts
              clientId={clientId}
              coachId={coachId}
              preferredFrequency={response?.train_freq_target ?? response?.train_freq_current ?? null}
              preferredDays={response?.train_days ?? null}
              lang={lang}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card className="p-5 space-y-2">
            <h3 className="font-semibold mb-2">{lang === "nl" ? "Samenvatting" : "Summary"}</h3>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span>{invite?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{lang === "nl" ? "Status" : "Status"}</span>
              <span className="capitalize">{invite?.status}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{lang === "nl" ? "Uitgenodigd" : "Invited"}</span>
              <span>{invite?.created_at ? new Date(invite.created_at).toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{lang === "nl" ? "Onboarding voltooid" : "Onboarding completed"}</span>
              <span>{response?.completed_at ? new Date(response.completed_at).toLocaleDateString() : "—"}</span>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">
                {lang === "nl" ? "Coachingsperiode" : "Coaching period"}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              {lang === "nl"
                ? "Stel de start- en einddatum van het coachingscontract in. Je krijgt een waarschuwing 2 weken vóór de einddatum."
                : "Set the start and end date of the coaching contract. You'll get an alert 2 weeks before it expires."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {lang === "nl" ? "Startdatum" : "Start date"}
                </label>
                <Input
                  type="date"
                  value={coachingStart}
                  onChange={(e) => setCoachingStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  {lang === "nl" ? "Einddatum" : "End date"}
                </label>
                <Input
                  type="date"
                  value={coachingEnd}
                  onChange={(e) => setCoachingEnd(e.target.value)}
                  min={coachingStart || undefined}
                />
              </div>
            </div>
            {(() => {
              const info = getExpiryInfo(invite?.coaching_end_date);
              if (!info) return null;
              const cls =
                info.kind === "expired"
                  ? "text-destructive"
                  : info.kind === "soon"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground";
              const text =
                info.kind === "expired"
                  ? lang === "nl"
                    ? `Verlopen sinds ${info.days} dag(en).`
                    : `Expired ${info.days} day(s) ago.`
                  : info.kind === "soon"
                    ? lang === "nl"
                      ? `Verloopt over ${info.days} dag(en).`
                      : `Ends in ${info.days} day(s).`
                    : lang === "nl"
                      ? `Nog ${info.days} dag(en) te gaan.`
                      : `${info.days} day(s) remaining.`;
              return <p className={`text-xs ${cls}`}>{text}</p>;
            })()}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={saveCoachingPeriod}
                disabled={savingPeriod}
                className="gap-1"
              >
                <Save className="h-4 w-4" />
                {lang === "nl" ? "Opslaan" : "Save"}
              </Button>
            </div>
          </Card>

          {!response ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              {lang === "nl"
                ? "Deze klant heeft het formulier nog niet ingevuld."
                : "This client hasn't filled out the form yet."}
            </Card>
          ) : (
            onboardingSections.map((sec) => (
              <Card key={sec.id} className="p-5">
                <h3 className="font-semibold mb-3">{t(sec.title, lang)}</h3>
                <div className="space-y-2.5">
                  {sec.fields.map((f) => {
                    if (f.type === "image" || f.type === "image-front-side-back") {
                      const paths =
                        f.type === "image"
                          ? [response[f.name]].filter(Boolean)
                          : [
                              response.progress_photo_front_path,
                              response.progress_photo_side_path,
                              response.progress_photo_back_path,
                            ].filter(Boolean);
                      if (paths.length === 0) return null;
                      return (
                        <div key={f.name}>
                          <p className="text-xs text-muted-foreground mb-2">{t(f.label, lang)}</p>
                          <div className="flex gap-2 flex-wrap">
                            {paths.map((p: string) => (
                              <a key={p} href={photoUrls[p]} target="_blank" rel="noreferrer">
                                <img
                                  src={photoUrls[p]}
                                  alt=""
                                  className="h-28 w-28 object-cover rounded border"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={f.name} className="grid grid-cols-[1fr,1.5fr] gap-3 text-sm py-1.5 border-b last:border-0">
                        <span className="text-muted-foreground">{t(f.label, lang)}</span>
                        <span className="text-foreground">{formatValue(f.name, response[f.name])}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="nutrition" className="mt-4 space-y-4">
          {coachId && clientId && (nutrition && !editingNutrition && nutrition.completed_at ? (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    {lang === "nl" ? "Voedingsschema" : "Nutrition plan"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {lang === "nl" ? "Laatst bijgewerkt" : "Last updated"}:{" "}
                    {new Date(nutrition.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditingNutrition(true)}>
                  {lang === "nl" ? "Bewerken" : "Edit"}
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Stat label={lang === "nl" ? "Geslacht" : "Gender"} value={nutrition.gender} />
                <Stat label={lang === "nl" ? "Leeftijd" : "Age"} value={nutrition.age} />
                <Stat label={lang === "nl" ? "Lengte" : "Height"} value={nutrition.height_cm ? `${nutrition.height_cm} cm` : null} />
                <Stat label={lang === "nl" ? "Gewicht" : "Weight"} value={nutrition.weight_kg ? `${nutrition.weight_kg} kg` : null} />
              </div>
              {nutrition.details?.calories ? (
                <>
                  <div className="h-px bg-border my-1" />
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {lang === "nl" ? "Dagelijkse macro's" : "Daily macros"}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <Stat label={lang === "nl" ? "Calorieën" : "Calories"} value={`${nutrition.details.calories} kcal`} />
                    <Stat label={lang === "nl" ? "Eiwit" : "Protein"} value={`${nutrition.details.protein_g} g`} />
                    <Stat label={lang === "nl" ? "Koolhydraten" : "Carbs"} value={`${nutrition.details.carbs_g} g`} />
                    <Stat label={lang === "nl" ? "Vet" : "Fat"} value={`${nutrition.details.fat_g} g`} />
                  </div>
                  <MacroPie
                    lang={lang}
                    protein={nutrition.details.protein_g}
                    carbs={nutrition.details.carbs_g}
                    fat={nutrition.details.fat_g}
                  />
                </>
              ) : null}
            </Card>
          ) : (
            <NutritionWizard
              clientId={clientId}
              coachId={coachId}
              lang={lang}
              prefill={response ? {
                // Step 1
                age: response.age,
                height_cm: response.height_cm,
                weight_kg: response.weight_kg,
                // Step 2 — lifestyle
                activity_level: response.activity_level,
                workouts_per_week: response.train_freq_current ?? response.train_freq_target,
                sleep_hours: response.sleep_hours,
                occupation: response.occupation,
                // Step 3 — goal
                goal: response.primary_goal,
                motivation: response.goal_reason,
                // Step 4 — nutrition
                meals_per_day: response.meals_per_day,
                diet: response.diet_preferences,
                supplements: response.supplements,
              } : undefined}
              existing={nutrition}
              onCancel={editingNutrition ? () => setEditingNutrition(false) : undefined}
              onCompleted={async () => {
                setEditingNutrition(false);
                await loadNutrition();
              }}
            />
          ))}

          {nutrition?.details?.calories && (
            <NutritionWeeklyOverview
              lang={lang}
              logs={nutritionLogs}
              targets={{
                calories: nutrition.details.calories,
                protein_g: nutrition.details.protein_g,
                carbs_g: nutrition.details.carbs_g,
                fat_g: nutrition.details.fat_g,
              }}
            />
          )}

          {coachId && clientId && (
            <ClientNutritionDocuments
              clientId={clientId}
              coachId={coachId}
              canUpload
              lang={lang}
            />
          )}
        </TabsContent>

      </Tabs>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: any }) => (
  <div className="rounded-md border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium mt-0.5">{value || "—"}</p>
  </div>
);

const MacroPie = ({
  lang,
  protein,
  carbs,
  fat,
}: {
  lang: Lang;
  protein: number;
  carbs: number;
  fat: number;
}) => {
  const data = [
    { name: lang === "nl" ? "Koolhydraten" : "Carbs", value: Number(carbs) || 0, color: "hsl(340 75% 60%)" },
    { name: lang === "nl" ? "Eiwitten" : "Protein", value: Number(protein) || 0, color: "hsl(210 80% 60%)" },
    { name: lang === "nl" ? "Vetten" : "Fat", value: Number(fat) || 0, color: "hsl(25 85% 60%)" },
  ];
  if (data.every((d) => d.value === 0)) return null;
  return (
    <div className="mt-2 rounded-md border p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
        {lang === "nl" ? "Verdeling" : "Distribution"}
      </p>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              stroke="hsl(var(--background))"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val: any, name: any) => [`${val} g`, name]}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(value: any) => {
                const item = data.find((d) => d.name === value);
                return (
                  <span className="text-xs text-foreground">
                    {value} ({item?.value} g)
                  </span>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ClientProfile;
