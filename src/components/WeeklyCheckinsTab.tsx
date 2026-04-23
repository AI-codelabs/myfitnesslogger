import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, ClipboardCheck, Star } from "lucide-react";
import { formatHumanDate } from "@/lib/weeklyCheckin";

interface Props {
  clientId: string;
  lang: "nl" | "en";
}

type Checkin = {
  id: string;
  week_start: string;
  submitted_at: string;
  training_count: string | null;
  training_count_other: string | null;
  intensity_rpe: number | null;
  progression: number | null;
  nutrition_stars: number | null;
  nutrition_deviations: string | null;
  cravings: string | null;
  sleep_cycle: string | null;
  sleep_cycle_other: string | null;
  energy: number | null;
  soreness: number | null;
  weight_kg: number | null;
  measurements: string | null;
  body_fat_pct: number | null;
  feeling: number | null;
  structure_planning: string | null;
  progress_feeling: string | null;
  obstacles: string | null;
  supplements_consistency: number | null;
  hydration: number | null;
  other_notes: string | null;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function Stars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

function Scale({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold">{value}</span>
      <span className="text-muted-foreground">/ 5</span>
    </span>
  );
}

function CheckinDetails({ c }: { c: Checkin }) {
  const trainingCount =
    c.training_count === "anders" ? c.training_count_other ?? "Anders" : c.training_count;
  const sleepCycle =
    c.sleep_cycle === "anders"
      ? c.sleep_cycle_other ?? "Anders"
      : c.sleep_cycle
        ? `Gemiddeld ${c.sleep_cycle}`
        : null;

  const groups: Array<{ title: string; fields: Array<[string, React.ReactNode]> }> = [
    {
      title: "Training",
      fields: [
        ["Trainingen deze week", trainingCount],
        ["Intensiteit (RPE)", <Scale value={c.intensity_rpe} />],
        ["Progressie", <Scale value={c.progression} />],
      ],
    },
    {
      title: "Voeding",
      fields: [
        ["Voedingsschema", <Stars value={c.nutrition_stars} />],
        ["Afwijkingen", c.nutrition_deviations],
        ["Cravings / energiedips", c.cravings],
      ],
    },
    {
      title: "Herstel & slaap",
      fields: [
        ["Sleep cycle", sleepCycle],
        ["Energie overdag", <Scale value={c.energy} />],
        ["Spierpijn / herstel", <Scale value={c.soreness} />],
      ],
    },
    {
      title: "Lichaam",
      fields: [
        ["Gewicht (kg)", c.weight_kg],
        ["Metingen", c.measurements],
        ["Vetpercentage", c.body_fat_pct],
      ],
    },
    {
      title: "Mentale staat",
      fields: [
        ["Gevoel deze week", <Scale value={c.feeling} />],
        ["Structuur / planning", c.structure_planning],
        ["Progressiegevoel", c.progress_feeling],
        ["Belemmeringen", c.obstacles],
      ],
    },
    {
      title: "Supplementen & overig",
      fields: [
        ["Supplementen consistent", <Scale value={c.supplements_consistency} />],
        ["Hydratatie", <Scale value={c.hydration} />],
        ["Overige notities", c.other_notes],
      ],
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      {groups.map((g) => {
        const visible = g.fields.filter(
          ([, v]) => v !== null && v !== undefined && v !== "",
        );
        if (visible.length === 0) return null;
        return (
          <div key={g.title} className="space-y-3">
            <p className="text-sm font-semibold">{g.title}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visible.map(([label, value], i) => (
                <Field key={i} label={label} value={value} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WeeklyCheckinsTab({ clientId, lang }: Props) {
  const [items, setItems] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("weekly_checkins")
        .select("*")
        .eq("client_id", clientId)
        .order("week_start", { ascending: false });
      setItems((data ?? []) as Checkin[]);
      setLoading(false);
    })();
  }, [clientId]);

  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="font-medium">{lang === "nl" ? "Nog geen check-ins" : "No check-ins yet"}</p>
        <p className="text-sm text-muted-foreground">
          {lang === "nl"
            ? "Zodra deze client een check-in invult verschijnt die hier."
            : "Once this client submits a check-in, it will appear here."}
        </p>
      </Card>
    );
  }

  const [latest, ...rest] = items;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              {lang === "nl" ? "Laatste check-in" : "Latest check-in"}
            </p>
            <p className="font-semibold">
              {lang === "nl" ? "Week van " : "Week of "}
              {formatHumanDate(latest.week_start, lang)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {lang === "nl" ? "Ingevuld " : "Submitted "}
            {formatHumanDate(latest.submitted_at, lang)}
          </p>
        </div>
        <div className="p-5">
          <CheckinDetails c={latest} />
        </div>
      </Card>

      {rest.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              {lang === "nl" ? "Geschiedenis" : "History"}
            </p>
          </div>
          <Accordion type="single" collapsible>
            {rest.map((c) => (
              <AccordionItem key={c.id} value={c.id} className="border-b last:border-b-0">
                <AccordionTrigger className="px-5 hover:no-underline">
                  <div className="flex items-center justify-between flex-1 pr-3">
                    <span className="font-medium">
                      {lang === "nl" ? "Week van " : "Week of "}
                      {formatHumanDate(c.week_start, lang)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatHumanDate(c.submitted_at, lang)}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5">
                  <CheckinDetails c={c} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}
    </div>
  );
}
