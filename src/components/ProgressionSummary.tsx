import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Flame, TrendingDown, TrendingUp, Minus } from "lucide-react";

interface Props {
  lang: "nl" | "en";
}

type Row = { week_start: string; weight_kg: number | null; body_fat_pct: number | null };


export function ProgressionSummary({ lang }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("weekly_checkins")
        .select("week_start,weight_kg,body_fat_pct")
        .eq("client_id", user.id)
        .order("week_start", { ascending: true });
      setRows((data as Row[]) ?? []);
    })();
  }, [user?.id]);

  const w = rows.filter((r) => r.weight_kg != null);
  const f = rows.filter((r) => r.body_fat_pct != null);
  const lastW = w.at(-1)?.weight_kg ?? null;
  const lastF = f.at(-1)?.body_fat_pct ?? null;
  const dW = w.length >= 2 ? (w.at(-1)!.weight_kg as number) - (w[0].weight_kg as number) : null;
  const dF =
    f.length >= 2 ? (f.at(-1)!.body_fat_pct as number) - (f[0].body_fat_pct as number) : null;

  const sinceStart = lang === "nl" ? "sinds start" : "since start";

  return (
    <div className="space-y-3 mb-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br from-secondary/15 to-secondary/5 blur-xl opacity-60" />
          <div className="relative space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {lang === "nl" ? "Gewicht" : "Weight"}
              </p>
              <Flame className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums">
                {lastW != null ? lastW.toFixed(1) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">kg</span>
            </div>
            {dW != null && (
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  dW < 0
                    ? "text-emerald-600"
                    : dW > 0
                      ? "text-orange-500"
                      : "text-muted-foreground"
                }`}
              >
                {dW < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : dW > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {dW > 0 ? "+" : ""}
                {dW.toFixed(1)} kg {sinceStart}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 relative overflow-hidden">
          <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 blur-xl opacity-60" />
          <div className="relative space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {lang === "nl" ? "Vet %" : "Body fat"}
              </p>
              <TrendingDown className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums">
                {lastF != null ? lastF.toFixed(1) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            {dF != null && (
              <div
                className={`flex items-center gap-1 text-xs font-medium ${
                  dF < 0
                    ? "text-emerald-600"
                    : dF > 0
                      ? "text-orange-500"
                      : "text-muted-foreground"
                }`}
              >
                {dF < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : dF > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {dF > 0 ? "+" : ""}
                {dF.toFixed(1)} % {sinceStart}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Button
        variant="outline"
        className="w-full justify-between h-11"
        onClick={() => navigate("/progression")}
      >
        <span>{lang === "nl" ? "Bekijk volledige progressie" : "See full progression"}</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
