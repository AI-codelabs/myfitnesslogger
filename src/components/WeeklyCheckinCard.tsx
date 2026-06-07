import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, CheckCircle2, ArrowRight } from "lucide-react";
import {
  getExpectedCheckinWeekStart,
  getWeekEnd,
  isCheckinWindowOpen,
} from "@/lib/weeklyCheckin";

const ONE_HOUR = 60 * 60 * 1000;

export function WeeklyCheckinCard({ lang }: { lang: "nl" | "en" }) {
  const { user } = useAuth();
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const weekStart = getExpectedCheckinWeekStart();
  const weekEnd = getWeekEnd(weekStart);

  const tx = (nl: string, en: string) => (lang === "nl" ? nl : en);

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

  const windowOpen = isCheckinWindowOpen();
  const submittedDuringWindow =
    !!submittedAt && Date.now() - new Date(submittedAt).getTime() <= ONE_HOUR;

  // Outside the Sun/Mon NL window: only show the brief "thanks" confirmation
  // for an hour after submitting; otherwise hide.
  if (!windowOpen) {
    if (!submittedDuringWindow) return null;
    return (
      <Card className="p-4 sm:p-5 mb-4 border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">
            {tx("Bedankt voor je check-in! 🙌", "Thanks for your check-in! 🙌")}
          </p>
          <p className="text-sm text-muted-foreground">
            {tx(
              "Je coach bekijkt je antwoorden binnenkort.",
              "Your coach will review your answers soon.",
            )}
          </p>
        </div>
      </Card>
    );
  }

  // Window is open. If they already submitted this week, offer an update path.
  if (submittedAt) {
    return (
      <Card className="p-4 sm:p-5 mb-4 border-emerald-500/20 bg-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">
              {tx("Check-in van deze week ingevuld", "This week's check-in is in")}
            </p>
            <p className="text-sm text-muted-foreground">
              {tx(
                `Week ${weekStart} t/m ${weekEnd}. Nog iets aan te vullen? Je kunt je antwoorden bijwerken.`,
                `Week ${weekStart} through ${weekEnd}. Need to add something? You can still update your answers.`,
              )}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/check-in">
              {tx("Bijwerken", "Update")}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        </div>
      </Card>
    );
  }


  return (
    <Card className="p-4 sm:p-5 mb-4 border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">
            {tx("Tijd voor je wekelijkse check-in", "Time for your weekly check-in")}
          </p>
          <p className="text-sm text-muted-foreground">
            {tx(
              `Rond week ${weekStart} t/m ${weekEnd} af.`,
              `Complete the check-in for ${weekStart} through ${weekEnd}.`,
            )}
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/check-in">
            {tx("Start", "Start")}
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
