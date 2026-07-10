import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  Apple,
  Footprints,
  Plus,
  Target,
} from "lucide-react";
import {
  getExpectedCheckinWeekStart,
  isCheckinWindowOpen,
} from "@/lib/weeklyCheckin";
import { ProgressionSummary } from "@/components/ProgressionSummary";
import { ClientStartMessageCard } from "@/components/ClientStartMessageCard";
import heroImage from "@/assets/checkin-hero.jpg";
import { cn } from "@/lib/utils";
import { Lang } from "@/lib/onboardingSchema";
import { fetchActiveGoal, ClientGoal, GOAL_TYPE_LABELS } from "@/lib/clientGoal";
import { NutritionTodayCard } from "@/components/client-home/NutritionTodayCard";
import { ComplianceCard } from "@/components/client-home/ComplianceCard";

const tx = (lang: Lang, nl: string, en: string) => (lang === "nl" ? nl : en);

/* ---------------- Date heading ---------------- */
function DateHeading({ lang }: { lang: Lang }) {
  const today = new Date();
  const heading = today.toLocaleDateString(lang === "nl" ? "nl-NL" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <p className="text-sm text-muted-foreground mb-5 capitalize">{heading}</p>
  );
}

function toKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeekMon(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return x;
}

/* ---------------- Hero check-in ---------------- */
function HeroCheckinCard({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const weekStart = getExpectedCheckinWeekStart();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("weekly_checkins")
        .select("submitted_at")
        .eq("client_id", user.id)
        .eq("week_start", weekStart)
        .maybeSingle();
      setSubmittedAt(data?.submitted_at ?? null);
      setLoaded(true);
    })();
  }, [user, weekStart]);

  if (!loaded) return null;

  const done = !!submittedAt;
  const title = done
    ? tx(lang, "Check-in ingevuld ✨", "Check-in complete ✨")
    : tx(lang, "New check-in time! 🌟", "New check-in time! 🌟");
  const body = done
    ? tx(
        lang,
        "Bedankt! Je coach bekijkt je antwoorden binnenkort.",
        "Thanks! Your coach will review your answers soon.",
      )
    : tx(
        lang,
        "Laat me weten hoe het gaat. Wekelijkse metingen zijn key voor progressie — zo blijven we on track 📈",
        "Let me know how it's going. Weekly check-ins are key for progress — so we stay on track 📈",
      );
  const cta = done
    ? tx(lang, "Bijwerken", "Update")
    : tx(lang, "Start check-in", "Start check-in");

  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl shadow-sm">
      <img
        src={heroImage}
        alt=""
        width={1200}
        height={720}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/70 via-foreground/40 to-transparent" />
      <div className="relative p-6 sm:p-8 min-h-[220px] flex flex-col justify-between max-w-[70%]">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-background leading-tight">
            {title}
          </h2>
          <p className="mt-2 text-sm sm:text-base text-background/90 leading-snug">
            {body}
          </p>
        </div>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="mt-5 w-fit rounded-full font-semibold shadow-md"
        >
          <Link to="/check-in">
            {cta}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Week strip ---------------- */
function WeekStrip({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  const today = new Date();
  const start = startOfWeekMon(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const dayLabels =
    lang === "nl"
      ? ["M", "D", "W", "D", "V", "Z", "Z"]
      : ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <section className="mb-6">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d, i) => {
          const isToday = toKey(d) === toKey(today);
          return (
            <button
              key={i}
              onClick={() => navigate("/training")}
              className={cn(
                "flex flex-col items-center justify-center rounded-2xl py-2.5 transition-colors",
                isToday
                  ? "bg-foreground text-background shadow-md"
                  : "bg-muted/40 hover:bg-muted text-foreground",
              )}
              aria-label={d.toDateString()}
            >
              <span
                className={cn(
                  "text-[11px] font-medium",
                  isToday ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {dayLabels[i]}
              </span>
              <span className="text-base sm:text-lg font-bold mt-0.5">
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Today's to-dos ---------------- */
type Todo = { id: string; title: string; subtitle: string; to: string; done: boolean };

function TodayTodos({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const showCheckin = isCheckinWindowOpen();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const list: Todo[] = [];

      const todayKey = toKey(new Date());
      const { data: todaySessions } = await supabase
        .from("workout_sessions")
        .select("id, completed_at")
        .eq("client_id", user.id)
        .eq("scheduled_date", todayKey);

      if (todaySessions && todaySessions.length > 0) {
        const done = todaySessions.some((s) => s.completed_at);
        list.push({
          id: "workout",
          title: tx(lang, "Training van vandaag", "Today's workout"),
          subtitle: done
            ? tx(lang, "Voltooid — goed bezig!", "Completed — nice work!")
            : tx(lang, "Nog te loggen", "Not logged yet"),
          to: "/training",
          done,
        });
      }

      setTodos(list);
    })();
  }, [user, lang]);

  if (!todos) return null;
  const isEmpty = todos.length === 0 && !showCheckin;

  return (
    <section className="mb-6">
      <h3 className="text-lg font-bold mb-3">{tx(lang, "To-do's", "To-do's")}</h3>
      {isEmpty ? (
        <Card className="p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">
              {tx(lang, "Alles op orde voor nu", "You're all caught up")}
            </p>
            <p className="text-sm text-muted-foreground">
              {tx(
                lang,
                "Nieuwe taken verschijnen hier automatisch.",
                "New tasks show up here automatically.",
              )}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {showCheckin && <HeroCheckinCard lang={lang} />}
          {todos.map((t) => (
            <Link
              key={t.id}
              to={t.to}
              className="block group"
            >
              <Card className="p-4 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                    t.done
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-foreground text-background",
                  )}
                >
                  {t.done ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <ClipboardCheck className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{t.title}</p>
                  <p className="text-sm text-muted-foreground">{t.subtitle}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}


/* ---------------- Goals ---------------- */
function GoalsSection({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const [goal, setGoal] = useState<ClientGoal | null>(null);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const g = await fetchActiveGoal(user.id);
      setGoal(g);
      const { data } = await supabase
        .from("weight_logs")
        .select("weight_kg")
        .eq("client_id", user.id)
        .order("logged_on", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestWeight(data?.weight_kg ?? null);
      setLoaded(true);
    })();
  }, [user]);

  if (!loaded) return null;

  return (
    <section className="mb-6">
      <h3 className="text-lg font-bold mb-3">{tx(lang, "Doelen", "Goals")}</h3>
      <div className="space-y-2">
        {goal && (
          <Card className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-full border-2 border-border flex items-center justify-center shrink-0">
              <Target className="h-5 w-5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">
                {goal.goal_label ?? GOAL_TYPE_LABELS[goal.goal_type][lang]}
              </p>
              <p className="text-sm text-muted-foreground">
                {goal.goal_weight_kg
                  ? tx(
                      lang,
                      `Doel: ${goal.goal_weight_kg} kg`,
                      `Target: ${goal.goal_weight_kg} kg`,
                    )
                  : GOAL_TYPE_LABELS[goal.goal_type][lang]}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold">
                {latestWeight != null ? `${latestWeight} kg` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {tx(lang, "Laatste", "Latest")}
              </p>
            </div>
          </Card>
        )}

        <Card className="p-4 flex items-center gap-3 opacity-70">
          <div className="w-11 h-11 rounded-full border-2 border-border flex items-center justify-center shrink-0">
            <Footprints className="h-5 w-5 text-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">
              {tx(lang, "Stappen", "Steps")}
            </p>
            <p className="text-sm text-muted-foreground">
              {tx(lang, "Binnenkort beschikbaar", "Coming soon")}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold">—</p>
            <p className="text-xs text-muted-foreground">
              {tx(lang, "Vandaag", "Today")}
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}

/* ---------------- Quick actions ---------------- */
function QuickActions({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  return (
    <section className="mb-6 grid grid-cols-2 gap-3">
      <Card
        className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors group"
        onClick={() => navigate("/training")}
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Dumbbell className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{tx(lang, "Training", "Training")}</p>
          <p className="text-xs text-muted-foreground">
            {tx(lang, "Schema & log", "Plan & log")}
          </p>
        </div>
      </Card>
      <Card
        className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-colors group"
        onClick={() => navigate("/nutrition")}
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          <Apple className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{tx(lang, "Voeding", "Nutrition")}</p>
          <p className="text-xs text-muted-foreground">
            {tx(lang, "Maaltijden & macro's", "Meals & macros")}
          </p>
        </div>
      </Card>
    </section>
  );
}

/* ---------------- Main view ---------------- */
export function ClientHomeView({ lang }: { lang: Lang }) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const name =
        data?.first_name ||
        data?.display_name?.split(" ")[0] ||
        user.email?.split("@")[0] ||
        "";
      setFirstName(name);
    })();
  }, [user]);

  return (
    <>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
        {firstName
          ? tx(lang, `Hoi ${firstName}!`, `Hi ${firstName}!`)
          : tx(lang, "Hoi!", "Hi!")}
      </h1>

      <DateHeading lang={lang} />
      <ClientStartMessageCard lang={lang} />
      <WeekStrip lang={lang} />
      <TodayTodos lang={lang} />
      <NutritionTodayCard lang={lang} />
      <GoalsSection lang={lang} />
      <QuickActions lang={lang} />
      <ProgressionSummary lang={lang} />
    </>
  );
}

