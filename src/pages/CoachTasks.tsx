import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Circle,
  Mic,
  Sparkles,
  Send,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { formatWeekStart, formatHumanDate } from "@/lib/weeklyCheckin";

type Client = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type CoachMsg = {
  client_id: string;
  voice_memo: string | null;
  published_at: string | null;
  voice_memo_recorded_at: string | null;
};

type Onboarding = {
  user_id: string;
  completed_at: string | null;
};

type NutritionPlan = { client_id: string };
type Assignment = { client_id: string };

type TaskRow = {
  client: Client;
  hasOnboarding: boolean;
  hasNutrition: boolean;
  hasSchedule: boolean;
  hasMessage: boolean;
  isPublished: boolean;
  voiceRecorded: boolean;
};

export default function CoachTasks() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [checkins, setCheckins] = useState<Array<{ client_id: string; submitted_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const weekStart = formatWeekStart();

  const load = async () => {
    if (!user) return;
    setLoading(true);

    // Clients via profiles linked through user_roles? Use existing pattern: coach_id assignments + invitations
    // Simplest: pull all clients this coach is_coach_of via invitations accepted
    const { data: inv } = await supabase
      .from("invitations")
      .select("accepted_user_id")
      .eq("coach_id", user.id)
      .in("status", ["onboarding", "active", "accepted"])
      .not("accepted_user_id", "is", null);

    const clientIds = (inv ?? []).map((i: any) => i.accepted_user_id).filter(Boolean);
    if (clientIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [profilesRes, onboardingRes, nutritionRes, assignRes, msgRes, checkinsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in("user_id", clientIds),
      supabase
        .from("onboarding_responses")
        .select("user_id, completed_at")
        .in("user_id", clientIds),
      supabase
        .from("nutrition_plans")
        .select("client_id")
        .eq("coach_id", user.id)
        .in("client_id", clientIds),
      supabase
        .from("client_workout_assignments")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("is_active", true)
        .in("client_id", clientIds),
      supabase
        .from("coach_messages")
        .select("client_id, voice_memo, published_at, voice_memo_recorded_at")
        .eq("coach_id", user.id)
        .in("client_id", clientIds),
      supabase
        .from("weekly_checkins")
        .select("client_id, submitted_at")
        .eq("week_start", weekStart)
        .in("client_id", clientIds),
    ]);

    const profiles = (profilesRes.data ?? []) as any[];
    const onboarding = (onboardingRes.data ?? []) as Onboarding[];
    const nutrition = (nutritionRes.data ?? []) as NutritionPlan[];
    const assigns = (assignRes.data ?? []) as Assignment[];
    const msgs = (msgRes.data ?? []) as CoachMsg[];

    const onboardingSet = new Set(
      onboarding.filter((o) => o.completed_at).map((o) => o.user_id),
    );
    const nutritionSet = new Set(nutrition.map((n) => n.client_id));
    const assignSet = new Set(assigns.map((a) => a.client_id));
    const msgMap = new Map(msgs.map((m) => [m.client_id, m]));

    const built: TaskRow[] = clientIds.map((cid: string) => {
      const profile = profiles.find((p) => p.user_id === cid);
      const m = msgMap.get(cid);
      return {
        client: {
          user_id: cid,
          display_name: profile?.display_name ?? null,
          email: null,
        },
        hasOnboarding: onboardingSet.has(cid),
        hasNutrition: nutritionSet.has(cid),
        hasSchedule: assignSet.has(cid),
        hasMessage: !!m,
        isPublished: !!m?.published_at,
        voiceRecorded: !!m?.voice_memo_recorded_at,
      };
    });

    setRows(built);
    setCheckins((checkinsRes.data ?? []) as Array<{ client_id: string; submitted_at: string }>);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const onboardingTasks = useMemo(() => {
    return rows
      .filter((r) => r.hasOnboarding)
      .map((r) => {
        const intakeReady = r.hasNutrition && r.hasSchedule;
        const subtasks = [
          {
            key: "generate",
            label: "Genereer startbericht",
            done: r.hasMessage,
            blocked: !intakeReady,
            icon: Sparkles,
          },
          {
            key: "publish",
            label: "Publiceer naar client",
            done: r.isPublished,
            blocked: !r.hasMessage,
            icon: Send,
          },
          {
            key: "voice",
            label: "Voice memo opnemen",
            done: r.voiceRecorded,
            blocked: !r.isPublished,
            icon: Mic,
          },
        ];
        const allDone = subtasks.every((s) => s.done);
        return { row: r, subtasks, allDone, intakeReady };
      });
  }, [rows]);

  const pending = onboardingTasks.filter((t) => !t.allDone);
  const completed = onboardingTasks.filter((t) => t.allDone);

  const markVoiceRecorded = async (clientId: string, current: boolean) => {
    if (!user) return;
    const value = current ? null : new Date().toISOString();
    const { error } = await supabase
      .from("coach_messages")
      .update({ voice_memo_recorded_at: value })
      .eq("client_id", clientId)
      .eq("coach_id", user.id);
    if (error) {
      toast.error("Kon status niet bijwerken");
      return;
    }
    toast.success(current ? "Voice memo gemarkeerd als open" : "Voice memo afgevinkt");
    load();
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Taken</h1>
        <p className="text-sm text-muted-foreground">
          Overzicht van wat er nog gedaan moet worden voor je clients.
        </p>
      </div>

      <Tabs defaultValue="onboarding" className="space-y-4">
        <TabsList>
          <TabsTrigger value="onboarding">
            Onboarding
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="weekly" disabled>
            <Calendar className="h-3.5 w-3.5 mr-1.5" />
            Wekelijks (binnenkort)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="onboarding" className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : pending.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
              <p className="font-medium">Alles bij! 🎉</p>
              <p className="text-sm text-muted-foreground">
                Geen openstaande onboarding taken.
              </p>
            </Card>
          ) : (
            pending.map(({ row, subtasks, intakeReady }) => (
              <Card key={row.client.user_id} className="overflow-hidden">
                <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {row.client.display_name ?? "Naamloos"}
                    </p>
                    {!intakeReady && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Wacht op {!row.hasNutrition && "voedingsplan"}
                        {!row.hasNutrition && !row.hasSchedule && " + "}
                        {!row.hasSchedule && "trainingsschema"}
                      </p>
                    )}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/clients/${row.client.user_id}`}>
                      Open client
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
                <ul className="divide-y">
                  {subtasks.map((s) => {
                    const Icon = s.icon;
                    return (
                      <li
                        key={s.key}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        {s.done ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle
                            className={`h-5 w-5 shrink-0 ${
                              s.blocked ? "text-muted-foreground/40" : "text-muted-foreground"
                            }`}
                          />
                        )}
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            s.done ? "text-emerald-500" : "text-muted-foreground"
                          }`}
                        />
                        <span
                          className={`flex-1 text-sm ${
                            s.done
                              ? "text-muted-foreground line-through"
                              : s.blocked
                                ? "text-muted-foreground/60"
                                : ""
                          }`}
                        >
                          {s.label}
                        </span>
                        {s.key === "voice" && !s.blocked && (
                          <Button
                            size="sm"
                            variant={s.done ? "ghost" : "secondary"}
                            onClick={() =>
                              markVoiceRecorded(row.client.user_id, s.done)
                            }
                          >
                            {s.done ? "Ongedaan" : "Markeer als opgenomen"}
                          </Button>
                        )}
                        {(s.key === "generate" || s.key === "publish") && !s.done && !s.blocked && (
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/clients/${row.client.user_id}?tab=message`}>
                              Doe nu
                            </Link>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))
          )}

          {completed.length > 0 && (
            <div className="pt-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                Afgerond ({completed.length})
              </p>
              <div className="space-y-2">
                {completed.map(({ row }) => (
                  <Card
                    key={row.client.user_id}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">
                      {row.client.display_name ?? "Naamloos"}
                    </span>
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/clients/${row.client.user_id}`}>Bekijk</Link>
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="weekly">
          <Card className="p-8 text-center">
            <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="font-medium">Wekelijkse check-ins komen eraan</p>
            <p className="text-sm text-muted-foreground">
              Hier verschijnen straks wekelijkse taken per client.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
