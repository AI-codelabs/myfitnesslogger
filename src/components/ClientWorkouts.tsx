import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, X, Sparkles, User as UserIcon, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Lang } from "@/lib/onboardingSchema";
import { ScheduleWorkoutDialog, ScheduleData } from "@/components/ScheduleWorkoutDialog";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  frequency_per_week: number | null;
  is_template: boolean;
  coach_id: string | null;
}

interface Assignment {
  id: string;
  plan_id: string;
  is_active: boolean;
  assigned_at: string;
  unassigned_at: string | null;
  notes: string | null;
}

interface Props {
  clientId: string;
  coachId: string;
  preferredFrequency: number | null;
  preferredDays?: string[] | null;
  lang: Lang;
}

export function ClientWorkouts({ clientId, coachId, preferredFrequency, preferredDays, lang }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Plan | null>(null);

  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);

  async function load() {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("workout_plans").select("*").order("name"),
      supabase
        .from("client_workout_assignments")
        .select("*")
        .eq("client_id", clientId)
        .order("assigned_at", { ascending: false }),
    ]);
    setPlans(p ?? []);
    setAssignments((a as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const openSchedule = (plan: Plan) => setScheduling(plan);

  const confirmSchedule = async (data: ScheduleData) => {
    if (!scheduling) return;
    setBusyId(scheduling.id);
    const { error } = await supabase.from("client_workout_assignments").insert({
      coach_id: coachId,
      client_id: clientId,
      plan_id: scheduling.id,
      is_active: true,
      start_date: data.start_date,
      weeks: data.weeks,
      days: data.days,
    });
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(tx("Schema ingepland", "Plan scheduled"));
    setScheduling(null);
    load();
  };

  const setActive = async (assignmentId: string, active: boolean) => {
    setBusyId(assignmentId);
    const { error } = await supabase
      .from("client_workout_assignments")
      .update({ is_active: active, unassigned_at: active ? null : new Date().toISOString() })
      .eq("id", assignmentId);
    setBusyId(null);
    if (error) return toast.error(error.message);
    load();
  };

  const removeAssignment = async (assignmentId: string) => {
    setBusyId(assignmentId);
    const { error } = await supabase
      .from("client_workout_assignments")
      .delete()
      .eq("id", assignmentId);
    setBusyId(null);
    if (error) return toast.error(error.message);
    load();
  };

  const allCategories = useMemo(
    () => Array.from(new Set(plans.map((p) => p.category).filter(Boolean))) as string[],
    [plans]
  );

  const matchesFilters = (p: Plan) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
    }
    if (category !== "all" && p.category !== category) return false;
    return true;
  };

  const filtered = plans.filter(matchesFilters);
  const matching = preferredFrequency
    ? filtered.filter((p) => p.frequency_per_week === preferredFrequency)
    : [];
  const others = preferredFrequency
    ? filtered.filter((p) => p.frequency_per_week !== preferredFrequency)
    : filtered;

  const planById = (id: string) => plans.find((p) => p.id === id);
  const activeAssignments = assignments.filter((a) => a.is_active);
  const history = assignments.filter((a) => !a.is_active);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtersActive = search !== "" || category !== "all";

  return (
    <div className="space-y-4">
      {/* Active assignments */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{tx("Actieve schema's", "Active plans")}</h3>
          {preferredFrequency && (
            <Badge variant="outline" className="text-xs">
              {tx("Voorkeur", "Preferred")}: {preferredFrequency}x / {tx("week", "week")}
            </Badge>
          )}
        </div>
        {activeAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {tx("Nog geen schema toegewezen.", "No plan assigned yet.")}
          </p>
        ) : (
          <div className="space-y-2">
            {activeAssignments.map((a) => {
              const p = planById(a.plan_id);
              if (!p) return null;
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/workouts/${p.id}`} className="font-medium hover:underline truncate">
                        {p.name}
                      </Link>
                      {p.frequency_per_week && (
                        <Badge variant="secondary" className="text-[10px]">
                          {p.frequency_per_week}x / {tx("week", "week")}
                        </Badge>
                      )}
                      {p.category && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {p.category.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {tx("Toegewezen", "Assigned")}: {new Date(a.assigned_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActive(a.id, false)}
                      disabled={busyId === a.id}
                    >
                      {tx("Deactiveer", "Deactivate")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title={tx("Bekijk schema", "View plan")}
                    >
                      <Link to={`/workouts/${p.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Browser */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold">{tx("Schema toewijzen", "Assign a plan")}</h3>
          <div className="flex items-center gap-2">
            <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
            <Label htmlFor="show-all" className="text-xs cursor-pointer">
              {tx("Toon alle frequenties", "Show all frequencies")}
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={tx("Zoek schema's…", "Search plans…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={tx("Categorie", "Category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("Alle categorieën", "All categories")}</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
            >
              <X className="h-3.5 w-3.5" /> {tx("Wis", "Clear")}
            </Button>
          )}
        </div>

        {preferredFrequency && (
          <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {tx("Aanbevolen", "Recommended")} ({preferredFrequency}x / {tx("week", "week")})
            </h4>
            {matching.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tx("Geen schema's met deze frequentie.", "No plans with this frequency.")}
              </p>
            ) : (
              <PlanList plans={matching} onAssign={openSchedule} busyId={busyId} lang={lang} />
            )}
          </section>
        )}

        {(showAll || !preferredFrequency) && others.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" />
              {preferredFrequency
                ? tx("Andere schema's", "Other plans")
                : tx("Alle schema's", "All plans")}
            </h4>
            <PlanList plans={others} onAssign={openSchedule} busyId={busyId} lang={lang} />
          </section>
        )}
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold">{tx("Geschiedenis", "History")}</h3>
          <div className="space-y-2">
            {history.map((a) => {
              const p = planById(a.plan_id);
              if (!p) return null;
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border p-3 opacity-80">
                  <div className="min-w-0">
                    <Link to={`/workouts/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(a.assigned_at).toLocaleDateString()}
                      {a.unassigned_at && ` → ${new Date(a.unassigned_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActive(a.id, true)}
                      disabled={busyId === a.id}
                    >
                      {tx("Heractiveer", "Reactivate")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAssignment(a.id)}
                      disabled={busyId === a.id}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function PlanList({
  plans,
  onAssign,
  busyId,
  lang,
}: {
  plans: Plan[];
  onAssign: (p: Plan) => void;
  busyId: string | null;
  lang: Lang;
}) {
  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {plans.map((p) => (
        <div key={p.id} className="rounded-md border p-3 flex flex-col gap-2 hover:border-primary/50 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/workouts/${p.id}`} className="font-medium hover:underline line-clamp-2">
                {p.name}
              </Link>
              {p.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>
              )}
            </div>
            {p.is_template && (
              <Badge variant="outline" className="text-[10px] shrink-0">
                {tx("Template", "Template")}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-auto">
            <div className="flex items-center gap-1.5 flex-wrap">
              {p.frequency_per_week && (
                <Badge variant="secondary" className="text-[10px]">
                  {p.frequency_per_week}x / {tx("week", "week")}
                </Badge>
              )}
              {p.category && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {p.category.replace("_", " ")}
                </Badge>
              )}
            </div>
            <Button size="sm" onClick={() => onAssign(p)} disabled={busyId === p.id}>
              {tx("Wijs toe", "Assign")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
