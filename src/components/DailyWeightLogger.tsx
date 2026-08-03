import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { parseDecimal } from "@/lib/parseDecimal";

export type WeightLog = {
  id: string;
  logged_on: string;
  weight_kg: number;
  note: string | null;
};

interface Props {
  clientId: string;
  lang?: "nl" | "en";
  onChange?: () => void;
}

const t = (lang: "nl" | "en") => ({
  title: lang === "nl" ? "Dagelijks gewicht" : "Daily weight",
  subtitle:
    lang === "nl"
      ? "Log je gewicht zo vaak je wilt — los van de wekelijkse check-in."
      : "Log your weight as often as you want — separate from the weekly check-in.",
  date: lang === "nl" ? "Datum" : "Date",
  weight: lang === "nl" ? "Gewicht (kg)" : "Weight (kg)",
  note: lang === "nl" ? "Notitie (optioneel)" : "Note (optional)",
  save: lang === "nl" ? "Opslaan" : "Save",
  saving: lang === "nl" ? "Opslaan..." : "Saving...",
  recent: lang === "nl" ? "Recente metingen" : "Recent entries",
  none: lang === "nl" ? "Nog geen metingen." : "No entries yet.",
  saved: lang === "nl" ? "Gewicht opgeslagen" : "Weight saved",
  deleted: lang === "nl" ? "Verwijderd" : "Deleted",
  delete: lang === "nl" ? "Verwijderen" : "Delete",
  required: lang === "nl" ? "Vul een gewicht in" : "Enter a weight",
});

export function DailyWeightLogger({ clientId, lang = "nl", onChange }: Props) {
  const L = t(lang);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("weight_logs")
      .select("id,logged_on,weight_kg,note")
      .eq("client_id", clientId)
      .order("logged_on", { ascending: false })
      .limit(10);
    setLogs((data as WeightLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const save = async () => {
    const w = parseDecimal(weight);
    if (w == null || w <= 0) {
      toast.error(L.required);
      return;
    }
    setSaving(true);
    let error: unknown = null;
    try {
      const res = await supabase
        .from("weight_logs")
        .upsert(
          {
            client_id: clientId,
            logged_on: date,
            weight_kg: w,
            note: note.trim() || null,
          },
          { onConflict: "client_id,logged_on" },
        );
      error = res.error;
    } catch (e) {
      error = e;
    }
    setSaving(false);
    if (error) {
      console.error("[weight-log] save failed", error);
      toast.error(describeWriteError(error, lang));
      return;
    }
    toast.success(L.saved);
    setWeight("");
    setNote("");
    setDate(today);
    await load();
    onChange?.();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("weight_logs").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(L.deleted);
    await load();
    onChange?.();
  };

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
          <Scale className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold">{L.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{L.subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="wl-date" className="text-xs">{L.date}</Label>
          <Input
            id="wl-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 text-base appearance-none [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-[1.5rem]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wl-weight" className="text-xs">{L.weight}</Label>
          <Input
            id="wl-weight"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="bv. 78,4 of 78.4"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="h-12 text-base"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wl-note" className="text-xs">{L.note}</Label>
        <Input
          id="wl-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={lang === "nl" ? "bv. na training" : "e.g. after workout"}
          className="h-12 text-base"
        />
      </div>
      <Button onClick={save} disabled={saving} className="w-full h-12 text-base">
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Plus className="h-4 w-4 mr-2" />
        )}
        {saving ? L.saving : L.save}
      </Button>

      <div className="pt-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
          {L.recent}
        </p>
        {loading ? (
          <div className="h-16 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">{L.none}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {logs.map((l) => (
              <li key={l.id} className="flex items-start gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-sm font-semibold tabular-nums">
                      {Number(l.weight_kg).toFixed(1)} kg
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(l.logged_on).toLocaleDateString(
                        lang === "nl" ? "nl-NL" : "en-US",
                        { day: "2-digit", month: "short", year: "numeric" },
                      )}
                    </p>
                  </div>
                  {l.note && (
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">
                      {l.note}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 -mr-1 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => remove(l.id)}
                  aria-label={L.delete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
